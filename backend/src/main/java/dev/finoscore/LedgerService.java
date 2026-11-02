package dev.finoscore;

import tools.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class LedgerService {
    public record TransferRequest(String sourceId, String destinationId, String amountMinor, String currency, String reference, String quoteId) {}
    public record Result(Map<String,Object> receipt, boolean replayed, String tier) {}
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final ObjectMapper json;
    private final StringRedisTemplate redis;
    private final boolean redisEnabled;
    private final MeterRegistry metrics;
    private final Semaphore permits = new Semaphore(32,true);
    private final AtomicLong cacheRetryAfter = new AtomicLong();
    public LedgerService(JdbcTemplate db, TransactionTemplate tx, ObjectMapper json, StringRedisTemplate redis,
                         @Value("${finos.redis-enabled}") boolean redisEnabled, MeterRegistry metrics) {
        this.db=db; this.tx=tx; this.json=json; this.redis=redis; this.redisEnabled=redisEnabled; this.metrics=metrics;
    }
    public static ResponseStatusException fail(int code,String detail) { return new ResponseStatusException(HttpStatus.valueOf(code),detail); }
    public static UUID uuid(String value) { try { return UUID.fromString(value); } catch(Exception e) { throw fail(400,"Invalid account or quote identifier"); } }
    public static long minor(String value) {
        if(value==null || !value.matches("[1-9][0-9]{0,14}")) throw fail(400,"Amount must be a positive integer string in minor units, at most 15 digits");
        return Long.parseLong(value);
    }
    public String encode(Object obj) { try { return json.writeValueAsString(obj); } catch(Exception e) { throw new IllegalStateException(e); } }
    @SuppressWarnings("unchecked") public Map<String,Object> decode(String text) { try { return json.readValue(text,Map.class); } catch(Exception e) { throw new IllegalStateException(e); } }
    public String cacheStatus() { return !redisEnabled ? "DISABLED" : System.currentTimeMillis()<cacheRetryAfter.get() ? "OPEN / POSTGRES FALLBACK" : "ENABLED"; }
    public Result transfer(String key,TransferRequest r) {
        if(r==null) throw fail(400,"A transfer request body is required");
        if(key==null || !key.matches("[A-Za-z0-9:_-]{8,128}")) throw fail(400,"Idempotency-Key must contain 8–128 letters, digits, colon, underscore or hyphen");
        UUID source=uuid(r.sourceId()),dest=uuid(r.destinationId());
        if(source.equals(dest)) throw fail(400,"Source and destination must differ");
        if(source.toString().endsWith("000000000001") || dest.toString().endsWith("000000000001")) throw fail(400,"Opening equity is not an operational account");
        long original=minor(r.amountMinor());
        if(r.reference()==null || !r.reference().matches("[A-Za-z0-9:_-]{1,100}")) throw fail(400,"Reference must contain 1–100 letters, digits, colon, underscore or hyphen");
        if(r.reference().startsWith("OPENING-")) throw fail(400,"The OPENING- reference prefix is reserved for database initialization");
        if(!Set.of("INR","USD","EUR","GBP").contains(Objects.toString(r.currency(),""))) throw fail(400,"Unsupported input currency");
        if("INR".equals(r.currency()) && r.quoteId()!=null) throw fail(400,"INR transfers do not require an FX quote");
        String hash;
        try { hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(encode(Arrays.asList(source.toString(),dest.toString(),Long.toString(original),r.currency(),r.reference(),r.quoteId())).getBytes(StandardCharsets.UTF_8))); }
        catch(Exception e) { throw new IllegalStateException(e); }
        if(redisEnabled && System.currentTimeMillis()>=cacheRetryAfter.get()) {
            try {
                String cached=redis.opsForValue().get("finos:idempotency:"+key);
                if(cached!=null) {
                    Map<String,Object> c=decode(cached);
                    if(!hash.equals(c.get("hash"))) throw fail(422,"Idempotency key was already used with a different request");
                    metrics.counter("ledger.replays","tier","redis").increment();
                    return new Result(decode(c.get("receipt").toString()),true,"REDIS");
                }
            } catch(ResponseStatusException e) { throw e; }
              catch(Exception e) { cacheRetryAfter.set(System.currentTimeMillis()+10000); metrics.counter("ledger.cache.failures").increment(); }
        }
        boolean acquired=false;
        long start=System.nanoTime();
        try {
            acquired=permits.tryAcquire(100,TimeUnit.MILLISECONDS);
            if(!acquired) throw fail(503,"Ledger capacity temporarily exceeded; retry with the same key");
            Result result=tx.execute(status -> {
                db.execute("SET LOCAL lock_timeout = '2000ms'");
                int claimed=db.update("INSERT INTO idempotency_keys(key,request_hash) VALUES (?,?) ON CONFLICT DO NOTHING",key,hash);
                Map<String,Object> existing=db.queryForMap("SELECT request_hash,response::text FROM idempotency_keys WHERE key=? FOR UPDATE",key);
                if(!hash.equals(existing.get("request_hash"))) throw fail(422,"Idempotency key was already used with a different request");
                if(existing.get("response")!=null) {
                    metrics.counter("ledger.replays","tier","postgres").increment();
                    return new Result(decode(existing.get("response").toString()),true,"POSTGRES");
                }
                if(claimed==0) throw fail(409,"Request is in progress; retry with the same key");
                long amount=original;
                java.math.BigDecimal rate=java.math.BigDecimal.ONE;
                UUID quoteId=null;
                if(!"INR".equals(r.currency())) {
                    quoteId=uuid(r.quoteId());
                    var quotes=db.queryForList("SELECT amount,rate FROM fx_quotes WHERE id=? AND currency=? AND original_amount=? AND expires_at>now()",quoteId,r.currency(),original);
                    if(quotes.isEmpty()) throw fail(422,"FX quote is missing, expired, or belongs to another amount; obtain a fresh quote");
                    amount=((Number)quotes.getFirst().get("amount")).longValue(); rate=(java.math.BigDecimal)quotes.getFirst().get("rate");
                }
                var locked=db.queryForList("SELECT id,balance,status FROM accounts WHERE id IN (?,?) ORDER BY id FOR UPDATE",source,dest);
                if(locked.size()!=2) throw fail(404,"Account not found");
                var from=locked.stream().filter(a->source.equals(a.get("id"))).findFirst().orElseThrow();
                var to=locked.stream().filter(a->dest.equals(a.get("id"))).findFirst().orElseThrow();
                if(locked.stream().anyMatch(a->!"ACTIVE".equals(a.get("status")))) throw fail(422,"Both accounts must be active");
                long balance=((Number)from.get("balance")).longValue();
                if(balance<amount) throw fail(422,"Insufficient funds in source account");
                Math.addExact(((Number)to.get("balance")).longValue(),amount);
                UUID id=UUID.randomUUID(),event=UUID.randomUUID();
                String trace=UUID.randomUUID().toString().replace("-","");
                db.update("INSERT INTO transfers(id,reference,source_id,destination_id,amount,original_amount,original_currency,fx_rate,quote_id,trace_id) VALUES (?,?,?,?,?,?,?,?,?,?)",id,r.reference(),source,dest,amount,original,r.currency(),rate,quoteId,trace);
                db.update("UPDATE accounts SET balance=balance-?,version=version+1 WHERE id=?",amount,source);
                db.update("UPDATE accounts SET balance=balance+?,version=version+1 WHERE id=?",amount,dest);
                db.update("INSERT INTO ledger_entries(transfer_id,account_id,signed_amount) VALUES (?,?,?),(?,?,?)",id,source,-amount,id,dest,amount);
                Map<String,Object> receipt=new LinkedHashMap<>();
                receipt.put("transactionId",id.toString()); receipt.put("reference",r.reference());
                receipt.put("sourceId",source.toString()); receipt.put("destinationId",dest.toString());
                receipt.put("amountMinor",Long.toString(amount)); receipt.put("currency","INR");
                receipt.put("originalAmountMinor",r.amountMinor()); receipt.put("originalCurrency",r.currency());
                receipt.put("fxRate",rate.toPlainString()); receipt.put("quoteId",r.quoteId());
                receipt.put("status","POSTED"); receipt.put("traceId",trace); receipt.put("eventId",event.toString());
                receipt.put("settledAt",java.time.Instant.now().toString());
                String body=encode(receipt);
                db.update("INSERT INTO outbox(id,transfer_id,payload,trace_id) VALUES (?,?,?::jsonb,?)",event,id,body,trace);
                db.update("UPDATE idempotency_keys SET response=?::jsonb WHERE key=?",body,key);
                return new Result(receipt,false,"POSTGRES");
            });
            if(redisEnabled && System.currentTimeMillis()>=cacheRetryAfter.get()) {
                try { redis.opsForValue().set("finos:idempotency:"+key,encode(Map.of("hash",hash,"receipt",encode(result.receipt()))),Duration.ofHours(24)); }
                catch(Exception e) { cacheRetryAfter.set(System.currentTimeMillis()+10000); }
            }
            if(!result.replayed()) metrics.counter("ledger.transfers.committed").increment();
            return result;
        } catch(InterruptedException e) { Thread.currentThread().interrupt(); throw fail(503,"Request interrupted; retry with the same key"); }
        finally { if(acquired) permits.release(); metrics.timer("ledger.transfer.duration").record(System.nanoTime()-start,TimeUnit.NANOSECONDS); }
    }
    public Map<String,Object> reconcile() {
        return tx.execute(status -> {
            db.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
            String sum=db.queryForObject("SELECT coalesce(sum(signed_amount),0)::text FROM ledger_entries",String.class);
            Long broken=db.queryForObject("SELECT count(*) FROM (SELECT t.id FROM transfers t LEFT JOIN ledger_entries l ON l.transfer_id=t.id GROUP BY t.id HAVING count(l.id)<>2 OR coalesce(sum(l.signed_amount),0)<>0) x",Long.class);
            var drift=db.queryForList("SELECT a.id,a.name,a.balance::text,coalesce(sum(l.signed_amount),0)::text AS reconstructed,(a.balance-coalesce(sum(l.signed_amount),0))::text AS drift FROM accounts a LEFT JOIN ledger_entries l ON l.account_id=a.id GROUP BY a.id HAVING a.balance<>coalesce(sum(l.signed_amount),0)");
            return Map.of("healthy","0".equals(sum)&&broken==0&&drift.isEmpty(),"globalSumMinor",sum,"unbalancedTransfers",broken,"accountDrift",drift,"checkedAt",java.time.Instant.now().toString());
        });
    }
    public void freeze(String id,boolean frozen) {
        UUID account=uuid(id);
        tx.executeWithoutResult(s -> {
            int n=db.update("UPDATE accounts SET status=?,version=version+1 WHERE id=? AND NOT allow_overdraft",frozen?"FROZEN":"ACTIVE",account);
            if(n==0) throw fail(404,"Operational account not found");
            db.update("INSERT INTO operator_audit(action,account_id,detail) VALUES (?,?,?::jsonb)",frozen?"FREEZE":"UNFREEZE",account,encode(Map.of("origin","local operator")));
        });
    }
}

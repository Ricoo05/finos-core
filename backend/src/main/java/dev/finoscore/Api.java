package dev.finoscore;

import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.scheduling.annotation.Scheduled;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;

@RestController
@RequestMapping("/api")
public class Api {
    private final LedgerService ledger; private final JdbcTemplate db;
    private final EventPipeline pipeline; private final MarketService market;
    private final List<SseEmitter> clients=new CopyOnWriteArrayList<>();
    public Api(LedgerService ledger,JdbcTemplate db,EventPipeline pipeline,MarketService market) { this.ledger=ledger;this.db=db;this.pipeline=pipeline;this.market=market; }
    @PostMapping("/transfers")
    public ResponseEntity<?> transfer(@RequestHeader(value="Idempotency-Key",required=false) String key,@RequestBody LedgerService.TransferRequest request) {
        var result=ledger.transfer(key,request);
        return ResponseEntity.status(201).header("Idempotent-Replayed",Boolean.toString(result.replayed())).header("X-Served-By",result.tier()).body(Map.of("receipt",result.receipt(),"replayed",result.replayed(),"servedBy",result.tier()));
    }
    @GetMapping("/state") public Map<String,Object> state() {
        var accounts=db.queryForList("SELECT a.id,a.name,a.status,a.balance::text,a.version,coalesce(r.inflow,0)::text AS inflow,coalesce(r.outflow,0)::text AS outflow,coalesce(r.events,0) AS events FROM accounts a LEFT JOIN risk_flows r ON r.account_id=a.id WHERE NOT a.allow_overdraft ORDER BY a.id");
        var transfers=db.queryForList("SELECT t.id,t.reference,s.name AS source,d.name AS destination,t.amount::text,t.original_amount::text,t.original_currency,t.fx_rate::text,t.trace_id,t.created_at FROM transfers t JOIN accounts s ON s.id=t.source_id JOIN accounts d ON d.id=t.destination_id ORDER BY t.created_at DESC LIMIT 80");
        var journal=db.queryForList("SELECT l.id,l.transfer_id,a.name AS account,l.signed_amount::text,l.created_at FROM ledger_entries l JOIN accounts a ON a.id=l.account_id ORDER BY l.id DESC LIMIT 120");
        var outbox=db.queryForList("SELECT id,transfer_id,status,attempts,last_error,created_at,processed_at FROM outbox ORDER BY created_at DESC LIMIT 60");
        var counts=db.queryForMap("SELECT (SELECT count(*) FROM transfers WHERE reference NOT LIKE 'OPENING-%') AS transfers,(SELECT count(*) FROM ledger_entries) AS journal_entries,(SELECT count(*) FROM outbox WHERE status='PENDING') AS pending,(SELECT count(*) FROM inbox) AS consumed,(SELECT coalesce(sum(amount),0)::text FROM transfers WHERE reference NOT LIKE 'OPENING-%') AS volume,(SELECT coalesce(extract(epoch FROM now()-min(created_at)),0) FROM outbox WHERE status='PENDING') AS oldest_pending_seconds");
        var activity=db.queryForList("SELECT date_trunc('minute',created_at) AS minute,count(*) AS count FROM transfers WHERE created_at>now()-interval '30 minutes' AND reference NOT LIKE 'OPENING-%' GROUP BY 1 ORDER BY 1");
        counts.put("committed_events",db.queryForObject("SELECT count(*) FROM outbox",Long.class));
        counts.put("unprojected_events",db.queryForObject("SELECT count(*) FROM outbox o LEFT JOIN inbox i ON i.event_id=o.id WHERE i.event_id IS NULL",Long.class));
        Map<String,Object> state=new LinkedHashMap<>();
        state.put("accounts",accounts);state.put("transfers",transfers);state.put("journal",journal);state.put("outbox",outbox);state.put("counts",counts);state.put("activity",activity);
        state.put("deadLetters",db.queryForList("SELECT id,topic,partition_id,offset_id,error,created_at FROM dead_letters ORDER BY id DESC LIMIT 30"));
        state.put("reconciliation",ledger.reconcile());state.put("market",market.market());
        state.put("system",Map.of("database","PostgreSQL","runtime",System.getProperty("java.version"),"eventMode",pipeline.mode,"relayPaused",pipeline.paused,"relayError",Objects.toString(pipeline.lastError,""),"cache",ledger.cacheStatus(),"serverTime",java.time.Instant.now().toString()));
        return state;
    }
    @GetMapping("/reconciliation") public Map<String,Object> reconcile() { return ledger.reconcile(); }
    @PostMapping("/accounts/{id}/status") public Map<String,Object> status(@PathVariable String id,@RequestBody Map<String,Boolean> request) {
        if(!request.containsKey("frozen") || request.get("frozen")==null) throw LedgerService.fail(400,"frozen is required");
        ledger.freeze(id,request.get("frozen"));return Map.of("updated",true);
    }
    @GetMapping("/market") public Map<String,Object> market() { return market.market(); }
    @PostMapping("/quotes") public Map<String,Object> quote(@RequestBody Map<String,String> r) { return market.quote(Objects.toString(r.get("currency"),""),r.get("amountMinor")); }
    @PostMapping("/pipeline/pause") public Map<String,Object> pause(@RequestBody Map<String,Boolean> r) {
        if(!r.containsKey("paused") || r.get("paused")==null) throw LedgerService.fail(400,"paused is required");
        pipeline.paused=r.get("paused"); db.update("INSERT INTO operator_audit(action,detail) VALUES ('RELAY_PAUSE',?::jsonb)",ledger.encode(r));
        return Map.of("paused",pipeline.paused);
    }
    @PostMapping("/pipeline/replay/{id}") public Map<String,Object> replay(@PathVariable String id) {
        var rows=db.queryForList("SELECT payload::text FROM outbox WHERE id=?",LedgerService.uuid(id));
        if(rows.isEmpty()) throw LedgerService.fail(404,"Event not found");
        pipeline.consume(rows.getFirst().get("payload").toString());
        return Map.of("delivered",true,"detail","Durable inbox deduplication prevents a second risk update");
    }
    @GetMapping(value="/events",produces=MediaType.TEXT_EVENT_STREAM_VALUE) public SseEmitter events() {
        SseEmitter emitter=new SseEmitter(300000L);clients.add(emitter);
        emitter.onCompletion(()->clients.remove(emitter));emitter.onTimeout(()->clients.remove(emitter));emitter.onError(e->clients.remove(emitter));
        try { emitter.send(SseEmitter.event().name("refresh").data("connected")); } catch(Exception e) { clients.remove(emitter); }
        return emitter;
    }
    @Scheduled(fixedDelay=2000) public void notifyClients() {
        for(var e:clients) try { e.send(SseEmitter.event().name("refresh").data(java.time.Instant.now().toString())); } catch(Exception ex) { clients.remove(e);e.complete(); }
    }
}

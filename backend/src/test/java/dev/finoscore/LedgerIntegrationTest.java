package dev.finoscore;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties={"finos.market-enabled=false"})
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class LedgerIntegrationTest {
    @Autowired LedgerService ledger;
    @Autowired JdbcTemplate db;
    @Autowired TransactionTemplate tx;
    @Autowired EventPipeline pipeline;
    @Autowired MarketService market;
    String a,b;
    static final String ATLAS="00000000-0000-0000-0000-000000000101";
    @BeforeEach void setup() {
        assertTrue(db.queryForObject("select current_database()",String.class).endsWith("_test"),"Tests must use an isolated _test database");
        pipeline.paused=true;
        a=UUID.randomUUID().toString(); b=UUID.randomUUID().toString();
        db.update("INSERT INTO accounts(id,name) VALUES (?,'TEST-A'),(?,'TEST-B')",UUID.fromString(a),UUID.fromString(b));
        ledger.transfer(key(),request(ATLAS,a,"10000000"));
    }
    String key(){return UUID.randomUUID().toString();}
    @AfterEach void returnFixtureFunds() {
        for(String id:Arrays.asList(a,b)) {
            if(id==null) continue;
            ledger.freeze(id,false);
            long remaining=balance(id);
            if(remaining>0) ledger.transfer(key(),request(id,ATLAS,Long.toString(remaining)));
        }
    }
    LedgerService.TransferRequest request(String from,String to,String amount){return new LedgerService.TransferRequest(from,to,amount,"INR","TEST-"+key(),null);}
    long balance(String id){return db.queryForObject("SELECT balance FROM accounts WHERE id=?",Long.class,UUID.fromString(id));}
    long count(String table){return db.queryForObject("SELECT count(*) FROM "+table,Long.class);}
    void ownerSql(String sql) throws Exception {
        try(var c=DriverManager.getConnection(System.getenv("DB_URL"),System.getenv("MIGRATION_USER"),System.getenv("MIGRATION_PASSWORD"));var s=c.createStatement()){s.execute(sql);}
    }
    LedgerService.Result retry(String k,LedgerService.TransferRequest r) {
        for(int i=0;i<30;i++)try{return ledger.transfer(k,r);}catch(ResponseStatusException e){
            if(e.getStatusCode().value()!=503)throw e;
            try{Thread.sleep(20L*(i+1));}catch(InterruptedException ex){Thread.currentThread().interrupt();throw new RuntimeException(ex);}
        }
        throw new AssertionError("Capacity did not recover");
    }
    @Test void balancedPostingAndDurableReplay() {
        String k=key();var r=request(a,b,"12345");long before=count("ledger_entries");
        var first=ledger.transfer(k,r);var replay=ledger.transfer(k,r);
        assertFalse(first.replayed());assertTrue(replay.replayed());assertEquals(first.receipt(),replay.receipt());
        assertEquals(9987655,balance(a));assertEquals(12345,balance(b));assertEquals(before+2,count("ledger_entries"));
        assertEquals(true,ledger.reconcile().get("healthy"));
    }
    @Test void mismatchedPayloadAndDuplicateReferenceRejectWithoutMutation() {
        String k=key();var r=request(a,b,"100");ledger.transfer(k,r);long before=balance(a);
        var changed=new LedgerService.TransferRequest(a,b,"101","INR",r.reference(),null);
        assertEquals(422,assertThrows(ResponseStatusException.class,()->ledger.transfer(k,changed)).getStatusCode().value());
        assertThrows(org.springframework.dao.DuplicateKeyException.class,()->ledger.transfer(key(),r));assertEquals(before,balance(a));
    }
    @Test void rejectsInvalidInputsAndFrozenAccounts() {
        assertThrows(ResponseStatusException.class,()->ledger.transfer(key(),null));
        assertThrows(ResponseStatusException.class,()->ledger.transfer(key(),new LedgerService.TransferRequest(a,b,"1","INR","OPENING-FAKE",null)));
        for(String value:Arrays.asList("0","-1","1.5","NaN","1000000000000000",null))assertThrows(ResponseStatusException.class,()->ledger.transfer(key(),request(a,b,value)));
        assertThrows(ResponseStatusException.class,()->ledger.transfer(key(),request(a,a,"10")));
        assertThrows(ResponseStatusException.class,()->ledger.transfer(key(),request(a,key(),"10")));
        ledger.freeze(b,true);assertThrows(ResponseStatusException.class,()->ledger.transfer(key(),request(a,b,"10")));ledger.freeze(b,false);
        assertEquals(0,balance(b));assertEquals(true,ledger.reconcile().get("healthy"));
    }
    @Test void concurrentIdenticalRetriesCommitOnce() throws Exception {
        String k=key();var r=request(a,b,"10000");long before=count("transfers");
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()){
            var gate=new CountDownLatch(1);var futures=new ArrayList<Future<LedgerService.Result>>();
            for(int i=0;i<50;i++)futures.add(pool.submit(()->{gate.await();return retry(k,r);}));gate.countDown();
            var ids=new HashSet<>();int commits=0;
            for(var f:futures){var result=f.get(30,TimeUnit.SECONDS);ids.add(result.receipt().get("transactionId"));if(!result.replayed())commits++;}
            assertEquals(1,ids.size());assertEquals(1,commits);assertEquals(before+1,count("transfers"));assertEquals(10000,balance(b));
        }
    }
    @Test void fiftyConcurrentWithdrawalsAllowExactlyFive() throws Exception {
        ledger.transfer(key(),request(a,b,"50000"));
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()){
            var gate=new CountDownLatch(1);var futures=new ArrayList<Future<Integer>>();
            for(int i=0;i<50;i++)futures.add(pool.submit(()->{gate.await();try{retry(key(),request(b,a,"10000"));return 201;}catch(ResponseStatusException e){return e.getStatusCode().value();}}));gate.countDown();
            int success=0,rejected=0;for(var f:futures){int s=f.get(30,TimeUnit.SECONDS);if(s==201)success++;if(s==422)rejected++;}
            assertEquals(5,success);assertEquals(45,rejected);assertEquals(0,balance(b));assertEquals(true,ledger.reconcile().get("healthy"));
        }
    }
    @Test void twoHundredOpposingTransfersPreserveBalances() throws Exception {
        ledger.transfer(key(),request(a,b,"1000000"));long beforeA=balance(a),beforeB=balance(b);
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()){
            var gate=new CountDownLatch(1);var futures=new ArrayList<Future<?>>();
            for(int i=0;i<200;i++){boolean forward=i%2==0;futures.add(pool.submit(()->{gate.await();return retry(key(),request(forward?a:b,forward?b:a,"1000"));}));}gate.countDown();
            for(var f:futures)f.get(60,TimeUnit.SECONDS);
        }
        assertEquals(beforeA,balance(a));assertEquals(beforeB,balance(b));assertEquals(true,ledger.reconcile().get("healthy"));
    }
    @Test void databaseRejectsUnbalancedPostingAndHistoryEdits() {
        assertThrows(org.springframework.dao.DataAccessException.class,()->tx.executeWithoutResult(s->{
            var tid=UUID.randomUUID();db.update("INSERT INTO transfers(id,reference,source_id,destination_id,amount,original_amount,original_currency,fx_rate,trace_id) VALUES (?,?,?,?,10,10,'INR',1,?)",tid,"BROKEN-"+key(),UUID.fromString(a),UUID.fromString(b),key().replace("-",""));
        }));
        assertThrows(org.springframework.dao.DataAccessException.class,()->db.update("UPDATE ledger_entries SET signed_amount=1 WHERE id=(SELECT min(id) FROM ledger_entries)"));
        assertThrows(org.springframework.dao.DataAccessException.class,()->db.update("UPDATE accounts SET balance=balance+1 WHERE id=?",UUID.fromString(a)));
        assertEquals(true,ledger.reconcile().get("healthy"));
    }
    void assertPermissionDenied(org.junit.jupiter.api.function.Executable action) {
        var error=assertThrows(org.springframework.dao.DataAccessException.class,action);
        assertInstanceOf(SQLException.class,error.getMostSpecificCause());
        assertEquals("42501",((SQLException)error.getMostSpecificCause()).getSQLState());
    }
    @Test void runtimeRoleCannotRewritePolicyHashesOrEventPayloads() {
        var result=ledger.transfer(key(),request(a,b,"1234"));
        UUID event=UUID.fromString(result.receipt().get("eventId").toString());
        assertPermissionDenied(()->db.update("UPDATE accounts SET allow_overdraft=true WHERE id=?",UUID.fromString(a)));
        assertPermissionDenied(()->db.update("UPDATE accounts SET currency='USD' WHERE id=?",UUID.fromString(a)));
        assertPermissionDenied(()->db.update("UPDATE idempotency_keys SET request_hash='tampered'"));
        assertPermissionDenied(()->db.update("UPDATE outbox SET payload='{}'::jsonb WHERE id=?",event));
        assertPermissionDenied(()->db.update("INSERT INTO accounts(id,name,allow_overdraft) VALUES (?,'UNSAFE',true)",UUID.randomUUID()));
        assertEquals(true,ledger.reconcile().get("healthy"));
    }
    @Test void outboxFailureRollsBackMoneyAndIdempotencyClaim() throws Exception {
        long before=balance(a),entries=count("ledger_entries");String k=key();var r=request(a,b,"1234");
        ownerSql("CREATE FUNCTION test_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Injected outbox failure'; END$$; CREATE TRIGGER test_fail BEFORE INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION test_fail_outbox();");
        try{assertThrows(org.springframework.dao.DataAccessException.class,()->ledger.transfer(k,r));}
        finally{ownerSql("DROP TRIGGER test_fail ON outbox; DROP FUNCTION test_fail_outbox();");}
        assertEquals(before,balance(a));assertEquals(entries,count("ledger_entries"));
        assertEquals(0,db.queryForObject("SELECT count(*) FROM idempotency_keys WHERE key=?",Integer.class,k));
        assertFalse(ledger.transfer(k,r).replayed());
    }
    @Test void durableInboxDeduplicatesAndRelayRecoversBacklog() {
        var result=ledger.transfer(key(),request(a,b,"555"));String event=result.receipt().get("eventId").toString();
        String payload=db.queryForObject("SELECT payload::text FROM outbox WHERE id=?",String.class,UUID.fromString(event));
        pipeline.consume(payload);long n=db.queryForObject("SELECT events FROM risk_flows WHERE account_id=?",Long.class,UUID.fromString(b));
        pipeline.consume(payload);assertEquals(n,db.queryForObject("SELECT events FROM risk_flows WHERE account_id=?",Long.class,UUID.fromString(b)));
        assertTrue(db.queryForObject("SELECT count(*) FROM outbox WHERE status='PENDING'",Long.class)>0);
        pipeline.paused=false;for(int i=0;i<30;i++)pipeline.relay();pipeline.paused=true;
        assertEquals(0,db.queryForObject("SELECT count(*) FROM outbox WHERE status='PENDING'",Integer.class));
    }
    @Test void fxQuoteUsesExactRoundingAndReplaySurvivesExpiry() throws Exception {
        String snapshot="{\"result\":\"success\",\"time_last_update_unix\":"+Instant.now().getEpochSecond()+",\"rates\":{\"INR\":83.005,\"EUR\":0.9,\"GBP\":0.8}}";
        db.update("INSERT INTO market_snapshots(provider,payload) VALUES ('ExchangeRate-API',?::jsonb) ON CONFLICT(provider) DO UPDATE SET payload=EXCLUDED.payload",snapshot);
        var quote=market.quote("USD","1");assertEquals("83",quote.get("settlementAmountMinor"));
        var request=new LedgerService.TransferRequest(a,b,"1","USD","FX-"+key(),quote.get("quoteId").toString());String k=key();
        var first=ledger.transfer(k,request);
        ownerSql("UPDATE fx_quotes SET expires_at=now()-interval '1 second' WHERE id='"+quote.get("quoteId")+"'");
        assertEquals(first.receipt(),ledger.transfer(k,request).receipt());
        var newRequest=new LedgerService.TransferRequest(a,b,"1","USD","FX-"+key(),request.quoteId());
        assertEquals(422,assertThrows(ResponseStatusException.class,()->ledger.transfer(key(),newRequest)).getStatusCode().value());
    }
}

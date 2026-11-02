package dev.finoscore;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties={"finos.redis-enabled=true","spring.data.redis.port=${TEST_REDIS_PORT:16380}","spring.data.redis.password=${TEST_REDIS_PASSWORD:}","finos.market-enabled=false"})
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class RedisHealthyIT {
    @Autowired LedgerService ledger;
    @Autowired JdbcTemplate db;
    @Autowired StringRedisTemplate redis;

    @Test void realCacheReplaysRejectsTamperAndRecoversAfterEviction() {
        assertTrue(db.queryForObject("select current_database()",String.class).endsWith("_test"));
        try(var connection=redis.getConnectionFactory().getConnection()) { assertEquals("PONG",connection.ping()); }
        String key=UUID.randomUUID().toString(),cacheKey="finos:idempotency:"+key;
        var request=new LedgerService.TransferRequest("00000000-0000-0000-0000-000000000101","00000000-0000-0000-0000-000000000102","19","INR","REDIS-HEALTHY-"+key,null);
        try {
            var first=ledger.transfer(key,request);
            assertFalse(first.replayed());assertEquals("POSTGRES",first.tier());
            assertTrue(Boolean.TRUE.equals(redis.hasKey(cacheKey)));
            Long ttl=redis.getExpire(cacheKey);assertNotNull(ttl);assertTrue(ttl>0 && ttl<=86400);
            var cached=ledger.transfer(key,request);
            assertTrue(cached.replayed());assertEquals("REDIS",cached.tier());assertEquals(first.receipt(),cached.receipt());
            var changed=new LedgerService.TransferRequest(request.sourceId(),request.destinationId(),"20","INR",request.reference(),null);
            assertEquals(422,assertThrows(ResponseStatusException.class,()->ledger.transfer(key,changed)).getStatusCode().value());
            assertTrue(Boolean.TRUE.equals(redis.delete(cacheKey)));
            var durable=ledger.transfer(key,request);
            assertTrue(durable.replayed());assertEquals("POSTGRES",durable.tier());assertEquals(first.receipt(),durable.receipt());
            assertEquals("REDIS",ledger.transfer(key,request).tier());
            assertEquals(1,db.queryForObject("SELECT count(*) FROM transfers WHERE reference=?",Integer.class,request.reference()));
            assertEquals(2,db.queryForObject("SELECT count(*) FROM ledger_entries WHERE transfer_id=?",Integer.class,UUID.fromString(first.receipt().get("transactionId").toString())));
            assertEquals(true,ledger.reconcile().get("healthy"));
        } finally { redis.delete(cacheKey); }
    }
}

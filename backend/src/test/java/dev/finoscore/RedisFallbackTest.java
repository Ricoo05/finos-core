package dev.finoscore;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties={"finos.redis-enabled=true","spring.data.redis.port=16379","finos.market-enabled=false"})
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class RedisFallbackTest {
    @Autowired LedgerService ledger;
    @Autowired org.springframework.jdbc.core.JdbcTemplate db;
    @Test void unavailableRedisFallsBackToDurablePostgresReceipt() {
        assertTrue(db.queryForObject("select current_database()",String.class).endsWith("_test"),"Use an isolated _test database");
        String key=UUID.randomUUID().toString();
        var request=new LedgerService.TransferRequest("00000000-0000-0000-0000-000000000101","00000000-0000-0000-0000-000000000102","11","INR","REDIS-DOWN-"+key,null);
        var first=ledger.transfer(key,request);var replay=ledger.transfer(key,request);
        assertFalse(first.replayed());assertTrue(replay.replayed());assertEquals(first.receipt(),replay.receipt());assertEquals("POSTGRES",replay.tier());assertTrue(ledger.cacheStatus().contains("OPEN"));
    }
}

package dev.finoscore;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="TEST_KAFKA",matches="true")
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(properties={"finos.event-mode=kafka","finos.market-enabled=false","finos.kafka-topic=finos.integration.settlements","finos.kafka-dlt=finos.integration.dlt","spring.kafka.consumer.group-id=finos-integration-risk"})
class KafkaIntegrationTest {
    @Autowired LedgerService ledger; @Autowired JdbcTemplate db; @Autowired EventPipeline pipeline; @Autowired KafkaTemplate<String,String> kafka;
    void await(BooleanSupplier check) throws Exception {long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(30);while(!check.getAsBoolean()&&System.nanoTime()<until)Thread.sleep(100);assertTrue(check.getAsBoolean());}
    @Test void realBrokerDeliveryDuplicateAndPoisonQuarantine() throws Exception {
        assertTrue(db.queryForObject("select current_database()",String.class).endsWith("_test"));
        String key=UUID.randomUUID().toString();
        var result=ledger.transfer(key,new LedgerService.TransferRequest("00000000-0000-0000-0000-000000000101","00000000-0000-0000-0000-000000000102","7","INR","KAFKA-"+key,null));
        UUID event=UUID.fromString(result.receipt().get("eventId").toString());
        await(()->db.queryForObject("SELECT count(*) FROM inbox WHERE event_id=?",Integer.class,event)==1);
        String payload=db.queryForObject("SELECT payload::text FROM outbox WHERE id=?",String.class,event);
        kafka.send("finos.integration.settlements",event.toString(),payload).get(10,TimeUnit.SECONDS);
        await(()->"PROCESSED".equals(db.queryForObject("SELECT status FROM outbox WHERE id=?",String.class,event)));
        String poison="invalid-json-"+key;kafka.send("finos.integration.settlements",key,poison).get(10,TimeUnit.SECONDS);
        await(()->db.queryForObject("SELECT count(*) FROM dead_letters WHERE payload=?",Integer.class,poison)==1);
        assertEquals(1,db.queryForObject("SELECT count(*) FROM inbox WHERE event_id=?",Integer.class,event));
        assertEquals(true,ledger.reconcile().get("healthy"));
    }
}

package dev.finoscore;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Service
public class EventPipeline {
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final LedgerService ledger;
    private final KafkaTemplate<String,String> kafka;
    private final MeterRegistry metrics;
    public final String mode;
    @Value("${finos.kafka-topic:finos.settlements.v1}") private String topic;
    public volatile boolean paused=false;
    public volatile String lastError=null;
    public EventPipeline(JdbcTemplate db,TransactionTemplate tx,LedgerService ledger,KafkaTemplate<String,String> kafka,
                         MeterRegistry metrics,@Value("${finos.event-mode}") String mode) {
        if(!Set.of("postgres","kafka").contains(mode)) throw new IllegalArgumentException("EVENT_MODE must be postgres or kafka");
        this.db=db;this.tx=tx;this.ledger=ledger;this.kafka=kafka;this.metrics=metrics;this.mode=mode;
    }
    public void consume(String body) {
        Map<String,Object> e=ledger.decode(body);
        UUID event=UUID.fromString(e.get("eventId").toString());
        UUID source=UUID.fromString(e.get("sourceId").toString()),dest=UUID.fromString(e.get("destinationId").toString());
        long amount=LedgerService.minor(e.get("amountMinor").toString());
        tx.executeWithoutResult(status -> {
            int inserted=db.update("INSERT INTO inbox(event_id) VALUES (?) ON CONFLICT DO NOTHING",event);
            if(inserted==0) { metrics.counter("ledger.events.duplicates").increment(); return; }
            // Stable account order prevents opposite transfers deadlocking risk upserts.
            var ids=new ArrayList<>(List.of(source,dest)); ids.sort(Comparator.comparing(UUID::toString));
            for(UUID account:ids) db.update("INSERT INTO risk_flows(account_id,inflow,outflow,events) VALUES (?,?,?,1) ON CONFLICT(account_id) DO UPDATE SET inflow=risk_flows.inflow+EXCLUDED.inflow,outflow=risk_flows.outflow+EXCLUDED.outflow,events=risk_flows.events+1",account,account.equals(dest)?amount:0,account.equals(source)?amount:0);
        });
    }
    @KafkaListener(topics="${finos.kafka-topic:finos.settlements.v1}",autoStartup="#{'${finos.event-mode}' == 'kafka'}")
    public void onKafka(String body) { consume(body); }

    @Scheduled(fixedDelay=1000,initialDelay=1500)
    public void relay() {
        if(paused) return;
        try {
            tx.executeWithoutResult(status -> {
                var rows=db.queryForList("SELECT id,payload::text,trace_id FROM outbox WHERE status='PENDING' AND next_attempt_at<=now() ORDER BY created_at LIMIT 32 FOR UPDATE SKIP LOCKED");
                for(var row:rows) {
                    String payload=row.get("payload").toString();
                    if("kafka".equals(mode)) {
                        try {
                            var record=new org.apache.kafka.clients.producer.ProducerRecord<String,String>(topic,row.get("id").toString(),payload);
                            record.headers().add("traceparent",("00-"+row.get("trace_id")+"-"+UUID.randomUUID().toString().replace("-","").substring(0,16)+"-01").getBytes(java.nio.charset.StandardCharsets.UTF_8));
                            kafka.send(record).get(12,TimeUnit.SECONDS);
                        } catch(Exception e) { throw new IllegalStateException("Kafka unavailable; committed events remain pending",e); }
                    } else consume(payload);
                    db.update("UPDATE outbox SET status='PROCESSED',processed_at=clock_timestamp(),last_error=NULL WHERE id=?",row.get("id"));
                }
            });
            lastError=null;
        } catch(Exception e) { lastError="Event delivery failed; pending events retained for retry"; metrics.counter("ledger.relay.failures").increment(); }
    }
}

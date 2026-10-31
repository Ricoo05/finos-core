package dev.finoscore;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.config.TopicBuilder;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.util.backoff.FixedBackOff;
import java.util.concurrent.TimeUnit;

@org.springframework.context.annotation.Configuration
@ConditionalOnProperty(name="finos.event-mode",havingValue="kafka")
public class KafkaConfiguration {
    @org.springframework.beans.factory.annotation.Value("${finos.kafka-topic:finos.settlements.v1}") private String topic;
    @org.springframework.beans.factory.annotation.Value("${finos.kafka-dlt:finos.settlements.dlt}") private String dltTopic;
    @Bean NewTopic settlementsTopic(){return TopicBuilder.name(topic).partitions(3).replicas(1).build();}
    @Bean NewTopic deadLetterTopic(){return TopicBuilder.name(dltTopic).partitions(3).replicas(1).build();}
    @Bean DefaultErrorHandler kafkaErrorHandler(KafkaTemplate<String,String> kafka,JdbcTemplate db) {
        // Never acknowledge a poison event until both the broker DLT and durable quarantine succeed.
        return new DefaultErrorHandler((record,exception)->{
            String payload=String.valueOf(record.value());
            try {
                var dlt=new ProducerRecord<String,String>(dltTopic,record.partition(),String.valueOf(record.key()),payload);
                dlt.headers().add("source-offset",Long.toString(record.offset()).getBytes(java.nio.charset.StandardCharsets.UTF_8));
                kafka.send(dlt).get(12,TimeUnit.SECONDS);
                db.update("INSERT INTO dead_letters(topic,partition_id,offset_id,payload,error) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING",record.topic(),record.partition(),record.offset(),payload,exception.getClass().getSimpleName());
            } catch(Exception e) {throw new IllegalStateException("Quarantine unavailable; retain source record for retry",e);}
        },new FixedBackOff(1000,2));
    }
}

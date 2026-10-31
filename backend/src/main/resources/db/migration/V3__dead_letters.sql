CREATE TABLE dead_letters (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 topic TEXT NOT NULL, partition_id INT NOT NULL, offset_id BIGINT NOT NULL,
 payload TEXT NOT NULL, error TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(topic,partition_id,offset_id)
);
GRANT SELECT,INSERT ON dead_letters TO finos_app;
GRANT USAGE,SELECT ON SEQUENCE dead_letters_id_seq TO finos_app;

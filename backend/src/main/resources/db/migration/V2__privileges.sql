-- Migration credentials own the schema; the API role cannot edit journal history.
GRANT USAGE ON SCHEMA public TO finos_app;
GRANT SELECT,INSERT ON ALL TABLES IN SCHEMA public TO finos_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO finos_app;
GRANT UPDATE ON accounts,idempotency_keys,outbox,risk_flows,market_snapshots TO finos_app;
CREATE OR REPLACE FUNCTION check_entry_transfer_balance() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE t transfers; n BIGINT; total NUMERIC; debit NUMERIC; credit NUMERIC;
BEGIN
 SELECT * INTO t FROM transfers WHERE id=NEW.transfer_id;
 SELECT count(*),coalesce(sum(signed_amount),0),
 coalesce(sum(signed_amount) FILTER(WHERE account_id=t.source_id),0),
 coalesce(sum(signed_amount) FILTER(WHERE account_id=t.destination_id),0)
 INTO n,total,debit,credit FROM ledger_entries WHERE transfer_id=t.id;
 IF n<>2 OR total<>0 OR debit<>-t.amount OR credit<>t.amount THEN
 RAISE EXCEPTION 'Unbalanced transfer %',t.id USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER entry_transfer_balanced AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION check_entry_transfer_balance();

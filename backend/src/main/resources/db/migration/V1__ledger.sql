CREATE TABLE accounts (
 id UUID PRIMARY KEY, name TEXT NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 balance BIGINT NOT NULL DEFAULT 0, allow_overdraft BOOLEAN NOT NULL DEFAULT FALSE,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','FROZEN')),
 version BIGINT NOT NULL DEFAULT 0,
 CHECK(allow_overdraft OR balance >= 0)
);
CREATE TABLE transfers (
 id UUID PRIMARY KEY, reference TEXT NOT NULL UNIQUE, source_id UUID NOT NULL REFERENCES accounts,
 destination_id UUID NOT NULL REFERENCES accounts, amount BIGINT NOT NULL CHECK(amount>0),
 original_amount BIGINT NOT NULL CHECK(original_amount>0), original_currency CHAR(3) NOT NULL,
 fx_rate NUMERIC(24,10) NOT NULL, quote_id UUID, reversal_of UUID UNIQUE REFERENCES transfers,
 trace_id CHAR(32) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK(source_id<>destination_id)
);
CREATE TABLE ledger_entries (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 transfer_id UUID NOT NULL REFERENCES transfers, account_id UUID NOT NULL REFERENCES accounts,
 signed_amount BIGINT NOT NULL CHECK(signed_amount<>0), created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(transfer_id, account_id)
);
CREATE INDEX ledger_account_idx ON ledger_entries(account_id);
CREATE TABLE idempotency_keys (
 key TEXT PRIMARY KEY, request_hash CHAR(64) NOT NULL,
 response JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE outbox (
 id UUID PRIMARY KEY, transfer_id UUID NOT NULL UNIQUE REFERENCES transfers,
 payload JSONB NOT NULL, trace_id CHAR(32) NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSED','DEAD_LETTER')),
 attempts INT NOT NULL DEFAULT 0, last_error TEXT,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), processed_at TIMESTAMPTZ
);
CREATE INDEX outbox_pending_idx ON outbox(next_attempt_at,created_at) WHERE status='PENDING';
CREATE TABLE inbox (event_id UUID PRIMARY KEY, processed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
CREATE TABLE risk_flows (
 account_id UUID PRIMARY KEY REFERENCES accounts,
 inflow NUMERIC(30,0) NOT NULL DEFAULT 0, outflow NUMERIC(30,0) NOT NULL DEFAULT 0,
 events BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE fx_quotes (
 id UUID PRIMARY KEY, currency CHAR(3) NOT NULL, original_amount BIGINT NOT NULL,
 amount BIGINT NOT NULL CHECK(amount>0), rate NUMERIC(24,10) NOT NULL,
 provider_time TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE market_snapshots (
 provider TEXT PRIMARY KEY, payload JSONB NOT NULL, fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE operator_audit (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 action TEXT NOT NULL, account_id UUID REFERENCES accounts, detail JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION append_only() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Append-only journal: use a compensating transfer' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_entries BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER immutable_transfers BEFORE UPDATE OR DELETE ON transfers FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON operator_audit FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE FUNCTION check_transfer_balance() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE t transfers; n BIGINT; total NUMERIC; debit NUMERIC; credit NUMERIC;
BEGIN
 SELECT * INTO t FROM transfers WHERE id=NEW.id;
 SELECT count(*),coalesce(sum(signed_amount),0),
 coalesce(sum(signed_amount) FILTER(WHERE account_id=t.source_id),0),
 coalesce(sum(signed_amount) FILTER(WHERE account_id=t.destination_id),0)
 INTO n,total,debit,credit FROM ledger_entries WHERE transfer_id=t.id;
 IF n<>2 OR total<>0 OR debit<>-t.amount OR credit<>t.amount THEN
 RAISE EXCEPTION 'Unbalanced transfer %',t.id USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balanced_transfer AFTER INSERT ON transfers DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION check_transfer_balance();
CREATE FUNCTION check_account_balance() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE aid UUID; actual BIGINT; expected NUMERIC;
BEGIN
 IF TG_TABLE_NAME='accounts' THEN aid=NEW.id; ELSE aid=NEW.account_id; END IF;
 SELECT balance INTO actual FROM accounts WHERE id=aid;
 SELECT coalesce(sum(signed_amount),0) INTO expected FROM ledger_entries WHERE account_id=aid;
 IF actual<>expected THEN RAISE EXCEPTION 'Balance drift for %',aid USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER account_reconciled AFTER INSERT OR UPDATE ON accounts DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION check_account_balance();
CREATE CONSTRAINT TRIGGER entry_reconciled AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION check_account_balance();

INSERT INTO accounts(id,name,allow_overdraft) VALUES
 ('00000000-0000-0000-0000-000000000001','Opening equity',true),
 ('00000000-0000-0000-0000-000000000101','Atlas Clearing',false),
 ('00000000-0000-0000-0000-000000000102','Meridian Treasury',false),
 ('00000000-0000-0000-0000-000000000103','Summit Institutional',false),
 ('00000000-0000-0000-0000-000000000104','Margin Reserve',false);
DO $$
DECLARE aid UUID; amount BIGINT; tid UUID;
BEGIN
 FOR aid,amount IN SELECT id,CASE name WHEN 'Atlas Clearing' THEN 500000000 WHEN 'Meridian Treasury' THEN 120000000 WHEN 'Summit Institutional' THEN 55000000 ELSE 50000 END FROM accounts WHERE NOT allow_overdraft LOOP
 tid=gen_random_uuid();
 INSERT INTO transfers(id,reference,source_id,destination_id,amount,original_amount,original_currency,fx_rate,trace_id)
 VALUES(tid,'OPENING-'||aid,'00000000-0000-0000-0000-000000000001',aid,amount,amount,'INR',1,replace(tid::text,'-',''));
 UPDATE accounts SET balance=balance-amount WHERE id='00000000-0000-0000-0000-000000000001';
 UPDATE accounts SET balance=balance+amount WHERE id=aid;
 INSERT INTO ledger_entries(transfer_id,account_id,signed_amount) VALUES(tid,'00000000-0000-0000-0000-000000000001',-amount),(tid,aid,amount);
 END LOOP;
END $$;

-- Preserve transaction operations while preventing the API role from changing
-- account policy, immutable request hashes, or the contents of committed events.
REVOKE UPDATE ON accounts,idempotency_keys,outbox,risk_flows,market_snapshots FROM finos_app;
GRANT UPDATE(balance,status,version) ON accounts TO finos_app;
GRANT UPDATE(response) ON idempotency_keys TO finos_app;
GRANT UPDATE(status,processed_at,last_error,attempts,next_attempt_at) ON outbox TO finos_app;
GRANT UPDATE(inflow,outflow,events) ON risk_flows TO finos_app;
GRANT UPDATE(payload,fetched_at) ON market_snapshots TO finos_app;

-- New accounts must start at zero with the schema's normal overdraft policy.
REVOKE INSERT ON accounts FROM finos_app;
GRANT INSERT(id,name,currency) ON accounts TO finos_app;

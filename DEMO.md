# Five-minute engineering demo

Start with `./Start-FINOS.ps1`. Keep Engineering and the last test reports available.

1. **Problem and invariant (30s).** “A payment client may retry after a timeout. I need one committed transfer, a balanced journal, and eventual downstream processing.” Show Overview's reconciled balances.
2. **Transfer and retry (60s).** In Settlement, move ₹10 from Atlas to Meridian with a new reference. Inspect transaction/trace IDs. Replay the request: the receipt is identical. Test payload mismatch: 422. In Journal, find the reference and show its equal, opposite entries.
3. **Downstream outage model (60s).** In Event pipeline, pause the relay. Post another small transfer. The ledger commits while the event stays pending. Resume: it is published and consumed. Use “Redeliver” on that event and show that consumed flow is unchanged. The pause is an operator simulation of backlog, not a claim that the broker was actually stopped.
4. **Live FX and assumptions (45s).** In Market, show provider/as-of time and daily cadence. In Settlement, choose USD, request a quote, and explain its 120-second expiry and HALF_EVEN rounding. Use INR if the provider is unavailable. Explain that the translation slider is hypothetical sensitivity.
5. **Proof and tradeoffs (90s).** Open Engineering and the recorded tests: 50 identical retries commit once; 50 withdrawals permit exactly five; 200 opposing transfers preserve balances; an injected outbox failure rolls back money and key; a malformed Kafka event is quarantined. Show the real Redis cache-hit/eviction integration test and the Docker outage/restart evidence, then explain the single-broker limit.

## Questions to prepare

- **Why is this double-entry?** The journal includes an opening-equity account and every transfer has an equal debit and credit. Reconciliation compares stored balances with journal reconstruction.
- **Why not just Redis SETNX?** Durable request identity and the committed receipt must survive cache loss. PostgreSQL remains authoritative; Redis is optional acceleration after commit.
- **Why isn't Kafka producer idempotence enough?** A crash after broker acknowledgement but before the database update can publish again. The consumer needs a durable inbox in the same transaction as its effects.
- **What happens on an HTTP timeout?** Retry the identical payload and key. It either commits once or returns the existing receipt. Editing the payload requires a new key; retain the old key for uncertain-outcome recovery.
- **How do you avoid deadlocks and overdrafts?** Account locks use a stable order. Funds are checked after locking; a database constraint also rejects negative operational balances. Capacity failures return 503 and can retry with the same key.
- **Why not shard immediately?** Show correctness and measured contention first. This implementation uses ordered row locks and makes no unmeasured scaling claims.
- **What remains for production?** Authentication/authorization, stronger operational isolation, HA/DR, observability and security review, capacity testing, retention/recovery procedures, and domain/legal requirements.

## A defensible résumé bullet

“Built a Java 21/PostgreSQL double-entry settlement API and React desk with durable idempotency, transactional outbox/Kafka delivery, deduplicated flow projections, and timestamped FX quotes; verified concurrency, rollback, retry and dead-letter behavior with integration tests.”

Only claim personally understood and demonstrated behavior. Do not add TPS, availability, latency, bank affiliation, or production deployment metrics without measuring them.

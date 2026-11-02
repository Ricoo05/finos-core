# Explain and demonstrate the implementation

Use these questions to explain the implementation, demonstrate its behavior and discuss its tradeoffs.

1. **What does a timeout mean?** The client does not know whether commit happened. Replay the same key and payload; a new key can create a second business operation. Exercise: send a transfer, reload the desk, then recover its receipt.
2. **Where is the transaction boundary?** In `LedgerService`, balances, transfer, journal, receipt and outbox share one PostgreSQL transaction. Exercise: locate the injected-outbox-failure test and explain each rollback assertion.
3. **Why two ledger entries?** Every amount has equal opposite signed legs, including opening equity. Exercise: reconstruct one account from its entire journal and compare its stored balance.
4. **Why integer strings at the API?** JavaScript numbers cannot represent every BIGINT exactly. The UI uses BigInt, Java uses bounded long and PostgreSQL BIGINT; FX uses BigDecimal. Exercise: explain why `1.5` minor units is invalid.
5. **Why HALF_EVEN?** It makes midpoint rounding explicit and avoids always rounding ties upward. It is a project policy, not a universal settlement rule. Exercise: trace the 83.005 quote test to 83 paise.
6. **Why ordered locks?** Opposing transfers lock accounts in the same UUID order, reducing lock cycles. Exercise: run the 200-opposing-transfers test and explain the balance assertions; it is not a TPS benchmark.
7. **How is overdraft prevented?** Check available funds after acquiring locks; database checks reject negative operational balances. Exercise: explain why 50 concurrent ₹100 withdrawals against ₹500 yield five successes.
8. **Why durable idempotency?** A unique key and canonical request hash bind the committed receipt to the original request. Exercise: show one committed result for 50 identical retries, then changed-payload rejection.
9. **What if two different keys share a reference?** The unique business reference rejects a second posting. Exercise: identify which constraint enforces it and why its failure must roll back the key claim.
10. **Why an outbox?** Database commit and Kafka publish are not one atomic operation. Persist the event with the transfer and retry later. Exercise: pause the relay, post a transfer, show pending state, then resume.
11. **Is delivery exactly once?** Publish acknowledgement can precede a crash before the outbox update, causing redelivery. Transactional inbox deduplication prevents repeat projection effects. Exercise: redeliver a committed event and compare flow counts.
12. **What happens to poison messages?** Bounded retries lead to a dead-letter topic and inspection record. Exercise: trace the real Kafka integration test's malformed payload and assert quarantine; never silently discard it.
13. **What does reconciliation prove?** It checks current balances against journal reconstruction and paired transfer invariants. It cannot prove bank settlement or detect every domain/model error. Exercise: explain the deferred constraint that rejects isolated balance edits.
14. **What happens when FX/Redis fails?** Stale FX cannot create new foreign-currency quotes; INR remains available. Durable receipts survive cache loss; healthy Redis acceleration remains unverified. Exercise: replay an expired FX quote's already committed transfer, then explain why a new transfer rejects it.
15. **What would production require?** Authentication, authorization, migration isolation, HA/DR, capacity evidence, operational retention/backups and domain controls. Exercise: inspect V4's column grants, demonstrate denied policy/event edits, and explain why an owner credential can still bypass safeguards.

Code map: `backend/src/main/java/dev/finoscore/`, `backend/src/main/resources/db/migration/`, `backend/src/test/java/dev/finoscore/`, `tests/browser/`, and `src/App.jsx`. Use `DEMO.md` for the five-minute presentation.

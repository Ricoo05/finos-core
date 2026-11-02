# Recruiter and engineering review

Assessment is limited to the tested local implementation, not candidate interview performance or job placement. Provisional score before publication/clean-clone completion: **77/100** (correctness 22/25; tests/CI 16/20; reproducibility 8/15; documentation 13/15; security 6/10; demo 8/10; presentation 4/5). Reassess with concrete hosted and fresh-setup evidence, not a badge alone.

Fifteen review criteria:

1. Clear problem: retry and downstream failure semantics, stated in README.
2. Source matches claims: real Java/PostgreSQL/Kafka path, separate archived browser simulator.
3. Financial precision: integer minor units and explicit FX rounding.
4. Atomicity: tested outbox failure rolls back ledger and key claim.
5. Idempotency: 50 simultaneous same-key calls commit once; payload mismatch rejected.
6. Concurrency: 50 withdrawals and 200 opposing transfers have asserted outcomes.
7. Integrity: paired journal, deferred constraints, immutable history, reconciliation.
8. Messaging: real broker coverage, inbox deduplication and poison quarantine.
9. Frontend: eight browser workflows including reconnect/responsive layout.
10. Live data honesty: timestamped daily FX; no fabricated interbank feed or VaR.
11. CI: strong configured coverage; new hosted result still must be observed.
12. Reproducibility: fresh-clone execution still must be completed.
13. Security: dependency patches, least privilege and scoped exceptions; no production auth/HA.
14. Demo/presentation: actual recording and concise walkthrough; no public writable deployment.
15. Candidate understanding: 15 exercises provided; AI assistance disclosed, understanding cannot be certified by automation.

The strongest interview story is the failure model and verifiable invariants. Main weaknesses are single-node architecture, absent production auth/operations, unmeasured capacity and limited platform verification. These are acceptable portfolio boundaries when stated clearly; adding more bank logos or speculative features would not improve the evidence.

# Engineering evidence for technical interviews

FINOS-Core is maintained by Arhit Bhardwaj ([Ricoo05](https://github.com/Ricoo05)). The implementation and its tests can be inspected directly in this repository.

1. **Problem:** preserve a single balanced transfer when clients retry and downstream processing is temporarily unavailable.
2. **Implementation:** Java 21/Spring Boot 4, PostgreSQL, Kafka, authenticated Redis and React. The archived browser simulator is labeled separately.
3. **Precision:** integer minor units and exact decimal FX conversion with explicit rounding.
4. **Atomicity:** injected outbox failure rolls back money, journal and idempotency claim.
5. **Idempotency:** 50 simultaneous identical requests commit once; changed payloads are rejected.
6. **Concurrency:** 50 withdrawals against limited funds allow exactly five successes; 200 opposing transfers preserve balances.
7. **Integrity:** paired journal entries, deferred database constraints, append-only history and balance reconciliation.
8. **Messaging:** real Kafka delivery, transactional inbox deduplication and poison-message quarantine.
9. **Healthy cache:** real Redis PING, TTL, cache-served replay, tamper rejection, eviction and durable repopulation.
10. **Failure recovery:** Redis outage/recovery, pending-event recovery after backend restart and preserved receipts after complete container recreation.
11. **Frontend:** eight browser workflows cover responsive views, settlement/retry, freezing, reconnect, backlog recovery, FX and scenario behavior.
12. **Verification:** 14 hosted backend tests with no failures or skips; native Windows checks include 13 backend tests and live-provider verification. Exact runs are in [verification status](FINAL_GITHUB_STATUS.md).
13. **Security checks:** zero reported npm/Maven dependency matches at the recorded scans, zero open main-branch CodeQL findings, least-privilege runtime updates and complete-history secret scanning.
14. **Reproduction:** [Windows setup](README.md), [Docker setup](DOCKER.md), independent clean-setup evidence and actual demonstration recordings.
15. **Technical discussion:** [five-minute walkthrough](DEMO.md) and [15 implementation questions](INTERVIEW_GUIDE.md) cover transaction boundaries, retries, locks, outbox crash windows and deployment tradeoffs.

The architecture uses one PostgreSQL primary and one Kafka broker for a local engineering demonstration. FX is timestamped reference data. Throughput, multi-region availability and bank connectivity are not claimed. The evidence above describes the implemented, tested behavior.

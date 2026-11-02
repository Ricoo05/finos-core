# Verification matrix — 2 November 2026

Tested implementation: 6745a74. Exact full source revision and links: FINAL_GITHUB_STATUS.md.

- **Native Windows:** Spring Boot 4/Java 21, PostgreSQL and Kafka; 13 backend tests, eight browser checks, two HTTP/live-FX checks and production build passed. Redis outage fallback is included; native runtime intentionally leaves Redis disabled.
- **Hosted full integration suite:** run 41476387724, 14 backend tests against real PostgreSQL, Kafka and Redis with zero failures/errors/skips. RedisHealthyIT asserts PING, cache TTL, REDIS-served replay, cached mismatch rejection, eviction and durable repopulation. Eight browser checks passed without failures/skips/flakes.
- **Docker deployment:** run 41476387905 built both images from source, initialized fresh services, passed Redis outage/recovery and full persistent-volume restart simulations, and passed HTTP/SSE smoke plus eight browser tests against the built frontend through Nginx. Downloaded artifacts contain the recorded recovery checks and browser results; the public summary is docs/docker-run.json.
- **Security/build checks:** CodeQL run 41476387791 passed; zero open main findings confirmed through the API. Maven OSV: 138 resolved packages, zero advisory matches, no exceptions. npm audit: zero matches. Complete-history secret scan and formatting passed.
- **Upgrade compatibility:** a real receipt committed under the old application replayed through the new framework without a second transfer. No existing ledger data or applied migrations were rewritten.

Core hosted HTTP smoke intentionally skips the external-provider check; native live-provider checks passed separately. This is deliberate provider isolation, not a skipped financial correctness test. Maven's default native suite contains 13 tests; the redis-integration profile contains all 14 and is mandatory in hosted verification. Building the Docker JAR skips execution because build stages have no test infrastructure; the independent verification job executes the real suite.

Earlier Docker harness execution failed because it checked an internal service field instead of the public servedBy API field. The assertion was corrected and the complete simulation rerun successfully; the failure was not masked or recorded as passing. Optional unmerged dependency-bump runs were cancelled to prioritize final main checks; they remain subject to required checks before merging.

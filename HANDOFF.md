# FINOS-Core status

The local portfolio implementation and finishing work are complete. See README.md for setup/architecture and DEMO.md for the five-minute walkthrough.

Verified locally on 31 October 2026:

- All 12 backend integration tests passed, including actual Kafka delivery/dead-letter handling and Redis outage fallback.
- Five browser tests passed, covering all six views at 320, 390, 768 and 1440px, settlement and replay after reload, input validation, freezing, relay backlog recovery, and reconnect.
- HTTP settlement/Kafka/SSE smoke test and the actual provider/FX quote check passed.
- Frontend production build passed; reconciliation has zero drift.
- Start/stop scripts track only this project's processes, including creation time and command identity. Setup uses pinned runtime checksums and a clean npm lockfile.

Normal runtime: Java 21, PostgreSQL 16, single-broker Kafka, React/Vite. Redis is disabled. The app and infrastructure use loopback ports 5173, 8080, 55432, 19092/19093. Runtime paths and private credentials stay in ignored .local/runtime.json. Original Gemini context remains in ignored reference/.

GitHub destination: https://github.com/Ricoo05/finos-core (private). Hosted CI status must be checked in Actions; local evidence alone does not establish a hosted CI pass.

Keep applied Flyway migrations immutable. Use a new migration for schema changes. Stop the API before repackaging its JAR on Windows. Do not run concurrent backend test suites against one database.

Keep future changes focused on observed issues. Do not add bank affiliation, invented performance metrics, or additional infrastructure without a concrete requirement. Healthy Redis-cache behavior, broker HA, public authentication and production deployment are outside the verified scope.

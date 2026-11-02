# Run the full local stack with Docker

Requires Docker Engine/Desktop with Compose v2 and at least 4 GB available memory. This starts the built React frontend behind Nginx, Java 21/Spring Boot API, PostgreSQL, Kafka and authenticated Redis. Windows native setup remains available separately. Stop the native frontend first because both paths use port 5173.

Generate private configuration once. With Node 24 available:

```powershell
node scripts/setup-compose.mjs
```

On Windows PowerShell, Docker Desktop can run the helper without installing Node on the host:

```powershell
docker run --rm -v "${PWD}:/workspace" -w /workspace node:24.22.1-alpine node scripts/setup-compose.mjs
```

On Linux/macOS without host Node, preserve host ownership of the private file:

```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace" -w /workspace node:24.22.1-alpine node scripts/setup-compose.mjs
```

Then run:

```powershell
docker compose --env-file .local/compose.env up -d --build --wait --wait-timeout 240
```

Open http://127.0.0.1:5173/. Only the frontend port is published, bound to loopback. Database, broker, cache and backend stay inside the Compose network. Backend/frontend run without root privileges and use read-only filesystems with temporary storage. Build/runtime image digests are pinned in the Dockerfiles; Java and UI are built from this checkout. The backend image build skips test execution because its build stage has no database/broker; independent CI runs the real integration suite before the Docker result is accepted.

Keep `.local/compose.env` private and retain it alongside the persistent volumes. The generator preserves an existing file; replacing its passwords while reusing the old PostgreSQL volume will prevent authentication. No credentials are committed to Git. Do not publish `docker compose config` output because it expands private environment values.

Stop containers while preserving stored funds/events/cache:

```powershell
docker compose --env-file .local/compose.env down
```

Inspect startup problems with `docker compose --env-file .local/compose.env ps -a` and `docker compose --env-file .local/compose.env logs`. Do not delete named volumes unless you intentionally want to discard their demo history.

## Reproduce the automated failure simulation

With Node 24 and the stack running:

```powershell
node scripts/verify-compose.mjs
```

This posts three small fictional transfers, asserts a healthy Redis replay and payload mismatch rejection, stops Redis and asserts PostgreSQL fallback/new posting, restores Redis and asserts cache recovery, pauses the relay then restarts the backend to recover a pending event, and recreates all containers with their existing named volumes. It verifies original receipts, exactly three new transfers, reconciled balances and zero pending/unprojected events. It leaves the stack running and writes `docker-verification.json` locally.

The `Verify Docker stack` workflow additionally runs HTTP/SSE checks and all eight browser workflows against the built Nginx frontend. It disables external FX for deterministic core checks; native live-provider checks run separately. See `FINAL_GITHUB_STATUS.md` for the executed source revision and result. The automated Docker execution environment is Linux CI; a Windows Docker Desktop execution is a separate platform check, not implied by that result.

## Run the healthy-cache Java integration test

The main verification workflow provisions a real Redis service and uses `mvn -f backend/pom.xml -Predis-integration verify`. That profile runs all 14 backend tests, including `RedisHealthyIT`: real PING, cache TTL, Redis-served receipt, cached-payload tamper rejection, eviction, PostgreSQL fallback and cache repopulation. It requires the usual isolated `_test` database/Kafka configuration plus `TEST_REDIS_PORT` (default 16380) and optional `TEST_REDIS_PASSWORD`.

Native Windows verification without a Redis server runs the existing 13-test suite and separately verifies Redis outage fallback. Neither path substitutes a mock for the healthy-cache test.

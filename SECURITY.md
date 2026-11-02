# Security scope and reporting

FINOS-Core is a local educational settlement system using fictional funds. It has no user authentication or role-based operator authorization. Bind all services to loopback and keep the database, broker and API off the public internet. Origin/Host checks reduce browser exposure; they do not authenticate a caller.

Report a suspected vulnerability privately to the repository owner through their GitHub profile. Do not open a public issue with credentials, exploitable details or personal data. No dedicated security inbox or response-time commitment is established.

Never commit `.local`, `.env` files, database/broker data, access tokens or runtime credentials. Setup generates separate migration-owner and application-role passwords. The API still has migration credentials in its local process so Flyway can start; separating migration execution is a future production requirement. Database superusers can bypass safeguards and are outside the application-role threat boundary.

Financial safeguards include integer minor units, exact decimal FX conversion, ordered row locks, deferred journal/reconciliation constraints, append-only history and durable idempotency. Migration V4 limits update privileges to operational columns and prevents the application role from granting overdraft status or rewriting committed event payloads/request hashes.

Dependency and secret scans are dated checks, not security certification. The Spring Boot 4 migration removes the earlier Spring exceptions; Maven scanning now fails on any advisory match. See `SECURITY_REVIEW.md` for executed checks and remaining limits. Dependency update PRs must pass the full PostgreSQL/Kafka and browser workflow before merging.

Repository controls: only Ricoo05 had write/admin access at review; no pending invitations. Main requires contributor review and verified GitHub Actions checks, blocks force pushes/deletion, and requires resolved discussions. Auto-merge is disabled. The owner keeps administrator control, including the ability to bypass requirements; this does not protect a compromised owner credential. Public MIT source may be forked or reused in other repositories.

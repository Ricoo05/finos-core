# Security review — 2 November 2026

Scope: local settlement application, its container deployment and source publication. Tests and scans are dated evidence.

## Dependency and source checks

- Spring Boot 4.0.9/Spring Framework 7 replace the earlier affected Spring 6 line. The two applicability exceptions and their configuration file were removed.
- Resolved Maven OSV scan: **138 packages, zero advisory matches, no suppressions or exceptions**. The scanner fails on any match or incomplete response.
- npm audit: **zero reported vulnerabilities** at the local check.
- CodeQL covers Java and JavaScript; exact runs and results are in FINAL_GITHUB_STATUS.md. A successful job alone is not treated as proof of zero alerts; the main-branch alert API is also inspected.
- Full Git-history Gitleaks scan uses a checksum-verified release. Runtime passwords, data, original private references and logs remain ignored. Third-party CI actions and Dockerfile base images are pinned to verified immutable references.

## Verified financial and cache boundaries

Ordered account locks, integer minor units, paired immutable entries, deferred reconciliation constraints, durable request identity and atomic ledger/receipt/outbox writes remain in place. V4 restricts the runtime role's policy/hash/event-payload updates. The integration suite tests these controls against PostgreSQL and Kafka.

The real Redis integration test verifies PING, TTL, Redis-served replay, changed-payload rejection, eviction, durable database replay and cache repopulation. The existing Redis-unavailable test remains. The full Docker simulation additionally stops and restores authenticated Redis, asserts fallback/new posting during outage and cache recovery afterward, recovers a pending event after backend restart, and recreates all containers with persistent volumes while preserving receipts and exactly-once financial effects.

The native application was rebuilt and its full browser/API suite rerun after the framework upgrade. An actual receipt committed before the upgrade replayed successfully afterward without a second transfer.

## Deployment and repository controls

Only the Docker frontend is published on loopback. Database, broker, Redis and backend have no published host ports. Redis requires a generated password; backend/frontend run without root privileges and have read-only filesystems. Compose credentials are generated privately and preserved with the data volumes.

Only Ricoo05 has repository write/admin access, with no pending collaborator invitations at review. Main requires contributor review and passing GitHub checks, blocks force pushes/deletion and requires resolved discussions. Auto-merge is disabled and CODEOWNERS assigns all files to Ricoo05. The owner retains administrator control. Public MIT source can be forked/reused in other repositories.

## Scope limits

This is a local, single-database/single-broker engineering project, not a deployed multi-user banking service. Origin checks do not replace production authentication; startup still receives migration credentials. Container execution is verified on Linux CI, not a claim that Docker Desktop is installed on this Windows machine. No exhaustive penetration test, runtime-image CVE certification or high-availability guarantee is asserted.

The GitHub Dependabot alerts API returned HTTP 403 for this session, so its alert count was not certified. The actual dependency checks are npm audit and the resolved Maven OSV scan above; no advisory was dismissed to obtain a passing result.

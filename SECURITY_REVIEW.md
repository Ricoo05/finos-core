# Security review — 2 November 2026

Scope: local educational application and source publication, not public deployment approval or penetration-test certification.

- **PASS:** Gitleaks 8.30.1, verified release checksum, scanned all six baseline Git commits (`git . --log-opts=--all --redact`). No matches. Repeat after staging the publication changes. `.local` secrets/data and original private reference files are ignored.
- **PASS:** npm audit after Vite 6.4.5/PostCSS 8.5.32 update reported zero vulnerabilities across the installed graph. This is a dated advisory check, not a guarantee.
- **REVIEWED WITH EXCEPTIONS:** OSV resolved Maven scan initially found 31 matches. Compatible updates to Jackson, Tomcat, Netty, Log4j API, PostgreSQL JDBC, LZ4 and Snappy reduced this to two Spring MVC 6.2.19 matches; no unreviewed matches remain at that scan.
- **PASS:** New migration V4 narrows column updates and account inserts. A new integration test asserts PostgreSQL SQLSTATE 42501 when the runtime role attempts overdraft policy/currency changes, request-hash/event-payload changes or an overdraft-enabled account insert. All 13 backend tests passed again after the dependency overrides, alongside eight browser and two HTTP/live-FX checks.
- **PASS (configuration):** CI actions pinned to verified v4 commit SHAs; read-only contents permission, timeout and report artifacts retained. npm audit, OSV and complete-history secret scanning are mandatory CI steps. Dependency update configuration covers npm, Maven and Actions.

## Remaining Spring matches

1. [CVE-2026-47890, vendor advisory](https://spring.io/security/cve-2026-47890/): requires SSE **view fragments**. `Api.events` emits only fixed refresh strings/timestamps, not view rendering. Vendor rates this low; the aggregated database severity differs. This is an applicability assessment, not a patched dependency.
2. [CVE-2026-47884, vendor advisory](https://spring.io/security/cve-2026-47884/): requires `XsltView` and wildcard view-name inference. The application has REST JSON endpoints, no XSLT/view resolver or wildcard view-rendering mapping. Vendor rates this medium. No OSS 6.2 patch was listed in Maven Central during review; a framework-major change is not silently mixed into Boot 3.5.

Exact package/version/ID exceptions expire on 2 December 2026 in `scripts/security-exceptions.json`. The scanner reports them, fails on new/unreviewed or expired matches, and requires reassessment if view-rendering features are introduced. Review manually when endpoints/dependencies change; a text guard is not a full reachability analysis.

## Explicit limits

No user auth/RBAC, public writable demo, TLS/broker ACLs, HA/DR, penetration test, exhaustive runtime-distribution advisory scan or model-security certification. API startup still receives migration-owner credentials. Redis's healthy-cache path is unverified. Docker is not installed and is not claimed as verified. No AI model calls are part of the main settlement engine, so model prompt-injection evaluation is not applicable to its current behavior.

## Hosted source analysis and launcher review

CodeQL completed Java and JavaScript analysis on commit 883d02a. It reported two insecure-randomness findings in the archived simulator; these are being corrected with Web Crypto for UUIDs, trace IDs and request identifiers. Simulation price changes still use ordinary randomness intentionally. A new CodeQL run must establish resolution; do not describe the earlier scan as zero-alert.

The first anonymous-clone attempt exposed a Windows pg_ctl inherited-output-handle hang during first startup. Common.ps1 now redirects startup output to files and waits only for pg_ctl, with a timeout; it does not wait for the persistent server process tree. Fresh independent setup is being repeated and its outcome belongs in CLEAN_CLONE_VERIFICATION.md.

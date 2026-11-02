# CI validation

## Local publication candidate — 2 November 2026

`./Test-FINOS.ps1 -BrowserChannel msedge -LiveFx` passed after the dependency and V4 permission changes: 13 backend integration tests, eight browser tests, two HTTP/live-FX tests, production frontend build. Backend tests had zero failures/errors/skips. The recorded result is `public/verification.json`; detailed local logs are ignored. Format check and npm audit also passed.

The workflow runs real PostgreSQL/Kafka, all 13 Java tests with a zero-skip assertion, npm audit, format checks, Maven OSV review, HTTP smoke and Chromium browser workflows. Hosted core tests disable external FX; that single provider-dependent smoke case is explicitly skipped there. The local provider-dependent test passed separately. Gitleaks checks full history; third-party Actions use verified immutable SHAs and the Gitleaks release archive has a pinned checksum.

Prior successful baseline CI: [run 41420409455](https://github.com/Ricoo05/finos-core/actions/runs/41420409455), before this readiness update. It does not verify the new changes. Publication-candidate hosted run is pending upload; exact commit/run/conclusion will be recorded in `FINAL_GITHUB_STATUS.md` after execution. A pending run must not be described as passing.

Known benign local warning: Playwright's forced-color output overrides NO_COLOR. No failed check is suppressed to obtain a green result. Docker/healthy Redis and public hosting are outside this tested matrix.

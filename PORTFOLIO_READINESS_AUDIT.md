# FINOS-Core portfolio readiness audit

Scope: FINOS-Core only. SearchForge X, RUTHLESS, the resume, and account-level presentation are outside this mission. Initial inspection: 2 November 2026. This report records execution evidence; previous chat assertions are not substitutes for checks.

## Initial findings

- **PASS (existing evidence, to rerun after changes):** Java 21/Spring Boot, PostgreSQL paired journal/constraints, durable idempotency, real Kafka outbox/inbox, React desk, eight browser checks and two HTTP checks exist. The current repository is `Ricoo05/finos-core`; do not create a duplicate.
- **FAIL:** `npm audit --json` reports high-severity advisories in the pinned PostCSS and Vite development dependencies. Report: ignored `.local/readiness-npm-audit.json`. Investigate compatible patched versions, update the lockfile, and rerun tests/build.
- **FAIL:** GitHub Actions use mutable `@v4` action references; pin verified commit SHAs.
- **FAIL:** Source presentation is compressed into very long lines. Add a standard formatter and meaningful static checks without altering financial semantics or the workbench design.
- **NOT TESTED:** A fresh clone without the current `.local` credentials/data/runtime configuration. Earlier launcher checks do not establish this requirement.
- **NOT TESTED:** Complete Git-history secret scan and current Maven dependency advisories.
- **NOT APPLICABLE (current environment):** Docker execution: no Docker executable is installed. Existing Windows bootstrap is the working setup path. Any added container path must be labeled unverified until executed in a Docker-capable environment.
- **BLOCKED pending explicit public-publication approval:** Anonymous public clone, recruiter public access, public demo, public-release artifacts. The repository was previously private; verify current visibility before any change. Do not change visibility or activate paid hosting.
- **BLOCKED pending owner license choice:** No project license is present. Review third-party licenses and provenance; do not assign a project license on the owner's behalf.
- **Documented scope:** Redis is disabled; outage fallback is tested, healthy-cache behavior is not. One broker/one database are not high availability. FX is daily reference data, and the scenario slider is not VaR. The archived simulator is labeled and is not real backend evidence.

## Execution record

Commands already executed during this mission:

```text
git status --short
git log -4 --oneline
git remote -v
git rev-list --all --count
npm audit --json
```

At inspection the working tree was clean, history contained six commits, and the remote was `https://github.com/Ricoo05/finos-core.git`. Audit all tracked revisions before public publication. Preserve applied Flyway migrations V1–V3 and existing demo data.

Remaining execution results and their exact command locations will be recorded in the CI, security, clean-clone, demo and final-status reports. An unexecuted check must remain NOT TESTED or BLOCKED.

## Publication candidate results

The initial failures above are historical findings. Vite/PostCSS have been patched (npm audit: zero matches); active frontend/config files use checked Prettier formatting; Actions are SHA-pinned. V4 preserves applied migrations while restricting runtime column privileges. The post-update local run passed 13 backend, eight browser, two HTTP/live-FX checks and build. OSV checked 115 resolved Maven packages with two disclosed Spring applicability exceptions and zero unreviewed matches. MIT and third-party/asset notices are present. User authorized public visibility; final remote and clone checks remain separately recorded.

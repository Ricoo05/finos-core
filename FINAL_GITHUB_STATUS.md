# FINOS-Core publication status — verified 2 November 2026

**Public repository:** [Ricoo05/finos-core](https://github.com/Ricoo05/finos-core). Anonymous repository, MIT license, CODEOWNERS and real demo-video access verified. Recruiters can inspect the source, tests and recording without signing in.

- **PASS:** [final GitHub verification](https://github.com/Ricoo05/finos-core/actions/runs/41473953369) for implementation `b22b7960663af4dc4f532daab11bfa7df45acbd2`: PostgreSQL/Kafka integration tests, browser workflows, HTTP smoke, frontend build, formatting, dependency policy and history secret scan.
- **PASS:** [final CodeQL analysis](https://github.com/Ricoo05/finos-core/actions/runs/41473953470). Java and JavaScript analyses each returned zero results; repository API confirmed zero open main-branch CodeQL alerts. Earlier archived-simulator randomness findings were fixed, not dismissed.
- **PASS:** local 13 backend tests, eight browser tests, two HTTP/live-FX checks and frontend build. Hosted core CI deliberately skips the external-provider case; it passed locally and in the independent clone.
- **PASS:** independent anonymous clone setup/test after the Windows first-start launcher fix; all runtime/data paths and both generated credentials were independent. Original app and data restored. See CLEAN_CLONE_VERIFICATION.md and docs/clean-clone-verification.json.
- **PASS:** only Ricoo05 has repository write/admin access; zero pending collaborator invitations. Main requires contributor review and three GitHub Actions checks, blocks force pushes/deletion, and requires resolved conversations. Auto-merge disabled. CODEOWNERS assigns all files to Ricoo05. Owner retains administrator control. Public users can fork/reuse MIT source in other copies, but cannot edit this repository.

Two scoped Spring dependency-applicability exceptions remain disclosed and expire 2 December 2026; zero CodeQL findings does not mean zero dependency advisories. Docker, healthy Redis, public interactive hosting and production readiness are not claimed. No paid resources were used. ForgeX/RUTHLESS/resume were not modified.

Later documentation-only commits update these reports and wording; implementation CI above identifies the exact tested source. They do not change application behavior.

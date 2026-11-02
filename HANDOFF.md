# Maintainer handoff

FINOS-Core is public at https://github.com/Ricoo05/finos-core. Final tested implementation: b8cb94b. Hosted verification 41432950217 and CodeQL 41432950343 passed; both language analyses returned zero findings. Local and independent-clone checks passed 13 backend, eight browser and two HTTP/live-FX tests plus build.

The original local stack is restored at http://127.0.0.1:5173/. Use Setup-FINOS.ps1, Start-FINOS.ps1, Stop-FINOS.ps1 and Test-FINOS.ps1 as documented. Runtime credentials/data remain ignored in .local. Stop the API before repackaging its JAR on Windows; use new Flyway migrations rather than editing applied ones. Do not run simultaneous integration suites against one test database.

Main is protected for contributors and all files have Ricoo05 as code owner. Owner retains administrator control. Dependency update PRs require review; none were merged automatically. Two scoped Spring applicability exceptions expire 2 December 2026. Docker, healthy Redis, production authentication, HA and public interactive deployment are outside the verified scope.

Keep subsequent work focused. See the final status and audit reports for exact evidence; do not introduce unsupported bank affiliation, production or performance claims.

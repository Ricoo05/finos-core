# Maintainer handoff

FINOS-Core is public at https://github.com/Ricoo05/finos-core. Final tested implementation: 6745a74. Hosted verification 41476387724 (14 backend tests), CodeQL 41476387791 and full Docker verification 41476387905 passed. Native checks passed 13 backend, eight browser and two HTTP/live-FX tests plus build. Use DOCKER.md for the complete authenticated-Redis stack.

The original local stack is restored at http://127.0.0.1:5173/. Use Setup-FINOS.ps1, Start-FINOS.ps1, Stop-FINOS.ps1 and Test-FINOS.ps1 as documented. Runtime credentials/data remain ignored in .local. Stop the API before repackaging its JAR on Windows; use new Flyway migrations rather than editing applied ones. Do not run simultaneous integration suites against one test database.

Main is protected for contributors and all files have Ricoo05 as code owner. Owner retains administrator control. Dependency update PRs require review; none were merged automatically. Spring Boot 4.0.9 removes the previous Spring exceptions; Maven scanning reports zero advisory matches. Healthy Redis and Linux Docker recovery are tested. Keep the local single-node deployment scope explicit.

Keep subsequent work focused. See the final status and audit reports for exact evidence; do not introduce unsupported bank affiliation, production or performance claims.

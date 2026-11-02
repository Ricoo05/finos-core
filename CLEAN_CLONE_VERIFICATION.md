# Clean-clone verification — PASS

On 2 November 2026 an anonymous HTTPS clone was made into a new directory with no `.local` configuration. SHA-256-verified distribution archives were reused as a download cache; Java/Maven/PostgreSQL/Kafka/Node were extracted independently. New random owner/application credentials and new PostgreSQL/Kafka data were created. All runtime/data paths were checked to remain under the clone, and both passwords differ from the original project.

The first attempt exposed a Windows first-start pg_ctl inherited-output-handle hang. It was stopped gracefully, fixed in commit `d45cc1853d31633a5c070add509f4c861e1db7a3`, pulled anonymously into that same independently initialized clone, and rerun. The failed attempt is retained locally; it is not presented as passing.

Commands: `Setup-FINOS.ps1 -DownloadCache <pinned-archive-cache>`, `Start-FINOS.ps1 -NoBrowser`, `Test-FINOS.ps1 -BrowserChannel msedge -LiveFx`, `Stop-FINOS.ps1`. Completion: 2026-11-02T10:47:12Z. **13 backend tests, eight browser tests, two HTTP/live-FX checks and build passed.** See `docs/clean-clone-verification.json` for sanitized results. Original app/data were restored afterward.

Scope: same Windows machine, existing Maven/npm caches and installed Edge; not a fresh VM or hermetic environment. No original runtime settings, credentials or ledger data were copied. The later archived-simulator identifier correction was separately verified through all eight original-app browser tests, a direct archived settlement and build; it is not falsely attributed to this earlier clone run. Docker and another operating system remain unverified.

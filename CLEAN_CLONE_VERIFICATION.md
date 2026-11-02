# Clean-clone verification

Status: **NOT YET EXECUTED for the publication candidate**. Existing-directory tests passed, but they do not establish fresh setup.

Required check: anonymous clone of the published repository into a new directory, no copied `.local` settings/data/passwords, execute README setup/start/test/stop on Windows x64. Download-cache reuse is permitted only for the exact pinned, SHA-256-verified distribution archives; it must not reuse extracted runtimes or databases. Existing Maven/npm package caches and installed Edge are machine prerequisites/caches, not hermetic isolation, and must be disclosed.

The original demo must be stopped first because the documented ports are fixed; restore it after the check. Preserve both ledgers. Docker and a second operating system remain unverified unless actually executed. The exact clone path, tested source commit, commands and outcome will be added after the run.

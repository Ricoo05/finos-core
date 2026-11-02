# Contributing

Use the setup and verification commands in README. Use fictional data only. Keep test and demo databases separate and run one integration suite per test database.

Preserve these invariants: paired zero-sum journal entries; balance-to-journal reconciliation; one committed result per identical idempotency key/request; atomic ledger/receipt/outbox writes; atomic inbox/projection writes. Add an integration test for changes that affect them. New database changes belong in a new Flyway migration; do not rewrite applied migrations.

Run `npm run format:check`, `npm audit --audit-level=moderate` and `./Test-FINOS.ps1 -BrowserChannel msedge` before proposing a change. Use `-LiveFx` for provider-dependent checks; core CI deliberately runs without an external provider. Document an unexecuted check explicitly.

Describe the behavioral change, relevant test result and tradeoff in a pull request. Avoid unrelated UI changes, fabricated performance claims or claims of bank/FINOS affiliation. Contributions cannot imply a license grant until the owner selects a project license.

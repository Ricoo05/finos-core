# Demonstration verification

`docs/demo/settlement-retry-recovery.webm` is the actual local desk recorded on 2 November 2026. It shows a transfer, identical-request replay, changed-payload rejection, paused-relay backlog, recovery, inbox deduplication, journal, market provenance and final reconciliation. The pause is an operator-controlled relay simulation, not a real broker outage. Screenshots are actual captured frames, not mockups. The corresponding recorder assertions passed before these security-only updates.

After the updates, all eight browser workflows and two HTTP/live-FX checks passed again. No redesign or new settlement feature was introduced. Native stack restart durability was checked on the earlier baseline: the receipt and pending outbox survived restart and replay did not duplicate the transfer. This is historical baseline evidence, not a claim of a new post-update restart run.

Recruiters can inspect the recording, source/tests and CI without entering credentials once repository visibility is public. There is no public interactive deployment: the app intentionally has no multi-user authentication. Run it locally using README. No hosting expense was incurred. Daily reference FX and hypothetical sensitivity analysis are explicitly labeled; no live interbank tape, bank affiliation, TPS or production availability claim is made.

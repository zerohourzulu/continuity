# Continuity Core — private continued-case integration

Version 0.3.0-h04.1. Local evaluation only; not an npm release. One shared engine with an explicit `continuity-segmented-local/1` host configuration. Complete replay, up to 1,024 events and 6 MiB canonical event bytes, with reserved room for admitted work.

Existing `historyFile` applications keep the managed96 profile. Existing cases must migrate explicitly, preserving the original history and replacing the old writable path with a migration marker. Configure the returned `historyBinding` and `historyProfile`; never pass both binding and historyFile.

`openLocalOwner`, runtime, simulation, execution, attempt recording and evidence tools accept the selected history location. `observeContinuationHistory` and `inspectContinuationAttempts` take verified histories from `./history` or `./history-store`; they grant no power. Old array readers retain their limits. Use `./adapter` only in trusted integration hosts.

Use this version with private remote and gateway 0.3.0-h04.1. The destination must select the same profile explicitly. Transfer completion is a fence only after durable acknowledgment; a lost reply needs exact reconciliation. The old destination format requires a separate quiesced migration. No automatic effect replay, quota reset, history pruning or profile downgrade.

This is trusted local filesystem/cooperative destination infrastructure, not hostile-host containment, arbitrary external-service enforcement or unlimited capacity. The H04 guide in the enclosing development package describes migration, retained storage and compatibility.

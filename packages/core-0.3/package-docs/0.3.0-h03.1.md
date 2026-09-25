# Continuity history storage — private H03 experiment

Version `0.3.0-h03.1`, `private: true`. This is a development package, not a public release or a replacement for the current managed96 integrations.

`@ramex-labs/continuity/history` provides the H02 historical interface. `@ramex-labs/continuity/history-store` adds a local directory store, complete-case capacity reservations, conditional writes, explicit migration and signed administrative commits. `continuity-history-store --help` lists operator commands. The accompanying source guide `HISTORY-STORAGE.md` explains use and recovery.

Ordinary store creation accepts only the two-event fresh bootstrap. Importing a working history requires explicit migration; copied historical snapshots are not an activation mechanism. Fresh domain uniqueness remains the trusted application owner’s responsibility.

The directory contains immutable digest-named segments and one committed manifest. Reopen validates every required file and replays from genesis. Conditional writes compare instance, generation and canonical head under a cooperative lock. New segments and manifest data are synced before successful acknowledgment; an interrupted write is reconciled by reopening and checking actual inclusion. There is no fallback to an older manifest or automatic promotion of leftover files.

The finite profile admits up to1,024 events and6 MiB of canonical event bytes, while reserving the same eleven lifecycle kinds per declared intent and remaining original eight controls over the full case. Reservations also charge bytes, nodes, encoding and descriptors. It does not reset an authority's spent allowance or guarantee infinite recovery space. Full histories may still exceed query/evidence budgets and return explicit INDETERMINATE.

Migration is operator maintenance after quiescence. It preserves the original file and explicitly selected artifacts, stages an inactive target, fences the old writable path with a marker, verifies exact H03 binding files, then activates the target. Old supported readers/writers reject the marker. Declared binding files are for this H03 Core coordinator; remote/MCP configuration, checkpoint transfer and automatic application rewiring are later H04 work. The tool cannot prove another process has stopped or that an outside effect did not occur.

Store paths, signer/clock callbacks, I/O fault hooks and maintenance commands are trusted application/operator configuration, never agent request fields. A captured snapshot is historical evidence, not a current dispatch capability. The signed administrative helper rechecks head, time and authority after signing. It invokes no adapter. Network services and protected filesystem access are separate integration work.

This profile assumes a trusted local POSIX host and cooperative writers. It detects invalid files and stale conditional writes; it does not supply consensus, hostile-administrator rollback protection, network-filesystem guarantees, universal isolation, or a power-cut hardware certification. Dead locks require exact-record recovery with same recorded hostname and an OS-confirmed absent PID. A live, malformed or unknown owner is refused; age is never permission to unlock.

Failed-write leftovers are bounded and retained. Cleanup is explicit, with the exact current manifest revision and orphan inventory. Preserve needed failure evidence before selecting cleanup. No migration, deletion, write retry or new-case rollover occurs automatically.

The package has no bundled third-party runtime dependency. Node22.18+ and24 are the locally targeted runtimes. See the source review for actual platform coverage and measurements; do not infer broader operating readiness from the package version.

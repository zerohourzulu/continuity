# Run one gateway owner per case

This is a finite local evaluation profile. It can show you how controlled tool access and recovery work; it is not an always-on production service with unlimited history.

The supplied HTTP host and stdio CLI now claim a private ownership file before serving a case. A second host using the same record directory refuses to start. Embedded users of `createGateway` or `createCooperativeGateway` must wrap their host with `acquireHostLease(storage)` and release it after all work stops. Owner administration must be coordinated with that same host; the lease is not a distributed lock or Core authority.

## Inspect capacity without exposing content

```sh
continuity-mcp-ops inspect --history /absolute/private/history.jsonl --storage /absolute/private/records
```

The command reports event/file counts, remaining event capacity, task counts and whether a host lease exists. It does not print identities, tool arguments, responses, keys or paths. The output is a point-in-time diagnostic; it is not an authorization decision or proof that a destination is healthy.

The managed profile holds at most 96 bounded events and reserves ledger room for each declared job's first supported lifecycle records, plus eight shared control records after the first declaration. The diagnostic includes physical and unreserved counts, reserved record kinds, remaining control slots and OPEN/DRAINING/EXHAUSTED/INCOMPATIBLE mode. A remaining physical slot is not permission to start a new job. The history hash identifies the inspected prefix; the next request still checks current state under the writer lock.

When draining, finish or inspect existing work under current authority. Cancellation is a separate consequential job requiring its own budget and may be refused. Prepare successor identity, grants and succession rules before draining. Do not create a fresh domain or restore an older snapshot to evade exhausted limits. Existing incompatible cases remain inspectable but managed writes refuse.

There is no pruning, automatic rollover or migration. See [the capacity guide](CAPACITY.md) for the exact reservation contract. Raw Core 0.2 writers and old binaries must not write alongside this managed profile. Hostile administrator rollback and disk availability are outside its guarantee.

## Recover a stopped host

Normal shutdown releases the lease. A hard crash leaves it in place. First confirm the former gateway process has stopped, then run:

```sh
continuity-mcp-ops recover-dead-host --storage /absolute/private/records
```

The command only removes a valid lease from this machine whose recorded process ID provably no longer exists. A live process, permission ambiguity, a different hostname, a replaced file or a symbolic link is refused. It never kills a process or changes history. A reused process ID may cause a conservative refusal. A different-machine recovery needs an explicit operator procedure; this command does not guess.

Start the gateway with the same history, directory and job configuration. Tasks resume inspection; uncertain actions are not automatically sent again. Reclaiming the host lease grants no agent power.

## Take a private offline snapshot

Stop the gateway and every administrative history writer. Choose a new directory under a private, canonical parent:

```sh
continuity-mcp-ops snapshot --history /absolute/private/history.jsonl --storage /absolute/private/records --directory /absolute/private/snapshot-01
continuity-mcp-ops verify --directory /absolute/private/snapshot-01
```

The snapshot contains the history, saved requests/reports/tasks and a checksum manifest. It excludes the host lease. It does not collect the signing key or configuration from neighboring files. Files are private and flushed before the completed manifest is written. A changed history during copying causes refusal. A failed incomplete snapshot is preserved for diagnosis; choose a new target after resolving the problem.

These files can contain confidential tool data. Keep them private. Verification checks file checksums and reconstructs the recorded history; it does **not** establish that the snapshot is current. There is deliberately no restore command. Replacing current records with an older snapshot can lose revocations, consumed limits and unresolved work. Do not reconnect an old snapshot to a live destination as a recovery shortcut.

## Logs and boundaries

The administrative CLI reports bounded status/error codes. The gateway discards upstream stderr, avoids forwarding login tokens, and returns controlled errors. Redirect only these operator diagnostics to your private logs; do not log raw HTTP authorization headers, private configuration or tool results in public systems.

One active job per context, at most 32 jobs, 16 HTTP bindings, eight active HTTP requests and 32 connections remain. Record directories hold at most 4,096 entries, with bounded per-record sizes. Local inspection/snapshot history reads are capped at 8 MiB. These are explicit evaluation limits, not measured production throughput.

The host, clock, filesystem and configured executable integrations remain trusted. File modes and ownership checks are not a sandbox. Use separate OS identities and eliminate direct routes to protected services for hostile-agent deployment. The [compatibility guide](COMPATIBILITY.md) records exactly which clients and server were exercised.

The snapshot manifest also has a 128 KiB bound. An unusually large set of records may exceed it and leave an incomplete copy without a valid completion manifest. Verification must succeed before treating a copy as a usable archive; it still grants no permission to restore it.

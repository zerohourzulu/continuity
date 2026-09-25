# Continuity Core

Give a worker explicit permission, withdraw it, appoint a replacement, and keep track of work that remains. A job title alone is not permission. Replacing a process does not erase an unfinished responsibility.

This release adds the opt-in `continuity-segmented-local/1` history profile. Keep one case and replay its complete history, up to 1,024 events / 6 MiB of canonical event data. Existing file configurations retain their managed 96 limit. Moving storage never restores a spent limit or revoked permission.

Start with `@ramex-labs/continuity/local` for owner operations, `/runtime` for signed worker operations, `/attempts` for outcome observations and investigation duties, `/history` for verified historical views, and `/history-store` for explicit migration/recovery. The `continuity-history-store` command describes its supported operations with `--help`. Migration must quiesce old writers, preserve original history/artifacts and fence the old writable path; it is not an automatic upgrade.

The engine is deterministic. Historical queries are not authority to perform a new action. The local host, keys, filesystem and clock are trusted. Duties remain open until their defined lifecycle permits otherwise; recording a report or reviewing evidence does not itself prove success or complete an investigation.

No third-party runtime code is bundled. Node 22.18+ in the 22 line and Node 24 are the coordinated integration targets. Node 26 remains a Core/evidence compatibility lane; the remote/gateway packages target 22/24. See the source distribution's HISTORY-INTEGRATION and SUPPORTED-PROFILES guides for exact boundaries and verification.

Version 0.3.0-preview.9. Release candidate prepared locally; publication status is recorded separately.

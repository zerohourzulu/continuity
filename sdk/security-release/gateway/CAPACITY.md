# Leave room to finish the work

A full record book is a poor place to discover that you still need to record a result or withdraw permission. This local preview stops taking new jobs before its record book fills.

Each new job sets aside room for its first admission, result, receipt and the supported follow-up records. Other jobs and routine setup changes cannot spend that room. A separate allowance leaves space for eight control changes, such as revocation, replacement and admitting a replacement runtime. Permissions still apply to every change.

## Read the capacity report

Use `owner.capacity()` from the local Core API, or `continuity-mcp-ops inspect` for a gateway case. The report distinguishes physical free slots from unreserved slots:

- **OPEN:** room for a new job and its reserved records.
- **DRAINING:** finish or inspect existing work; there is not enough unreserved room for another complete job.
- **EXHAUSTED:** the managed record limit is reached.
- **INCOMPATIBLE:** this existing history does not fit the managed profile. Keep it intact, stop new execution and inspect/export it for an operator-led recovery plan.

`reservedByRecordType` reports remaining slots by kind; `controlReserved` reports the remaining shared control allowance. These are counts, not permission or a forecast of successful execution. A concurrent writer may change them before your next request.

## Exact limits

This version holds at most 96 events. A declared job accounts for 11 later record kinds: admission, consumption, outcome, receipt, observation, attempt-duty creation/assignment/review, and obligation creation/assignment/status. Its first record of each kind spends that slot. A second observation or another review needs ordinary free space. Kinds unavailable in the selected adapter remain conservatively reserved. Reservations are not automatically returned, even after a job completes or signing fails.

The eight control slots are shared by the case after its first job declaration. They cover revocation, epoch change, termination, role transfer, appointment and runtime admission. Set up the successor's identity, grants and succession rule beforehand. They do not promise unlimited replacements. A cancellation is a new consequential job with its own budget and permission; it may be refused when the case is draining. Inspecting an existing result does not send that job again.

Each event is limited to 8192 canonical bytes, 32 nested array members in total and depth 16. These bounds keep the managed history within the existing verifier's input limits. A large record can be refused even when event slots remain. Private business payloads belong in the application's protected storage, with their bounded commitments in history.

## Existing cases and trusted writers

The new code assesses an old case without rewriting it. If it fits, the reservations are calculated from its existing history. If it does not fit, reopening it does not make it safe to run. Inspection of previously supported histories remains available; there is no automatic conversion, rollover or restore command.

Use the new managed Core 0.3 owner, runtime and execution interfaces for every writer to the case. The supplied remote and MCP packages use them. Do not mix in an old runtime, raw Core 0.2 writer, manual file edits or an old snapshot. Those are trusted administrative bypasses and cannot share this capacity guarantee. Preserve old records; never create a new case merely to erase exhausted limits or unresolved work.

Reserved ledger space cannot guarantee disk availability, valid authority, keys, service completion or an online host. File damage and uncertain writes still require investigation. The local profile does not detect a malicious administrator restoring a complete older snapshot. Public HTTP, larger-history migration and production high availability are separate work.

# Continuity investigation findings — private D03 build

An investigation can finish even when the action that caused it remains uncertain. This build records that distinction: a signed report and an authorized disposition can complete the local investigation, but cannot claim that the original outside action succeeded.

This is private version `0.3.0-d03.1`. It adds to `@ramex-labs/continuity/duties`; it is not an npm release or a replacement for an earlier installed package. Use Node 22.18+ on the 22.x line or Node 24.x.

## Record a finding

Start with an existing E5/E6 duty whose D1 rules were explicitly activated in a directory history. The host configures the case, clock, runtime identities and signing functions. These are trusted setup, not arguments from an agent's tool call.

```js
import { openLocalDutyPolicy } from '@ramex-labs/continuity/duties';

// options identifies the configured case and the disposition actor's session.
// The optional second argument selects a separate finding attester.
const duties = openLocalDutyPolicy(options, {
  session: 'reviewer-session',
  signHash: signReviewerHash,
});

const checklist = {
  SOURCE_REVIEWED: { state: 'SATISFIED', reason: 'The identified incident material was reviewed.' },
  HISTORY_REVIEWED: { state: 'SATISFIED', reason: 'The case history was reviewed.' },
  FINDING_RECORDED: { state: 'SATISFIED', reason: 'The report explains the remaining uncertainty.' },
  CONTROL_REVIEWED: { state: 'SATISFIED', reason: 'Current permissions and limits were reviewed.' },
};
const result = await duties.dispose({
  id: 'investigation-report-1',
  duty: 'investigation',
  disposition: 'COMPLETED_UNDER_POLICY',
  checklist,
  reportDigest: { algorithm: 'sha256', value: reportHash },
  nextStep: null,
  attestationAuthority: 'reviewer-finding-grant',
  dispositionAuthority: 'worker-disposition-grant',
});
console.log(result.view.dutyDisposition); // COMPLETED_UNDER_POLICY
console.log(result.view.externalOutcome); // NOT_PROVEN
```

The attester must occupy the Role selected at activation and hold `ATTEST_DUTY_FINDING`. The disposition actor must be the explicit current assignee, occupy the duty's current Role and hold `RECORD_DUTY_DISPOSITION`. Both exact permissions use `duty:<descriptorHash>` and must come through the case Principal's valid paths. The same actor may perform both jobs, but both permissions and both signatures are still checked. Omitting the second constructor argument uses the disposition actor's signer for both purposes.

Completion requires all four criteria to be SATISFIED and no accepted contest. Use UNAVAILABLE or UNRESOLVED for missing or unresolved material, and `ESCALATED` with a nonempty `nextStep` to request attention. A contest also permits escalation. An entirely satisfied, uncontested report cannot be labeled escalation merely by changing its label. Report digests identify material; the engine does not read that material or certify the report's truth.

## Challenge a report

```js
await duties.contest({
  id: 'challenge-1',
  duty: 'investigation',
  targetDispositionId: result.eventId,
  reason: 'The report did not account for a conflicting observation.',
  reportDigest: { algorithm: 'sha256', value: challengeReportHash },
  attestationAuthority: 'reviewer-finding-grant',
  dispositionAuthority: 'worker-disposition-grant',
});
```

A contest uses the same two authorization roles and targets an existing disposition in that duty. The current state becomes CONTESTED and stays outstanding. Another report or escalation cannot clear the contest. The original completion remains in history.

## Read the current position

`duties.inspect(dutyId)` reports OPEN, COMPLETED_UNDER_POLICY, ESCALATED, NEEDS_REVIEW or CONTESTED, with its observed history head and last recorded disposition. Relevant new evidence or an explicit assignment change makes an earlier completion need review. Unrelated grants, passage of time and Role changes alone do not erase the historical report. The inspection carries no execution authority.

`prepareDisposition` and `prepareContest` return read-only finding previews. Recording rechecks everything; a preview is not a permit. Reusing the exact operation ID and content returns the original event and current view without signing again, including after permission expiry. Changing the content under that ID is a conflict.

Each new operation validates its whole bounded shape before either signing callback, verifies the finding signature before requesting the disposition signature, and checks history, clock and both permission paths after each callback. If the selected path expires, another path cannot silently replace it. Neither callback runs while the store writer lock is held.

## Bounds and limits

D1 reserves four dispositions and two contests per duty. Unused slots remain reserved. Checklist reasons are limited to 256 UTF-8 bytes; an escalation next step to 512. The existing 8 KiB whole-event limit also applies, including JSON escaping, proofs and signatures, so values that individually fit can still exceed the event envelope. Such input is refused before signing.

This host-only API does not send an outside action, restore spent allowance, reverse revocation, expand a successor's powers or provide hostile-host isolation. Storage remains finite and local, with the existing filesystem and rollback assumptions. Earlier readers refuse the new full history; identified earlier prefixes remain verifiable. Coordinated installed MCP/gateway packages and the protected workflow walkthrough are a separate integration step.

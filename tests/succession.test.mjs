import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handover, survives, authorize, ID } from './helpers.mjs';

const answerFor = agent => {
  const result = survives(handover, agent);
  assert.ok(Object.hasOwn(result, 'answer'), `survives(${agent}) was not established: ${result.code}`);
  return result.answer;
};

describe('succession — what survives the actor', () => {
  test('the predecessor is terminated in the protocol but its history remains', () => {
    const a = answerFor(ID.a);
    assert.equal(a.exists, true);
    assert.equal(a.lifecycleStatus, 'TERMINATED');
    assert.ok(a.historicalIdentity.length > 0, 'a terminated agent keeps its recorded identity');
  });

  test('the successor is active', () => {
    assert.equal(answerFor(ID.b).lifecycleStatus, 'ACTIVE');
  });

  test('the unfinished obligation survives the predecessor', () => {
    const a = answerFor(ID.a);
    assert.equal(a.obligations.length, 1);
    const [obligation] = a.obligations;
    const id = obligation.obligationId ?? obligation.record?.obligationId;
    assert.equal(id, ID.obligation);
  });

  test('performance passes to the successor under a named succession rule', () => {
    const a = answerFor(ID.a);
    assert.equal(a.currentPerformanceAssignments.length, 1);
    const [assignment] = a.currentPerformanceAssignments;
    assert.equal(assignment.obligationId, ID.obligation);
    assert.equal(assignment.assigneeId, ID.b);
    assert.equal(assignment.successionRuleId, ID.succession);
    assert.ok(assignment.evidence.length > 0, 'the transfer must cite evidence');
  });

  test('the role tenure is transferred away from the predecessor, not retained', () => {
    const a = answerFor(ID.a);
    assert.equal(a.currentRoleTenures.length, 0);
    assert.equal(a.transferredRoleTenures.length, 1);
    const b = answerFor(ID.b);
    assert.equal(b.currentRoleTenures.length, 1);
    assert.equal(b.transferredRoleTenures.length, 0);
  });

  test('the predecessor’s authorities are marked invalidated by its departure', () => {
    const a = answerFor(ID.a);
    const invalidated = a.invalidatedAuthorityDependencies.map(row => row.authorityId ?? row.subjectId).filter(Boolean);
    assert.ok(invalidated.includes(ID.collectAuthority), 'the collection grant must not quietly remain usable');
    assert.ok(invalidated.includes(ID.reviewAuthorityA));
    const b = answerFor(ID.b);
    assert.equal(b.invalidatedAuthorityDependencies.length, 0, 'the active successor has no invalidated dependencies');
  });

  test('unresolved intents are surfaced rather than dropped', () => {
    const a = answerFor(ID.a);
    const intents = a.unresolvedIntents.map(row => row.intentId).filter(Boolean);
    assert.ok(intents.length >= 1, 'an interrupted actor leaves intents to reconcile');
    assert.ok(intents.some(id => id.includes('stale')), 'the stale intent must remain visible for reconciliation');
  });

  test('the receipt commitment created before the handover is still attributable', () => {
    assert.ok(answerFor(ID.a).receiptCommitments.length > 0);
  });

  test('an agent that does not exist is answered honestly, not invented', () => {
    const result = survives(handover, 'nobody:first-look');
    if (Object.hasOwn(result, 'answer')) {
      assert.equal(result.answer.exists, false);
      assert.equal(result.answer.obligations.length, 0);
      assert.equal(result.answer.currentPerformanceAssignments.length, 0);
    } else {
      assert.equal(typeof result.code, 'string');
    }
  });

  test('THE THESIS: the successor holds the duty and lacks the power that created it', () => {
    const b = answerFor(ID.b);
    const holdsDuty = b.currentPerformanceAssignments.some(row => row.assigneeId === ID.b && row.obligationId === ID.obligation);
    assert.equal(holdsDuty, true, 'B must hold the unfinished duty');

    const canCollect = authorize(handover, { actor: ID.b, action: 'collect-evidence-packet', resource: ID.resource });
    assert.equal(canCollect.decision, 'DENY', 'B must NOT inherit the power that produced the duty');

    const canReview = authorize(handover, { actor: ID.b, action: 'record-review-progress', resource: ID.obligation });
    assert.equal(canReview.decision, 'ALLOW', 'B must hold exactly what was separately granted to it');
  });

  test('a historical question is asked with a truncated observation, not a rewound clock', () => {
    // Before the handover, A was active and held the role. The way to ask that
    // question is to supply the history as it stood then. Supplying the full
    // history with an earlier evaluationTime is refused as CAUSAL_TIME_INVALID,
    // which is the correct answer: you cannot evaluate a past moment against
    // evidence that did not exist yet.
    const earlier = { ...handover, events: handover.events.slice(0, 13) };
    const before = survives(earlier, ID.a);
    assert.ok(Object.hasOwn(before, 'answer'), `not established: ${before.code}`);
    assert.equal(before.answer.lifecycleStatus, 'ACTIVE');
    assert.equal(before.answer.transferredRoleTenures.length, 0);
    assert.equal(before.answer.invalidatedAuthorityDependencies.length, 0);
  });

  test('rewinding the clock against a later history is refused, not guessed', () => {
    const rewound = survives(handover, ID.a, 12);
    assert.equal(Object.hasOwn(rewound, 'answer'), false);
    assert.equal(rewound.code, 'CAUSAL_TIME_INVALID');
    assert.equal(rewound.epistemicStatus, 'INDETERMINATE');
  });
});

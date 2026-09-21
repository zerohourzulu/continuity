import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { core, handover, why, responsible, ID } from './helpers.mjs';

const established = result => { assert.ok(Object.hasOwn(result, 'answer'), `not established: ${result.code}`); return result.answer; };

describe('why — a decision with its disclosure scope', () => {
  test('an allowed action is established and carries its authority path', () => {
    const result = why(handover, { actor: ID.b, action: 'record-review-progress', resource: ID.obligation });
    const answer = established(result);
    assert.equal(answer.authorization.decision, 'ALLOW');
    assert.equal(answer.authorization.scopeAssurance, 'REPLAY_VERIFIED');
    assert.equal(answer.authorization.proof.permissionPath.length, 1);
    assert.equal(answer.presentConsequentialUse, false);
  });

  test('a denied action is established too — a refusal is an answer, not a failure', () => {
    const result = why(handover, { actor: ID.b, action: 'collect-evidence-packet', resource: ID.resource });
    const answer = established(result);
    assert.equal(answer.authorization.decision, 'DENY');
    assert.ok(answer.authorization.failures.length > 0);
  });

  test('the envelope states how the answer relates to what was observed', () => {
    const result = why(handover, { actor: ID.b, action: 'record-review-progress', resource: ID.obligation });
    assert.equal(result.scope.headRelationship, 'SAME_HEAD');
    assert.equal(result.scope.freshness, 'CURRENT');
    assert.equal(result.scope.finality, 'LOCAL_ONLY');
  });

  test('the envelope always names its external assumptions', () => {
    const result = why(handover, { actor: ID.b, action: 'record-review-progress', resource: ID.obligation });
    const assumptions = result.scope.externalAssumptions;
    assert.equal(assumptions.identity, 'PROTOCOL_IDENTIFIERS_NOT_REAL_WORLD_IDENTITY');
    assert.equal(typeof assumptions.trust, 'string');
    assert.equal(typeof assumptions.observation, 'string');
    assert.equal(typeof assumptions.availability, 'string');
  });

  test('an empty disclosure withholds the answer rather than leaking it', () => {
    const head = core.replayPortable({ operationVersion: core.PORTABLE_REPLAY_VERSION, events: handover.events }).head;
    const result = core.whyPortable({
      operationVersion: core.PORTABLE_QUERY_VERSION,
      evaluationEvents: handover.events, observedEvents: handover.events,
      authorizationDomain: handover.config.domain,
      request: { actorId: ID.b, action: 'record-review-progress', resource: ID.obligation, claimedAt: head.canonicalTime },
      evaluationTime: head.canonicalTime,
      disclosure: { mode: 'PUBLIC_MINIMAL', includedFields: [], withheldFields: [] },
    });
    assert.equal(Object.hasOwn(result, 'answer'), false);
    assert.equal(result.code, 'DISCLOSURE_INVALID');
  });

  test('an unsupported disclosure mode is refused', () => {
    const head = core.replayPortable({ operationVersion: core.PORTABLE_REPLAY_VERSION, events: handover.events }).head;
    const result = core.whyPortable({
      operationVersion: core.PORTABLE_QUERY_VERSION,
      evaluationEvents: handover.events, observedEvents: handover.events,
      authorizationDomain: handover.config.domain,
      request: { actorId: ID.b, action: 'record-review-progress', resource: ID.obligation, claimedAt: head.canonicalTime },
      evaluationTime: head.canonicalTime,
      disclosure: { mode: 'EVERYTHING', includedFields: [], withheldFields: [] },
    });
    assert.equal(Object.hasOwn(result, 'answer'), false);
  });

  test('a rejected history yields no established answer', () => {
    const events = structuredClone(handover.events);
    events.splice(4, 1);
    const result = why({ ...handover, events }, { actor: ID.b, action: 'record-review-progress', resource: ID.obligation });
    assert.equal(Object.hasOwn(result, 'answer'), false);
    assert.equal(result.code, 'STATE_NOT_AUTHORITATIVE');
    assert.equal(result.epistemicStatus, 'INDETERMINATE');
  });

  test('the envelope is frozen', () => {
    const result = why(handover, { actor: ID.b, action: 'record-review-progress', resource: ID.obligation });
    assert.throws(() => { result.kind = 'RESPONSIBLE'; }, TypeError);
  });
});

describe('responsible — who is answerable', () => {
  test('attribution separates the actor from the principal that empowered it', () => {
    const answer = established(responsible(handover, { actor: ID.b, action: 'record-review-progress', resource: ID.obligation }));
    const byKind = new Map(answer.attributions.map(row => [row.kind, row.subjectId]));
    assert.equal(byKind.get('ACTOR'), ID.b);
    assert.equal(byKind.get('DECLARED_PRINCIPAL'), ID.principal);
    assert.equal(byKind.get('MANDATOR'), ID.principal);
    assert.equal(byKind.get('AUTHORITY_SOURCE'), ID.reviewAuthorityB);
    assert.ok(byKind.has('CONTROLLER'));
  });

  test('every attribution cites the events it rests on', () => {
    const answer = established(responsible(handover, { actor: ID.b, action: 'record-review-progress', resource: ID.obligation }));
    for (const attribution of answer.attributions) {
      assert.ok(attribution.evidence.length > 0, `${attribution.kind} cites no evidence`);
      for (const reference of attribution.evidence) assert.equal(typeof reference.kind, 'string');
      assert.equal(typeof attribution.temporalBasis, 'string');
    }
  });

  test('a denied action reports the decision but attributes to nobody (FINDING-005)', () => {
    // Documented current behaviour. Attribution follows an authority chain, and a
    // refused action has none — so the list is empty by construction. That is
    // defensible, but it means "who attempted this?" is not answerable from the
    // RESPONSIBLE query alone, which is the first question in an incident review.
    const answer = established(responsible(handover, { actor: ID.b, action: 'collect-evidence-packet', resource: ID.resource }));
    assert.equal(answer.authorizationDecision, 'DENY');
    assert.equal(answer.attributions.length, 0);
  });

  test('the predecessor remains answerable for what it did before it was replaced', () => {
    const earlier = { ...handover, events: handover.events.slice(0, 18) };
    const answer = established(responsible(earlier, { actor: ID.a, action: 'collect-evidence-packet', resource: ID.resource }));
    const actor = answer.attributions.find(row => row.kind === 'ACTOR');
    assert.equal(actor.subjectId, ID.a);
  });
});

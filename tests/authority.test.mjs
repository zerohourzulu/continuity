import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { core, handover, handoverDenied, authorize, replay, clone, ID } from './helpers.mjs';

describe('authorization — the successor thesis', () => {
  test('the successor may exercise the power it was separately granted', () => {
    const result = authorize(handover, { actor: ID.b, action: 'record-review-progress', resource: ID.obligation });
    assert.equal(result.decision, 'ALLOW');
    assert.equal(result.scopeAssurance, 'REPLAY_VERIFIED');
  });

  test('the successor does NOT inherit the predecessor’s collection power', () => {
    const result = authorize(handover, { actor: ID.b, action: 'collect-evidence-packet', resource: ID.resource });
    assert.equal(result.decision, 'DENY');
    assert.equal(result.consequential, false);
  });

  test('holding the surviving duty is not itself authority to act on it', () => {
    // B is the current performer of obligation:first-look, yet the collection
    // power that created it does not travel with the duty.
    const collect = authorize(handover, { actor: ID.b, action: 'collect-evidence-packet', resource: ID.resource });
    assert.equal(collect.decision, 'DENY');
    const obligate = authorize(handover, { actor: ID.b, action: 'OBLIGATE', resource: ID.resource });
    assert.equal(obligate.decision, 'DENY');
  });

  test('the predecessor is refused after termination and revocation', () => {
    const result = authorize(handover, { actor: ID.a, action: 'collect-evidence-packet', resource: ID.resource });
    assert.equal(result.decision, 'DENY');
    assert.ok(['AGENT_INACTIVE', 'REVOKED', 'STALE_EPOCH', 'NO_AUTHORITY'].includes(result.code), `unexpected code ${result.code}`);
  });

  test('revoking the successor’s review permission denies it without touching the duty', () => {
    const allowed = authorize(handover, { actor: ID.b, action: 'record-review-progress', resource: ID.obligation });
    const denied = authorize(handoverDenied, { actor: 'b:no-review-power', action: 'record-review-progress', resource: 'obligation:no-review-power' });
    assert.equal(allowed.decision, 'ALLOW');
    assert.equal(denied.decision, 'DENY');
    assert.equal(denied.code, 'REVOKED');
  });
});

describe('authorization — denial is specific and evidenced', () => {
  const denies = (label, request, expected) => test(label, () => {
    const result = authorize(handover, request);
    assert.equal(result.decision, 'DENY', `expected DENY, got ${result.decision}`);
    if (expected) assert.equal(result.code, expected);
    assert.ok(Array.isArray(result.failures) && result.failures.length > 0, 'a denial must carry failure evidence');
    for (const failure of result.failures) {
      assert.equal(typeof failure.code, 'string');
      assert.ok(Array.isArray(failure.authorityPathIds));
      assert.ok(Array.isArray(failure.evidence));
    }
  });

  denies('an action outside every grant is refused', { actor: ID.b, action: 'delete-everything', resource: ID.obligation });
  denies('a resource outside every grant is refused', { actor: ID.b, action: 'record-review-progress', resource: 'other-resource:first-look' });
  denies('an actor that does not exist is refused', { actor: 'ghost:first-look', action: 'record-review-progress', resource: ID.obligation });

  test('an expired grant is refused after its expiry', () => {
    const result = authorize(handover, { actor: ID.b, action: 'record-review-progress', resource: ID.obligation, at: 5000 });
    assert.equal(result.decision, 'DENY');
    assert.equal(result.code, 'EXPIRED');
  });

  test('a mismatched domain is refused, not silently evaluated', () => {
    const result = authorize(handover, {
      actor: ID.b, action: 'record-review-progress', resource: ID.obligation,
      domain: { ...handover.config.domain, chainId: '1' },
    });
    assert.equal(result.decision, 'DENY');
    assert.equal(result.code, 'DOMAIN_MISMATCH');
  });

  test('a mismatched policy version is refused', () => {
    const result = authorize(handover, {
      actor: ID.b, action: 'record-review-progress', resource: ID.obligation,
      policyVersion: 'some-other-policy/9.9',
    });
    assert.equal(result.decision, 'DENY');
    assert.equal(result.code, 'POLICY_MISMATCH');
  });

  test('every denial code the engine can emit is a declared member of the union', () => {
    // Guards against a stringly-typed code leaking out of a new branch.
    const declared = new Set([
      'DOMAIN_MISMATCH', 'POLICY_MISMATCH', 'INVALID_REQUEST', 'INVALID_AMOUNT', 'INVALID_DELEGATION',
      'AGENT_INACTIVE', 'SESSION_NOT_FOUND', 'SESSION_EXPIRED', 'SESSION_CREDENTIAL_REQUIRED',
      'SESSION_CREDENTIAL_INVALID', 'SESSION_FENCED', 'STALE_EPOCH', 'ROLE_TENURE_NOT_CURRENT',
      'INTENT_REQUIRED', 'INTENT_NOT_DECLARED', 'INTENT_MISMATCH', 'INTENT_REPLAY', 'NONCE_ALREADY_ADMITTED',
      'PROHIBITED', 'REVOKED', 'NOT_YET_VALID', 'EXPIRED', 'MISSING_INTERSECTION', 'ACTION_NOT_ALLOWED',
      'RESOURCE_NOT_ALLOWED', 'AMOUNT_REQUIRED', 'AMOUNT_EXCEEDED', 'CUMULATIVE_AMOUNT_EXCEEDED',
      'TRANSACTION_COUNT_EXCEEDED', 'NO_AUTHORITY',
    ]);
    const probes = [
      { actor: ID.b, action: 'record-review-progress', resource: 'nope:first-look' },
      { actor: ID.b, action: 'nope', resource: ID.obligation },
      { actor: ID.a, action: 'collect-evidence-packet', resource: ID.resource },
      { actor: 'ghost:first-look', action: 'x', resource: 'y' },
      { actor: ID.b, action: 'record-review-progress', resource: ID.obligation, at: 99999 },
    ];
    for (const probe of probes) {
      const result = authorize(handover, probe);
      if (result.decision !== 'DENY') continue;
      assert.ok(declared.has(result.code), `undeclared denial code ${result.code}`);
      for (const failure of result.failures) assert.ok(declared.has(failure.code), `undeclared failure code ${failure.code}`);
    }
  });
});

describe('authorization — indeterminacy is preserved, not collapsed', () => {
  test('a stale expected head is INDETERMINATE, never a silent ALLOW', () => {
    const result = core.authorizePortable({
      operationVersion: core.PORTABLE_AUTHORIZATION_VERSION,
      events: handover.events,
      expectedHistoryHead: { hash: `0x${'0'.repeat(64)}`, position: 25, canonicalTime: 25 },
      domain: handover.config.domain,
      policyVersion: `local-evidence-intake-policy:${handover.caseId}/0.2`,
      rootRecognitionPolicy: core.PORTABLE_ROOT_RECOGNITION_POLICY,
      request: { actorId: ID.b, action: 'record-review-progress', resource: ID.obligation, claimedAt: 25 },
      evaluationTime: 25, authoritative: true, consequential: false,
    });
    assert.notEqual(result.decision, 'ALLOW');
    if (result.decision === 'INDETERMINATE') {
      assert.ok(['HISTORY_RELATION_UNVERIFIED', 'STATE_NOT_AUTHORITATIVE', 'INVALID_INPUT'].includes(result.code), `unexpected code ${result.code}`);
    }
  });

  test('a rejected history never yields ALLOW', () => {
    const events = clone(handover.events);
    events.splice(6, 1);
    const result = core.authorizePortable({
      operationVersion: core.PORTABLE_AUTHORIZATION_VERSION,
      events,
      expectedHistoryHead: replay(handover.events).head,
      domain: handover.config.domain,
      policyVersion: `local-evidence-intake-policy:${handover.caseId}/0.2`,
      rootRecognitionPolicy: core.PORTABLE_ROOT_RECOGNITION_POLICY,
      request: { actorId: ID.b, action: 'record-review-progress', resource: ID.obligation, claimedAt: 25 },
      evaluationTime: 25, authoritative: true, consequential: false,
    });
    assert.notEqual(result.decision, 'ALLOW');
  });

  test('a garbage input never yields ALLOW', () => {
    // Documented behaviour: a structurally invalid *record* is answered with
    // INDETERMINATE, but a non-record input (null, a number, an array) is
    // rejected at the capture boundary with a TypeError. Both are fail-closed.
    // A caller that forwards untrusted input must therefore wrap this call.
    for (const input of [undefined, null, 42, 'nope', []]) {
      assert.throws(() => core.authorizePortable(input), TypeError, `expected a boundary TypeError for ${JSON.stringify(input) ?? 'undefined'}`);
    }
    for (const input of [{}, { operationVersion: 'x' }, { operationVersion: core.PORTABLE_AUTHORIZATION_VERSION }]) {
      const result = core.authorizePortable(input);
      assert.equal(result.decision, 'INDETERMINATE');
      assert.equal(typeof result.code, 'string');
    }
  });

  test('an unsupported operation version is refused rather than assumed', () => {
    const result = core.authorizePortable({
      operationVersion: 'continuity-authorization/9.9',
      events: handover.events, expectedHistoryHead: replay(handover.events).head,
      domain: handover.config.domain, policyVersion: 'x',
      rootRecognitionPolicy: core.PORTABLE_ROOT_RECOGNITION_POLICY,
      request: { actorId: ID.b, action: 'x', resource: 'y', claimedAt: 25 },
      evaluationTime: 25, authoritative: true, consequential: false,
    });
    assert.equal(result.decision, 'INDETERMINATE');
    assert.equal(result.code, 'UNSUPPORTED_VERSION');
  });
});

describe('authorization — an ALLOW always carries a checkable proof', () => {
  test('the proof names the authority, the root, the path and the head it was evaluated at', () => {
    const result = authorize(handover, { actor: ID.b, action: 'record-review-progress', resource: ID.obligation });
    assert.equal(result.decision, 'ALLOW');
    const { proof } = result;
    assert.equal(proof.request.actorId, ID.b);
    assert.equal(proof.request.action, 'record-review-progress');
    assert.equal(proof.request.resource, ID.obligation);
    assert.deepEqual({ ...proof.historyHead }, { ...replay(handover.events).head });
    assert.deepEqual([...proof.controllingAuthorityIds], [ID.reviewAuthorityB]);
    assert.equal(proof.recognizedRoot.principalId, ID.principal);
    assert.equal(proof.permissionPath.length, 1);
    assert.equal(proof.permissionPath[0].grantorId, ID.principal);
    assert.equal(proof.permissionPath[0].granteeId, ID.b);
    assert.ok(proof.effectiveConstraints.actions.includes('record-review-progress'));
    assert.ok(proof.effectiveConstraints.resources.includes(ID.obligation));
  });

  test('the proof is frozen — a caller cannot edit a decision after the fact', () => {
    const result = authorize(handover, { actor: ID.b, action: 'record-review-progress', resource: ID.obligation });
    assert.throws(() => { result.proof.request.action = 'collect-evidence-packet'; }, TypeError);
    assert.throws(() => { result.decision = 'ALLOW'; }, TypeError);
  });

  test('the effective constraints never exceed the granted constraints', () => {
    const result = authorize(handover, { actor: ID.b, action: 'record-review-progress', resource: ID.obligation });
    const granted = result.proof.permissionPath[0].constraints;
    for (const action of result.proof.effectiveConstraints.actions) assert.ok(granted.actions.includes(action));
    for (const resource of result.proof.effectiveConstraints.resources) assert.ok(granted.resources.includes(resource));
    assert.ok(result.proof.effectiveConstraints.expiresAt <= granted.expiresAt);
  });
});

/** Contract-derived counterexamples, constructed before observing these test outputs.
 * Prohibition removal can restore permission; revoking an anchor cannot preserve its
 * own permission path. An alternative path is considered separately, not inherited.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { core } from './helpers.mjs';
import { generateHistory, replayOf, decide } from './generators.mjs';

function fixture(seed, anchored) {
  const history = generateHistory(seed);
  const firstGrant = history.events.findIndex(event => event.type === 'AUTHORITY_GRANTED');
  const events = history.events.slice(0, firstGrant);
  const root = structuredClone(history.roots[0]);
  root.constraints = { actions: ['read'], resources: [history.resources[0]], expiresAt: 10000,
    maxDelegationDepth: 3, quantitative: false, requiredIntersectionIds: [] };
  function emit(name, type, data) {
    events.push({ id: `${name}:counter:${seed}`, timestamp: events.at(-1).timestamp + 1, type, data });
  }
  emit('root', 'AUTHORITY_GRANTED', { grant: root });
  let actor = root.granteeId;
  let anchor;
  if (anchored) {
    actor = history.agents.find(id => id !== root.granteeId);
    anchor = { ...root, authorityId: `anchor:counter:${seed}`, grantorId: root.granteeId,
      granteeId: actor, parentAuthorityId: root.authorityId,
      constraints: { ...root.constraints, maxDelegationDepth: 1 } };
    emit('anchor', 'AUTHORITY_GRANTED', { grant: anchor });
  }
  const grant = { kind: 'PROHIBITION', scope: 'ROOT', authorityId: `prohibit:counter:${seed}`,
    grantorId: anchored ? actor : history.principalId, subjectActorId: actor,
    rootAuthorityId: root.authorityId,
    ...(anchored ? { parentAuthorityId: anchor.authorityId } : {}),
    constraints: { ...root.constraints, maxDelegationDepth: 0 } };
  const before = [...events];
  emit('prohibition', 'AUTHORITY_GRANTED', { grant });
  const blocked = [...events];
  const revoke = authorityId => [...blocked, { id: `revoke:counter:${seed}`, timestamp: events.at(-1).timestamp + 1,
    type: 'AUTHORITY_REVOKED', data: { authorityId, revokerId: history.principalId } }];
  const request = { actor, action: 'read', resource: history.resources[0], at: 1000 };
  return { history, before, blocked, revoke, grant, anchor, request };
}

for (const seed of [1, 7, 19, 31, 61, 127]) {
  test(`seed ${seed}: revoking an applicable root prohibition restores existing permission`, () => {
    const f = fixture(seed, false);
    const after = f.revoke(f.grant.authorityId);
    for (const events of [f.before, f.blocked, after]) assert.equal(replayOf(events).status, 'ACCEPTED');
    assert.equal(decide(f.history, f.before, f.request).decision, 'ALLOW');
    const blocked = decide(f.history, f.blocked, f.request);
    assert.equal(blocked.decision, 'DENY'); assert.equal(blocked.code, 'PROHIBITED');
    assert.equal(decide(f.history, after, f.request).decision, 'ALLOW');
  });
  test(`seed ${seed}: revoking the permission anchor does not restore that revoked path`, () => {
    const f = fixture(seed, true);
    const after = f.revoke(f.anchor.authorityId);
    for (const events of [f.before, f.blocked, after]) assert.equal(replayOf(events).status, 'ACCEPTED');
    assert.equal(decide(f.history, f.before, f.request).decision, 'ALLOW');
    assert.equal(decide(f.history, f.blocked, f.request).code, 'PROHIBITED');
    const result = decide(f.history, after, f.request);
    assert.equal(result.decision, 'DENY'); assert.equal(result.code, 'REVOKED');
  });
}

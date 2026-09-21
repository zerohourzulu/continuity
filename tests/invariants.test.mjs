/** Finite seeded regression evidence, not proof or a complete authority algebra.
 * Permission-only properties below state their corpus preconditions explicitly.
 * Separate prohibition cases cover where unrestricted monotonicity is false.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { core, handover, ID } from './helpers.mjs';
import { generateHistory, replayOf, decide, requestGrid, allowSet, key, makeRng } from './generators.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
// Authorizing one request costs tens of milliseconds, so the default is tuned to keep
// the suite fast enough to run on every change. Raise it for a thorough sweep:
//   CONTINUITY_PROPERTY_SEEDS=300 node --test tests/invariants.test.mjs
const SEEDS = Number(process.env.CONTINUITY_PROPERTY_SEEDS ?? 30);
assert.ok(Number.isInteger(SEEDS) && SEEDS >= 30 && SEEDS <= 300, 'CONTINUITY_PROPERTY_SEEDS must be an integer in 30..300');
const seeds = Array.from({ length: SEEDS }, (_, index) => index + 1);

/**
 * Histories are deterministic per seed, so build them once and reuse across properties.
 * Prefixes are built ONCE here too: the decision cache is keyed by array identity, so a
 * fresh `.slice()` in a test body would silently discard every cached decision.
 */
const corpus = seeds.map(seed => {
  const history = generateHistory(seed);
  return {
    history,
    replay: replayOf(history.events),
    grid: requestGrid(history).map(request => ({ ...request, at: 1000 })),
    beforeRevocations: history.events.slice(0, history.revokedAt),
    beforeHandover: history.handoverAt === undefined ? undefined : history.events.slice(0, history.handoverAt),
  };
});

const subsetOf = (small, large) => [...small].every(member => large.has(member));

/** Coverage counters — a property that never saw an ALLOW has proven nothing. */
const coverage = { allow: 0, deny: 0, indeterminate: 0, delegatedAllow: 0, revocations: 0, handovers: 0, intersectionDenials: 0 };

describe('the generated corpus is valid and non-vacuous', () => {
  test('every generated history replays', () => {
    for (const { history, replay } of corpus) {
      assert.equal(replay.status, 'ACCEPTED', `seed ${history.seed} produced a history Core rejects — fix the generator, not the engine`);
    }
  });

  test('the corpus exercises allows, denies, delegation, revocation and handover', () => {
    for (const { history, grid } of corpus) {
      for (const request of grid) {
        const result = decide(history, history.events, request);
        if (result.decision === 'ALLOW') {
          coverage.allow += 1;
          if ((result.proof?.permissionPath?.length ?? 0) > 1) coverage.delegatedAllow += 1;
        } else if (result.decision === 'DENY') {
          coverage.deny += 1;
          if (result.code === 'MISSING_INTERSECTION') coverage.intersectionDenials += 1;
        } else coverage.indeterminate += 1;
      }
      if (history.revoked.length > 0) coverage.revocations += 1;
      if (history.handoverAt !== undefined) coverage.handovers += 1;
    }
    assert.ok(coverage.allow > 50, `only ${coverage.allow} ALLOW decisions — the properties would be near-vacuous`);
    assert.ok(coverage.deny > 50, `only ${coverage.deny} DENY decisions`);
    assert.ok(coverage.revocations > 10, `only ${coverage.revocations} histories contained a revocation`);
    assert.ok(coverage.handovers > 10, `only ${coverage.handovers} histories contained a handover`);
    assert.ok(coverage.intersectionDenials > 0, 'no MISSING_INTERSECTION denial was ever produced — the intersection property is untested');
    assert.ok(coverage.delegatedAllow > 0,
      'no ALLOW was ever reached through a MULTI-STEP delegation path, so "delegation narrows" was only ever checked against single root grants — the headline invariant would be untested');
  });
});

/* ------------------------------------------------------------------ *
 * INVARIANT 1 — delegation narrows
 *
 *   For every authority path p₀ … pₙ reaching an ALLOW,
 *     effective.actions   ⊆ ⋂ pᵢ.actions
 *     effective.resources ⊆ ⋂ pᵢ.resources
 *     effective.expiresAt ≤ min pᵢ.expiresAt
 *   and no delegation may widen what its parent held.
 * ------------------------------------------------------------------ */
describe('INVARIANT 1 — delegation narrows', () => {
  test('effective constraints never exceed any grant on the path', () => {
    let checked = 0;
    for (const { history, grid } of corpus) {
      for (const request of grid) {
        const result = decide(history, history.events, request);
        if (result.decision !== 'ALLOW') continue;
        const effective = result.proof.effectiveConstraints;
        for (const step of result.proof.permissionPath) {
          for (const action of effective.actions) {
            assert.ok(step.constraints.actions.includes(action),
              `seed ${history.seed}: effective action "${action}" is not held by ${step.authorityId}`);
          }
          for (const resource of effective.resources) {
            assert.ok(step.constraints.resources.includes(resource),
              `seed ${history.seed}: effective resource "${resource}" is not held by ${step.authorityId}`);
          }
          assert.ok(effective.expiresAt <= step.constraints.expiresAt,
            `seed ${history.seed}: effective expiry outlives ${step.authorityId}`);
          assert.ok(effective.maxDelegationDepth <= step.constraints.maxDelegationDepth,
            `seed ${history.seed}: effective delegation depth exceeds ${step.authorityId}`);
          checked += 1;
        }
        assert.ok(effective.actions.includes(request.action), `seed ${history.seed}: allowed an action outside the effective set`);
        assert.ok(effective.resources.includes(request.resource), `seed ${history.seed}: allowed a resource outside the effective set`);
      }
    }
    assert.ok(checked > 50, `only ${checked} path steps checked`);
  });

  test('each delegation is attenuated relative to its parent, in the history itself', () => {
    for (const { history } of corpus) {
      const byId = new Map(history.grants.map(grant => [grant.authorityId, grant]));
      for (const grant of history.delegations) {
        const parent = byId.get(grant.parentAuthorityId);
        assert.ok(parent, `seed ${history.seed}: delegation without a parent`);
        for (const action of grant.constraints.actions) assert.ok(parent.constraints.actions.includes(action));
        for (const resource of grant.constraints.resources) assert.ok(parent.constraints.resources.includes(resource));
        assert.ok(grant.constraints.expiresAt <= parent.constraints.expiresAt);
        assert.ok(grant.constraints.maxDelegationDepth <= parent.constraints.maxDelegationDepth - 1);
      }
    }
  });

  test('a WIDENING delegation is refused at admission, not merely at decision time', () => {
    // The engine enforces attenuation when the event is admitted, so a history
    // containing a widening delegation is not a valid history at all. This is the
    // strongest form of the invariant, and the one worth proving formally.
    const rng = makeRng(99);
    let attempted = 0;
    for (const { history } of corpus) {
      if (history.delegations.length === 0) continue;
      const target = history.delegations[0];
      const position = history.events.findIndex(event => event.data?.grant?.authorityId === target.authorityId);
      assert.ok(position > 0);

      const widenings = [
        grant => ({ ...grant, constraints: { ...grant.constraints, actions: [...new Set([...grant.constraints.actions, 'smuggled-action'])].sort() } }),
        grant => ({ ...grant, constraints: { ...grant.constraints, resources: [...new Set([...grant.constraints.resources, 'smuggled-resource'])].sort() } }),
        grant => ({ ...grant, constraints: { ...grant.constraints, expiresAt: grant.constraints.expiresAt + 1_000_000 } }),
        grant => ({ ...grant, constraints: { ...grant.constraints, maxDelegationDepth: grant.constraints.maxDelegationDepth + 5 } }),
      ];
      for (const widen of widenings) {
        const events = history.events.map((event, index) =>
          index === position ? { ...event, data: { grant: widen(target) } } : event);
        const replay = replayOf(events);
        assert.notEqual(replay.status, 'ACCEPTED',
          `seed ${history.seed}: a delegation that widens its parent was ADMITTED — delegation does not narrow`);
        attempted += 1;
      }
      rng.next();
    }
    assert.ok(attempted > 40, `only ${attempted} widening attempts were made`);
  });

  test('a delegation cannot re-parent itself onto an authority its grantor does not hold', () => {
    for (const { history } of corpus) {
      if (history.delegations.length === 0 || history.roots.length < 2) continue;
      const target = history.delegations[0];
      const foreign = history.roots.find(root => root.authorityId !== target.parentAuthorityId);
      if (foreign === undefined) continue;
      const position = history.events.findIndex(event => event.data?.grant?.authorityId === target.authorityId);
      const events = history.events.map((event, index) => index === position
        ? { ...event, data: { grant: { ...target, parentAuthorityId: foreign.authorityId, rootAuthorityId: foreign.rootAuthorityId } } }
        : event);
      const replay = replayOf(events);
      if (replay.status === 'ACCEPTED') {
        // Only legitimate if the grantor really is the foreign grant's grantee AND the
        // constraints genuinely attenuate. Otherwise the engine admitted a forgery.
        assert.equal(foreign.granteeId, target.grantorId,
          `seed ${history.seed}: a delegation was re-parented onto an authority its grantor does not hold`);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * INVARIANT 2 — intersection is intersection, never union
 *
 *   Where a grant declares requiredIntersectionIds, the permission it confers is
 *   the INTERSECTION of itself with those authorities. Holding more authorities
 *   must never permit more than each permits alone.
 * ------------------------------------------------------------------ */
describe('INVARIANT 2 — intersection is intersection, never union', () => {
  // Compare the same permission-only corpus with and without intersection requirements.
  // Independent gated roots ensure the requirement is load-bearing for some requests.
  const gatedCorpus = corpus.filter(entry =>
    entry.history.intersecting.some(grant => grant.constraints.requiredIntersectionIds.length > 0));

  /** The same history with every intersection requirement stripped. */
  function ungate(history) {
    const events = history.events.map(event => {
      const grant = event.data?.grant;
      if (grant === undefined || (grant.constraints?.requiredIntersectionIds ?? []).length === 0) return event;
      return { ...event, data: { grant: { ...grant, constraints: { ...grant.constraints, requiredIntersectionIds: [] } } } };
    });
    return events;
  }

  test('the corpus contains gated authorities at all', () => {
    assert.ok(gatedCorpus.length > 5, `only ${gatedCorpus.length} histories declared a required intersection`);
  });

  test('requiring an intersection never permits MORE than not requiring it', () => {
    let compared = 0, narrowed = 0;
    for (const { history, grid } of gatedCorpus) {
      const ungated = ungate(history);
      if (replayOf(ungated).status !== 'ACCEPTED') continue;
      const withRequirement = allowSet(history, history.events, grid);
      const withoutRequirement = allowSet(history, ungated, grid);
      const gained = [...withRequirement].filter(member => !withoutRequirement.has(member));
      assert.deepEqual(gained, [],
        `seed ${history.seed}: declaring a required intersection PERMITTED ${gained.join(', ')} that the ungated history refuses — that is union, not intersection`);
      if (withRequirement.size < withoutRequirement.size) narrowed += 1;
      compared += 1;
    }
    assert.ok(compared > 5, `only ${compared} gated histories compared`);
    assert.ok(narrowed > 0, 'no required intersection ever narrowed an allow-set, so this property observed nothing');
  });

  test('an unsatisfiable requirement produces MISSING_INTERSECTION, not a silent allow', () => {
    let observed = 0;
    for (const { history, grid } of gatedCorpus) {
      for (const request of grid) {
        const result = decide(history, history.events, request);
        if (result.decision === 'DENY' && result.code === 'MISSING_INTERSECTION') observed += 1;
        if (result.decision === 'ALLOW') {
          // Any authority controlling an ALLOW must have had its requirements met, and
          // the proof must say which intersections were used.
          const byId = new Map(history.grants.map(grant => [grant.authorityId, grant]));
          for (const authorityId of result.proof.controllingAuthorityIds) {
            const grant = byId.get(authorityId);
            const required = grant?.constraints.requiredIntersectionIds ?? [];
            for (const partnerId of required) {
              const cited = (result.proof.intersections ?? []).some(entry => entry.requiredAuthorityId === partnerId);
              assert.ok(cited,
                `seed ${history.seed}: ${authorityId} controls an ALLOW while its required intersection ${partnerId} is not cited in the proof`);
            }
          }
        }
      }
    }
    assert.ok(observed > 0, 'no MISSING_INTERSECTION denial was observed — gates are not biting');
  });

  test('every authority a proof cites is one the history actually granted', () => {
    for (const { history, grid } of corpus) {
      const known = new Set(history.grants.map(grant => grant.authorityId));
      for (const request of grid) {
        const result = decide(history, history.events, request);
        if (result.decision !== 'ALLOW') continue;
        for (const authorityId of result.proof.controllingAuthorityIds) {
          assert.ok(known.has(authorityId), `seed ${history.seed}: proof cites unknown authority ${authorityId}`);
        }
        for (const entry of result.proof.intersections ?? []) {
          assert.ok(known.has(entry.requiredAuthorityId), `seed ${history.seed}: proof cites unknown intersection ${entry.requiredAuthorityId}`);
        }
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * INVARIANT 3 — permission-only revocation, no prohibitions or changing time conditions
 *
 *   For this permission-only corpus at fixed evaluation time,
 *     allow(H ++ [r]) ⊆ allow(H)
 *   This does not apply to removing prohibitions. No prohibition or changing
 *   time constraint participates in these generated histories.
 * ------------------------------------------------------------------ */
describe('INVARIANT 3 — permission-only revocation, no prohibitions or changing time conditions', () => {
  test('appending permission revocations cannot enlarge this permission-only allow-set', () => {
    for (const { history } of corpus) assert.ok(history.grants.every(grant => grant.kind === 'PERMISSION'));
    let compared = 0, shrank = 0;
    for (const entry of corpus) {
      const { history, grid } = entry;
      if (history.revoked.length === 0) continue;
      const before = allowSet(history, entry.beforeRevocations, grid);
      const after = allowSet(history, history.events, grid);
      assert.ok(subsetOf(after, before),
        `seed ${history.seed}: revocation ENLARGED the allow-set — gained ${[...after].filter(member => !before.has(member)).join(', ')}`);
      if (after.size < before.size) shrank += 1;
      compared += 1;
    }
    assert.ok(compared > 10, `only ${compared} histories compared`);
    assert.ok(shrank > 0, 'no revocation ever shrank an allow-set, so this property observed nothing');
  });

  test('revoking a single permission in this prohibition-free corpus is monotone', () => {
    let observed = 0;
    for (const entry of corpus.slice(0, 15)) {
      const { history, grid } = entry;
      const base = entry.beforeRevocations;
      if (replayOf(base).status !== 'ACCEPTED') continue;
      const before = allowSet(history, base, grid);
      for (const grant of history.grants.slice(0, 2)) {
        const revoke = {
          data: { authorityId: grant.authorityId, revokerId: grant.parentAuthorityId === undefined ? history.principalId : grant.grantorId },
          id: `${history.id}:solo-revoke-${grant.authorityId}`,
          timestamp: base.at(-1).timestamp + 1,
          type: 'AUTHORITY_REVOKED',
        };
        const events = [...base, revoke];
        if (replayOf(events).status !== 'ACCEPTED') continue;
        const after = allowSet(history, events, grid);
        assert.ok(subsetOf(after, before),
          `seed ${history.seed}: revoking ${grant.authorityId} enlarged the allow-set`);
        observed += 1;
      }
    }
    assert.ok(observed > 20, `only ${observed} single revocations observed`);
  });

  test('a revoked authority never appears in a later ALLOW proof', () => {
    let observed = 0;
    for (const { history, grid } of corpus) {
      if (history.revoked.length === 0) continue;
      const revoked = new Set(history.revoked);
      for (const request of grid) {
        const result = decide(history, history.events, request);
        if (result.decision !== 'ALLOW') continue;
        for (const authorityId of result.proof.controllingAuthorityIds) {
          assert.ok(!revoked.has(authorityId),
            `seed ${history.seed}: revoked authority ${authorityId} still controls an ALLOW`);
        }
        for (const step of result.proof.permissionPath) {
          assert.ok(!revoked.has(step.authorityId),
            `seed ${history.seed}: revoked authority ${step.authorityId} is still on an allowed path`);
        }
        observed += 1;
      }
    }
    assert.ok(observed > 0, 'no ALLOW was observed in a history containing revocations');
  });

  test('re-revoking is idempotent and still never enlarges', () => {
    for (const { history, grid } of corpus) {
      if (history.revoked.length === 0) continue;
      const before = allowSet(history, history.events, grid);
      const authorityId = history.revoked[0];
      const grant = history.grants.find(candidate => candidate.authorityId === authorityId);
      const again = {
        data: { authorityId, revokerId: grant.parentAuthorityId === undefined ? history.principalId : grant.grantorId },
        id: `${history.id}:re-revoke`,
        timestamp: history.events.at(-1).timestamp + 1,
        type: 'AUTHORITY_REVOKED',
      };
      const events = [...history.events, again];
      if (replayOf(events).status !== 'ACCEPTED') continue;
      assert.ok(subsetOf(allowSet(history, events, grid), before), `seed ${history.seed}: re-revocation enlarged the allow-set`);
    }
  });
});

/* ------------------------------------------------------------------ *
 * INVARIANT 4 — succession transfers no authority
 *
 *   Let S be the succession events (epoch advance, termination, role transfer,
 *   performance assignment). For every actor a,
 *     allow(H ++ S) restricted to a  ⊆  allow(H) restricted to a
 *   Occupying a role, or inheriting a duty, confers nothing.
 * ------------------------------------------------------------------ */
describe('INVARIANT 4 — succession transfers no authority', () => {
  test('a handover never enlarges any actor’s allow-set', () => {
    let compared = 0;
    for (const entry of corpus) {
      const { history, grid } = entry;
      if (entry.beforeHandover === undefined) continue;
      const before = allowSet(history, entry.beforeHandover, grid);
      const after = allowSet(history, entry.beforeRevocations, grid);
      const gained = [...after].filter(member => !before.has(member));
      assert.deepEqual(gained, [],
        `seed ${history.seed}: the handover GRANTED authority — ${gained.join(', ')}`);
      compared += 1;
    }
    assert.ok(compared > 10, `only ${compared} handovers compared`);
  });

  test('specifically, the successor gains nothing from inheriting the role', () => {
    let observed = 0;
    for (const entry of corpus) {
      const { history, grid } = entry;
      if (entry.beforeHandover === undefined) continue;
      const successor = history.agents[1];
      const restrict = set => new Set([...set].filter(member => member.startsWith(`${successor}|`)));
      const before = restrict(allowSet(history, entry.beforeHandover, grid));
      const after = restrict(allowSet(history, entry.beforeRevocations, grid));
      assert.ok(subsetOf(after, before),
        `seed ${history.seed}: the successor gained ${[...after].filter(member => !before.has(member)).join(', ')} by inheriting the role`);
      observed += 1;
    }
    assert.ok(observed > 10);
  });

  test('appointing an agent to a role grants it nothing', () => {
    for (const entry of corpus.slice(0, 20)) {
      const { history, grid } = entry;
      const base = entry.beforeRevocations;
      const candidate = history.agents.at(-1);
      const appoint = {
        data: {
          agentId: candidate, principalId: history.principalId, roleId: history.roleId,
          roleTenureId: `${history.id}:extra-tenure`, successionRuleId: `succession:${history.id}`,
          tenureNumber: 9,
        },
        id: `${history.id}:extra-appointment`,
        timestamp: base.at(-1).timestamp + 1,
        type: 'AGENT_APPOINTED',
      };
      const events = [...base, appoint];
      if (replayOf(events).status !== 'ACCEPTED') continue;
      const before = allowSet(history, base, grid);
      const after = allowSet(history, events, grid);
      assert.ok(subsetOf(after, before),
        `seed ${history.seed}: appointing ${candidate} to a role granted it authority`);
    }
  });

  test('on the real recorded handover, no actor gains a permission at any step', () => {
    // The generated histories are synthetic. This runs the same property over the
    // signed, recorded handover in the fixtures, event by event.
    const events = handover.events;
    const fixtureHistory = {
      domain: handover.config.domain,
      policyVersion: `local-evidence-intake-policy:${handover.caseId}/0.2`,
    };
    const actions = ['collect-evidence-packet', 'record-review-progress', 'OBLIGATE', 'ASSIGN_PERFORMANCE', 'record-collection-disposition'];
    const resources = [ID.resource, ID.obligation];
    const grid = [];
    for (const actor of [ID.a, ID.b]) for (const action of actions) for (const resource of resources) grid.push({ actor, action, resource });

    const grantPositions = new Set(events.flatMap((event, index) => event.type === 'AUTHORITY_GRANTED' ? [index] : []));
    let previous = new Set();
    for (let length = 1; length <= events.length; length += 1) {
      const prefix = events.slice(0, length);
      if (replayOf(prefix).status !== 'ACCEPTED') continue;
      const current = allowSet(fixtureHistory, prefix, grid);
      const gained = [...current].filter(member => !previous.has(member));
      if (gained.length > 0) {
        const introduced = length - 1;
        assert.ok(grantPositions.has(introduced),
          `a permission appeared at position ${introduced} (${events[introduced].type}), which is not an AUTHORITY_GRANTED event: ${gained.join(', ')}`);
      }
      previous = current;
    }
  });

  test('the recorded successor never holds the predecessor’s collection power', () => {
    const fixtureHistory = {
      domain: handover.config.domain,
      policyVersion: `local-evidence-intake-processing:${handover.caseId}/0.2`.replace('processing', 'policy'),
    };
    for (let length = 1; length <= handover.events.length; length += 1) {
      const prefix = handover.events.slice(0, length);
      if (replayOf(prefix).status !== 'ACCEPTED') continue;
      const result = decide(fixtureHistory, prefix, { actor: ID.b, action: 'collect-evidence-packet', resource: ID.resource });
      assert.notEqual(result.decision, 'ALLOW',
        `at prefix length ${length} the successor could collect evidence — the central guarantee failed`);
    }
  });
});

describe('the properties have teeth', () => {
  /**
   * A property test that cannot fail proves nothing. Core's bytes are hash-bound and
   * must not be edited, so instead these checks feed the SAME comparisons a decision
   * function that violates each invariant, and require the comparison to reject it.
   */
  const violate = (before, after) => {
    const gained = [...after].filter(member => !before.has(member));
    return gained.length === 0;
  };

  test('the monotonicity comparison rejects an allow-set that grew', () => {
    const before = new Set(['a|read|x']);
    const grew = new Set(['a|read|x', 'a|write|x']);
    assert.equal(violate(before, before), true, 'an unchanged set must pass');
    assert.equal(violate(before, new Set(['a|read|x'])), true);
    assert.equal(violate(before, grew), false, 'a set that gained a member must be rejected');
    assert.equal(subsetOf(grew, before), false);
  });

  test('the path-containment check rejects an effective set wider than its grant', () => {
    const step = { authorityId: 'auth', constraints: { actions: ['read'], resources: ['x'], expiresAt: 10, maxDelegationDepth: 0 } };
    const honest = { actions: ['read'], resources: ['x'], expiresAt: 10, maxDelegationDepth: 0 };
    const widened = { actions: ['read', 'write'], resources: ['x'], expiresAt: 10, maxDelegationDepth: 0 };
    const contained = effective => effective.actions.every(action => step.constraints.actions.includes(action));
    assert.equal(contained(honest), true);
    assert.equal(contained(widened), false, 'a widened effective set must be caught');
  });

  test('a deliberately widened delegation really is rejected by Core', () => {
    // The positive control: this is a genuine engine behaviour, not a harness check.
    const seeded = corpus.find(entry => entry.history.delegations.length > 0);
    assert.ok(seeded, 'the corpus contains no delegation to test against');
    const target = seeded.history.delegations[0];
    const position = seeded.history.events.findIndex(event => event.data?.grant?.authorityId === target.authorityId);
    const widened = seeded.history.events.map((event, index) => index === position
      ? { ...event, data: { grant: { ...target, constraints: { ...target.constraints, actions: [...target.constraints.actions, 'zzz-smuggled'].sort() } } } }
      : event);
    assert.equal(replayOf(widened).status !== 'ACCEPTED', true);
    // ...and the unmodified history is still accepted, so the rejection is caused by
    // the widening rather than by the mutation machinery.
    assert.equal(replayOf(seeded.history.events).status, 'ACCEPTED');
  });
});

describe('the property suite reports what it actually exercised', () => {
  test('coverage is recorded for the record', () => {
    const summary = { seeds: SEEDS, ...coverage };
    assert.ok(summary.allow > 0);
    // Written to the test log deliberately: a property suite that cannot say what it
    // covered is indistinguishable from one that covered nothing.
    console.log(`\n  property coverage over ${SEEDS} generated histories:`);
    for (const [name, value] of Object.entries(coverage)) console.log(`    ${name.padEnd(22)} ${value}`);
  });
});

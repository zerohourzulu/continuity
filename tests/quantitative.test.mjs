/** Contributed quantitative regression cases, supplementing existing Core checks. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { core, mandate, MANDATE, authorize, replay, clone } from './helpers.mjs';

/** The mandate history without the non-quantitative grant, so denial codes are unambiguous. */
const onlyQuantitative = { ...mandate, events: mandate.events.slice(0, 6) };

const ask = (fixture, actor, amount) =>
  authorize(fixture, { actor, action: 'purchase', resource: MANDATE.plush, amount });

describe('the fixture itself', () => {
  test('it replays and carries real BigInt amounts', () => {
    assert.equal(replay(mandate.events).status, 'ACCEPTED');
    const grant = mandate.events.find(event => event.data?.grant?.authorityId === MANDATE.mandateAuthority).data.grant;
    assert.equal(typeof grant.constraints.maxAmount, 'bigint');
    assert.equal(grant.constraints.maxAmount, MANDATE.perPurchase);
    assert.equal(grant.constraints.maxCumulativeAmount, MANDATE.cumulative);
    assert.equal(grant.constraints.maxTransactions, MANDATE.purchases);
    assert.equal(grant.constraints.quantitative, true);
  });

  test('the quantitative-only slice is still a valid history', () => {
    assert.equal(replay(onlyQuantitative.events).status, 'ACCEPTED');
  });
});

describe('the per-purchase ceiling', () => {
  test('under the cap is allowed', () => {
    assert.equal(ask(onlyQuantitative, MANDATE.buyer, 1999n).decision, 'ALLOW');
  });

  test('exactly at the cap is allowed — the bound is inclusive', () => {
    assert.equal(ask(onlyQuantitative, MANDATE.buyer, MANDATE.perPurchase).decision, 'ALLOW');
  });

  test('one over the cap is refused, with the specific code', () => {
    const result = ask(onlyQuantitative, MANDATE.buyer, MANDATE.perPurchase + 1n);
    assert.equal(result.decision, 'DENY');
    assert.equal(result.code, 'AMOUNT_EXCEEDED');
  });

  test('a vastly larger amount is refused the same way, not differently', () => {
    assert.equal(ask(onlyQuantitative, MANDATE.buyer, 10n ** 30n).code, 'AMOUNT_EXCEEDED');
  });

  test('zero is a valid amount', () => {
    assert.equal(ask(onlyQuantitative, MANDATE.buyer, 0n).decision, 'ALLOW');
  });

  test('a quantitative authority refuses a request that carries no amount', () => {
    const result = ask(onlyQuantitative, MANDATE.buyer, undefined);
    assert.equal(result.decision, 'DENY');
    assert.equal(result.code, 'AMOUNT_REQUIRED');
  });

  test('a negative amount is rejected as malformed, not merely denied', () => {
    const result = ask(onlyQuantitative, MANDATE.buyer, -1n);
    assert.notEqual(result.decision, 'ALLOW');
    assert.ok(['INVALID_REQUEST', 'INVALID_AMOUNT'].includes(result.code) || result.decision === 'INDETERMINATE',
      `unexpected handling of a negative amount: ${result.decision} / ${result.code}`);
  });

  test('a non-quantitative authority is unaffected by amounts', () => {
    const result = authorize(mandate, { actor: MANDATE.buyer, action: 'report', resource: MANDATE.plush });
    assert.equal(result.decision, 'ALLOW');
    assert.equal(result.proof.effectiveConstraints.quantitative, false);
  });
});

describe('a delegated budget narrows, like every other constraint', () => {
  test('the researcher may spend within its own smaller cap', () => {
    assert.equal(ask(mandate, MANDATE.researcher, 400n).decision, 'ALLOW');
  });

  test('the researcher may NOT spend up to the parent mandate’s cap', () => {
    // 600 is inside the buyer's 2500 but outside the researcher's 500. Delegation
    // narrows: holding a delegated budget never confers the grantor's budget.
    const result = ask(mandate, MANDATE.researcher, 600n);
    assert.equal(result.decision, 'DENY');
    assert.equal(result.code, 'AMOUNT_EXCEEDED');
    assert.equal(ask(mandate, MANDATE.buyer, 600n).decision, 'ALLOW', 'the same amount is fine for the grantor');
  });

  test('a delegation that RAISES the amount ceiling is refused at admission', () => {
    const events = clone(mandate.events);
    const index = events.findIndex(event => event.data?.grant?.authorityId === MANDATE.researchAuthority);
    events[index].data.grant.constraints.maxAmount = MANDATE.perPurchase + 1n;
    assert.notEqual(replay(events).status, 'ACCEPTED',
      'a delegation may not grant a larger budget than its parent holds');
  });

  test('a delegation that raises the cumulative ceiling is refused at admission', () => {
    const events = clone(mandate.events);
    const index = events.findIndex(event => event.data?.grant?.authorityId === MANDATE.researchAuthority);
    events[index].data.grant.constraints.maxCumulativeAmount = MANDATE.cumulative + 1n;
    assert.notEqual(replay(events).status, 'ACCEPTED');
  });

  test('a delegation that raises the transaction count is refused at admission', () => {
    const events = clone(mandate.events);
    const index = events.findIndex(event => event.data?.grant?.authorityId === MANDATE.researchAuthority);
    events[index].data.grant.constraints.maxTransactions = MANDATE.purchases + 1;
    assert.notEqual(replay(events).status, 'ACCEPTED');
  });

  test('a quantitative parent cannot delegate a NON-quantitative child', () => {
    // Otherwise a budget could be escaped simply by dropping the flag.
    const events = clone(mandate.events);
    const index = events.findIndex(event => event.data?.grant?.authorityId === MANDATE.researchAuthority);
    const constraints = events[index].data.grant.constraints;
    constraints.quantitative = false;
    delete constraints.maxAmount;
    delete constraints.maxCumulativeAmount;
    assert.notEqual(replay(events).status, 'ACCEPTED');
  });
});

describe('the schema refuses incoherent quantitative shapes', () => {
  test('a non-quantitative grant may not carry amount ceilings', () => {
    const events = clone(mandate.events);
    const index = events.findIndex(event => event.data?.grant?.authorityId === MANDATE.reportAuthority);
    events[index].data.grant.constraints.maxAmount = 100n;
    assert.notEqual(replay(events).status, 'ACCEPTED');
  });

  test('an amount that is not a BigInt is refused', () => {
    const events = clone(mandate.events);
    const index = events.findIndex(event => event.data?.grant?.authorityId === MANDATE.mandateAuthority);
    events[index].data.grant.constraints.maxAmount = 2500;
    assert.notEqual(replay(events).status, 'ACCEPTED', 'an Amount is a BigInt, not a Number');
  });

  test('a negative ceiling is refused', () => {
    const events = clone(mandate.events);
    const index = events.findIndex(event => event.data?.grant?.authorityId === MANDATE.mandateAuthority);
    events[index].data.grant.constraints.maxAmount = -1n;
    assert.notEqual(replay(events).status, 'ACCEPTED');
  });
});

describe('what an ALLOW proof reveals about money', () => {
  test('the ceilings and the running usage are in the proof, in the clear', () => {
    // This is not a defect; it is the disclosure problem. A counterparty handed this
    // proof learns the mandate ceiling and how much has been spent against it, which is
    // the adverse-selection leak that a shielded amount would close. See lib/shielded.mjs.
    const result = ask(onlyQuantitative, MANDATE.buyer, 1999n);
    assert.equal(result.decision, 'ALLOW');
    const constraints = result.proof.effectiveConstraints;
    assert.equal(constraints.maxAmount, MANDATE.perPurchase);
    assert.equal(constraints.maxCumulativeAmount, MANDATE.cumulative);
    assert.equal(constraints.maxTransactions, MANDATE.purchases);
    assert.ok(Array.isArray(result.proof.usageSnapshot));
    assert.equal(result.proof.usageSnapshot[0].authorityId, MANDATE.mandateAuthority);
    assert.equal(result.proof.usageSnapshot[0].admittedCumulativeAmount, 0n);
    assert.equal(result.proof.usageSnapshot[0].admittedTransactionCount, 0);
  });

  test('the effective budget is the smaller of the path, like every other constraint', () => {
    const result = ask(mandate, MANDATE.researcher, 400n);
    assert.equal(result.decision, 'ALLOW');
    assert.equal(result.proof.effectiveConstraints.maxAmount, 500n,
      'the delegated budget, not the parent mandate');
    for (const step of result.proof.permissionPath) {
      assert.ok(result.proof.effectiveConstraints.maxAmount <= step.constraints.maxAmount);
    }
  });
});

describe('FINDING-006 — the headline denial code is the most fundamental one, across ALL authorities', () => {
  test('an over-budget purchase can be headlined by an unrelated grant’s failure', () => {
    // The buyer holds two grants: the mandate (purchase, budgeted) and a report grant
    // (non-quantitative, different action). An over-budget purchase fails the mandate on
    // AMOUNT_EXCEEDED and the report grant on ACTION_NOT_ALLOWED. The engine headlines
    // the lower-ranked, more fundamental code — which is the one from the grant the
    // actor never meant to use.
    const result = ask(mandate, MANDATE.buyer, MANDATE.perPurchase + 1n);
    assert.equal(result.decision, 'DENY');
    assert.equal(result.code, 'ACTION_NOT_ALLOWED');

    // The real reason is not lost. It is in `failures`, attributed to the right authority.
    const amountFailure = result.failures.find(failure => failure.code === 'AMOUNT_EXCEEDED');
    assert.ok(amountFailure, 'the budget failure must still be reported');
    assert.equal(amountFailure.failingAuthorityId, MANDATE.mandateAuthority);
  });

  test('with only the relevant grant present, the headline is the budget failure', () => {
    assert.equal(ask(onlyQuantitative, MANDATE.buyer, MANDATE.perPurchase + 1n).code, 'AMOUNT_EXCEEDED');
  });

  test('an integration that reads only `code` will mis-explain a denial', () => {
    // Pinned deliberately: this is the behaviour integrators trip over. Read `failures`.
    const result = ask(mandate, MANDATE.buyer, MANDATE.perPurchase + 1n);
    assert.notEqual(result.code, 'AMOUNT_EXCEEDED');
    assert.ok(result.failures.some(failure => failure.code === 'AMOUNT_EXCEEDED'));
    assert.ok(result.failures.length > 1, 'every candidate authority reports its own reason');
  });
});

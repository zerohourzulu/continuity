import test from 'node:test';
import assert from 'node:assert/strict';
import { readEvidenceView } from '../src/view.mjs';

test('readable survival view preserves Role bearer, separate assignee and unknown outcome', async () => {
  const view = await readEvidenceView('result.survives');
  assert.equal(view.viewKind, 'DERIVED_TYPED_VIEW');
  assert.equal(view.originalSha256, '721139dbc768b0a8cacdfec91512509c697564664dcdfc6df420d5d3fff44af6');
  assert.equal(view.originalBytes, 24125);
  assert.equal(view.scope.readerGrantsCurrentAuthority, false);
  assert.equal(view.data.answer.targetAgentId, 'agent:mr-hatter');
  assert.equal(view.data.answer.lifecycleStatus, 'TERMINATED');
  assert.equal(view.data.answer.obligations[0].durableRoleId, 'role:purchasing');
  assert.equal(view.data.answer.obligations[0].performanceAssigneeId, 'agent:dormouse');
  assert.equal(view.data.answer.obligations[0].status, 'OUTCOME_UNKNOWN');
  assert.deepEqual(view.data.answer.currentRoleTenures, []);
});

test('readable WHY views retain exact BigInt tags and distinct historical permission flags', async () => {
  const earlier = await readEvidenceView('result.whyAtEvaluation');
  const later = await readEvidenceView('result.why');
  assert.equal(earlier.data.answer.presentConsequentialUse, true);
  assert.equal(later.data.answer.presentConsequentialUse, false);
  assert.equal(earlier.data.scope.observedHead.position, 15);
  assert.equal(later.data.scope.observedHead.position, 29);
  assert.equal(earlier.data.answer.authorization.proof.request.amount['$continuity.bigint'], '1999');
  assert.equal(earlier.scope.readerGrantsCurrentAuthority, false);
});

test('denial view preserves missing request rather than introducing null; graph stays a plain-data view', async () => {
  const denial = await readEvidenceView('result.rabbitDeposit');
  assert.equal(denial.data.answer.authorization.code, 'ACTION_NOT_ALLOWED');
  assert.equal(Object.hasOwn(denial.data.answer, 'request'), false);
  assert.equal(Object.hasOwn(denial.data.answer.authorization, 'request'), false);
  const graph = await readEvidenceView('graph');
  assert.equal(graph.originalSha256, 'ceab96c93fe38a7d7938d2b30849fc03e2267c1d964746489a09eea1fc4faf6e');
  const grant = graph.data.graph.authorities.find(([id]) => id === 'authority:alice-to-dormouse-cheshire-remediation')[1].grant;
  assert.deepEqual(grant.constraints.resources, ['obligation:cheshire-delivery-resolution']);
  assert.equal(grant.constraints.actions.includes('purchase'), false);
});

test('view accepts only fixed catalog IDs', async () => {
  await assert.rejects(readEvidenceView('../private'), /Unknown evidence ID/);
  await assert.rejects(readEvidenceView('https://example.com'), /Unknown evidence ID/);
});

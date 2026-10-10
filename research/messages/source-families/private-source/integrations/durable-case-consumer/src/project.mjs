// Internal decoded-data projection. Authentication belongs to the fixed reader caller.
import { isDeepStrictEqual } from 'node:util';

export const PROFILE = 'durable-security';
export const CATALOG_SHA256 = 'ae5d8b2a8419432ded3f08167f43ff6b3a059aee272d7cb1a333fee87ab1a1d5';
export const SELECTED_EVIDENCE_IDS = Object.freeze(['query.survives', 'query.responsible', 'query.successorAllowed', 'receiptVerification', 'durabilityObservations', 'graph']);
export const OUTPUT_BYTES = 65536;
const CATALOG_ID = 'durable-security-retained-2026-09-11-r1';
const CASE = 'durable-security-case-001';
const DOMAIN = Object.freeze({ chainId: '31337', deploymentId: 'continuity-0.2-durable-security-case-001', protocol: 'continuity', verifyingContract: '0x0000000000000000000000000000000000002002', version: '0.1' });
const HEAD = Object.freeze({ canonicalTime: 25, hash: '0x49ee7bffa60cb7e4deb607550abe1f226ce6eb0b0e04a60c447182e8ed1f6b9e', position: 24 });
const ACTION_HEAD = Object.freeze({ canonicalTime: 11, hash: '0xf331331f496cadeac95dd6b530b8e47b15fe979520bfc99b649d7d58b4645708', position: 11 });
const ADMISSION_HEAD = Object.freeze({ canonicalTime: 12, hash: '0xe83ec0805c60155a9fdc281a89d648eaba5e2799796e73c5b56ee19352b31373', position: 12 });
const IDS = Object.freeze({ predecessor: 'agent:durable-security-collector-a-001', successor: 'agent:durable-security-collector-b-001', role: 'role:durable-security-case-001', obligation: 'obligation:durable-security-case-001-disposition', authority: 'authority:durable-security-case-001-disposition', principal: 'principal:durable-security-case-001', tenure: 'tenure:durable-security-case-001-b-2', intent: 'intent:durable-security-case-001-accept' });
const IDENTITIES = Object.freeze({
  'query.survives': [14372, '2adbdbd9b10e1876cb0887001c35a582d8ee61b6c211c5ea2d3e1176ad346eb7'],
  'query.responsible': [12582, '6288677bfe9ff359f87574015b518602a137bc759eb56e5fa7a6fd3bd69260bc'],
  'query.successorAllowed': [11182, '4948bfe8665b89868d39d4a44633e13ddeb464ef112b131958dd55368b259260'],
  receiptVerification: [6284, 'c1b1ec5b9765214dc773c1d8733a50b8b30ba0e05bd509a43f1a092bbe4b25bb'],
  durabilityObservations: [16207, '5b9b9ef2387caed32ec0bb8f16b8267dfafbf9f5aa413a9a3b0f99489d0d598c'],
  graph: [41924, '3f309332c5473a0f6777fda1217c5aa1c1dc556e4bf7fcb7d6e8b9272cd4a430'],
});
const fail = (field, code = 'DURABLE_CASE_INVALID') => { const error = new Error(`${code}: ${field}`); error.code = code; throw error; };
const check = (condition, field) => { if (!condition) fail(field); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, expected, field) => check(record(value) && isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort()), field);
const equal = (value, expected, field) => check(isDeepStrictEqual(value, expected), field);
const array = (value, field) => { check(Array.isArray(value), field); return value; };

// Bound and detach decoded test inputs without invoking accessors or erasing undefined.
function snapshot(input) {
  let nodes = 0, bytes = 0;
  const seen = new Set();
  function copy(value, depth) {
    check(++nodes <= 100000 && depth <= 64, 'input shape budget');
    if (typeof value === 'string') { bytes += Buffer.byteLength(value); check(bytes <= 1048576, 'input byte budget'); return value; }
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') { check(Number.isSafeInteger(value) && !Object.is(value, -0), 'unsupported number'); return value; }
    check(record(value) || Array.isArray(value), 'unsupported decoded value');
    check(!seen.has(value), 'cyclic input');
    const proto = Object.getPrototypeOf(value);
    check(Array.isArray(value) ? proto === Array.prototype : proto === Object.prototype || proto === null, 'unsupported prototype');
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(descriptors);
    check(names.every(name => typeof name === 'string'), 'symbol input');
    const result = Array.isArray(value) ? [] : {};
    if (Array.isArray(value)) {
      check(value.length <= 100000 && names.length === value.length + 1, 'sparse or decorated array');
      for (let i = 0; i < value.length; i++) {
        const d = descriptors[String(i)]; check(d && Object.hasOwn(d, 'value') && d.enumerable, 'array accessor');
        result.push(copy(d.value, depth + 1));
      }
    } else for (const name of names) {
      const d = descriptors[name]; check(Object.hasOwn(d, 'value') && d.enumerable, 'record accessor');
      bytes += Buffer.byteLength(name); check(bytes <= 1048576, 'input byte budget');
      Object.defineProperty(result, name, { value: copy(d.value, depth + 1), enumerable: true });
    }
    seen.delete(value);
    return Object.freeze(result);
  }
  return copy(input, 0);
}
function mapEntry(map, id, field) {
  keys(map, ['$securityCase.map'], field);
  const rows = array(map['$securityCase.map'], field), seen = new Set();
  for (const row of rows) {
    check(Array.isArray(row) && row.length === 2 && typeof row[0] === 'string' && !seen.has(row[0]) && record(row[1]), field);
    seen.add(row[0]);
  }
  const selected = rows.find(row => row[0] === id);
  check(selected !== undefined, field);
  return selected[1];
}
function one(items, predicate, field) {
  const found = array(items, field).filter(predicate); check(found.length === 1, field); return found[0];
}
function query(value, kind, evaluationHead, field) {
  keys(value, ['answer', 'epistemicStatus', 'kind', 'scope', 'version'], field);
  check(value.version === 'continuity-query-envelope/0.1' && value.kind === kind && value.epistemicStatus === 'ESTABLISHED' && record(value.answer), field);
  const scope = value.scope;
  keys(scope, ['canonicalLineageId', 'disclosure', 'domain', 'evaluationHead', 'externalAssumptions', 'finality', 'freshness', 'headRelationship', 'observedHead', 'policyVersion', 'recognizedRootIds', 'rootRecognitionPolicy', 'unavailableEvidence', 'versions', 'withheldEvidence'], `${field}.scope`);
  equal(scope.domain, DOMAIN, `${field}.domain`); equal(scope.observedHead, HEAD, `${field}.observedHead`); equal(scope.evaluationHead, evaluationHead, `${field}.evaluationHead`);
  check(scope.canonicalLineageId === 'lineage:continuity-0.2-durable-security-case-001' && scope.policyVersion === 'continuity-core-0.1/durable-security-policy-1' && scope.finality === 'LOCAL_ONLY', `${field}.scope identity`);
  check(scope.freshness === (kind === 'RESPONSIBLE' ? 'AT_EVALUATION' : 'CURRENT') && scope.headRelationship === (kind === 'RESPONSIBLE' ? 'STRICT_EXTENSION' : 'SAME_HEAD'), `${field}.temporal scope`);
  check(record(scope.disclosure) && record(scope.externalAssumptions) && record(scope.versions), `${field}.scope structure`);
  array(scope.disclosure.includedFields, `${field}.disclosure`); equal(scope.disclosure.withheldFields, [], `${field}.disclosure`);
  equal(scope.unavailableEvidence, [], `${field}.unavailableEvidence`); equal(scope.withheldEvidence, [], `${field}.withheldEvidence`);
  return value;
}

/** Internal testing seam: decoded data only, not byte authentication or Core evaluation. */
function project(input) {
  const captured = snapshot(input);
  keys(captured, ['catalog', 'catalogSha256', 'artifacts'], 'input');
  const { catalog, catalogSha256, artifacts } = captured;
  check(catalogSha256 === CATALOG_SHA256, 'catalog pin');
  check(record(catalog) && catalog.schemaVersion === 'continuity-retained-evidence/0.2' && catalog.catalogId === CATALOG_ID && catalog.resourceUri === 'continuity://durable-security/catalog', 'catalog identity');
  equal(catalog.domain, DOMAIN, 'catalog domain'); equal(catalog.historyHead, HEAD, 'catalog head');
  const scope = catalog.scope;
  keys(scope, ['kind', 'newEvaluation', 'newChainObservation', 'readerGrantsCurrentAuthority', 'coreExecution', 'evidenceClass', 'localFinality', 'roleDuty', 'realCollectionPerformed', 'note'], 'catalog scope fields');
  check(record(scope) && scope.kind === 'RETAINED_EVIDENCE' && scope.evidenceClass === 'LOCAL_SYNTHETIC_DURABLE_CASE' && scope.coreExecution === 'SIMULATED' && scope.localFinality === 'LOCAL_ONLY' && scope.roleDuty === 'OUTCOME_UNKNOWN' && scope.newEvaluation === false && scope.newChainObservation === false && scope.readerGrantsCurrentAuthority === false && scope.realCollectionPerformed === false, 'catalog scope');
  check(record(catalog.provenance) && typeof catalog.provenance.sourceQualifier === 'string' && typeof catalog.provenance.sourceRecord === 'string', 'catalog provenance');
  check(array(catalog.members, 'catalog members').length === 20 && new Set(catalog.members.map(m => m.evidenceId)).size === 20, 'catalog member identity');
  keys(artifacts, SELECTED_EVIDENCE_IDS, 'selected artifacts');
  const sources = {};
  for (const id of SELECTED_EVIDENCE_IDS) {
    const member = one(catalog.members, item => item.evidenceId === id, `source ${id}`), [bytes, sha256] = IDENTITIES[id];
    check(member.bytes === bytes && member.sha256 === sha256 && typeof member.encoding === 'string' && member.encoding.length > 0 && record(member.provenance), `source identity ${id}`);
    if (id.startsWith('query.')) {
      keys(member.provenance, ['kind', 'parentEvidenceId', 'parentSha256', 'memberKey', 'method'], `source provenance ${id}`);
      check(member.provenance.kind === 'COMPLETE_CANONICAL_MEMBER_EXTRACT' && member.provenance.parentEvidenceId === 'queries' && member.provenance.parentSha256 === 'eb3f44aae0b24146f0a7adb7c89a19c261abd77febb3c8be6fafedc53bf77bfe' && member.provenance.memberKey === id.slice(6) && typeof member.provenance.method === 'string', `source provenance ${id}`);
    } else {
      keys(member.provenance, ['kind', 'origin'], `source provenance ${id}`);
      check(member.provenance.kind === 'UNCHANGED_RETAINED_ARTIFACT' && typeof member.provenance.origin === 'string', `source provenance ${id}`);
    }
    sources[id] = { evidenceId: id, sha256: member.sha256, bytes: member.bytes, encoding: member.encoding, provenance: member.provenance };
  }
  const survives = query(artifacts['query.survives'], 'SURVIVES', HEAD, 'survives');
  const responsible = query(artifacts['query.responsible'], 'RESPONSIBLE', ACTION_HEAD, 'responsible');
  const allowed = query(artifacts['query.successorAllowed'], 'WHY', HEAD, 'successorAllowed');
  for (const id of SELECTED_EVIDENCE_IDS.filter(id => id.startsWith('query.'))) sources[id].queryScope = artifacts[id].scope;
  const graph = artifacts.graph;
  keys(graph, ['representation', 'schemaVersion', 'state'], 'graph');
  check(graph.schemaVersion === 'continuity-durable-security-graph/0.1' && typeof graph.representation === 'string' && record(graph.state), 'graph structure');
  const state = graph.state; equal(state.head, HEAD, 'graph head'); equal(state.genesis?.domain, DOMAIN, 'graph domain');
  check(state.genesis.canonicalLineageId === 'lineage:continuity-0.2-durable-security-case-001' && state.genesis.finality === 'LOCAL_ONLY', 'graph case');
  check(array(state.events, 'graph events').length === 25 && state.events[0].id === `${CASE}:genesis` && state.events[24].id === `${CASE}:duty-outcome-unknown`, 'graph event identity');
  const obligation = mapEntry(state.obligations, IDS.obligation, 'graph obligation');
  const grant = mapEntry(state.authorities, IDS.authority, 'successor grant');
  const role = mapEntry(state.roles, IDS.role, 'role');
  const tenure = mapEntry(state.tenures, IDS.tenure, 'successor tenure');
  const predecessor = mapEntry(state.agents, IDS.predecessor, 'predecessor');
  check(predecessor.id === IDS.predecessor && predecessor.terminated === true && predecessor.currentControlEpoch === 2, 'predecessor lifecycle');
  check(role.id === IDS.role && role.currentTenureId === IDS.tenure && tenure.id === IDS.tenure && tenure.agentId === IDS.successor && tenure.roleId === IDS.role && tenure.closed === false, 'successor role');
  check(obligation.status === 'OUTCOME_UNKNOWN' && obligation.performanceAssigneeId === IDS.successor && record(obligation.record), 'obligation state');
  const creation = obligation.record;
  check(creation.obligationId === IDS.obligation && creation.durableRoleId === IDS.role && creation.status === 'OPEN' && creation.performanceAssigneeId === IDS.predecessor && creation.sourceIntentId === IDS.intent && creation.deadline === 100, 'obligation identity');
  equal(creation.transitionPolicies, [
    { acceptedAttesterIds: ['adapter:simulated'], action: 'record-collection-disposition', fromStatus: 'OPEN', requiredAuthorityIds: [IDS.authority], toStatus: 'OUTCOME_UNKNOWN' },
    { acceptedAttesterIds: [IDS.principal], action: 'escalate', fromStatus: 'OUTCOME_UNKNOWN', requiredAuthorityIds: [IDS.authority], toStatus: 'IMPOSSIBLE_OR_ESCALATED' },
  ], 'transition policies');
  keys(grant, ['grant', 'grantEventId', 'grantEventPosition'], 'successor grant record');
  equal(grant.grant, { authorityId: IDS.authority, constraints: { actions: ['ASSIGN_PERFORMANCE', 'record-collection-disposition', 'escalate'], expiresAt: 100, maxDelegationDepth: 0, quantitative: false, requiredIntersectionIds: [], resources: [IDS.obligation] }, granteeId: IDS.successor, grantorId: IDS.principal, independent: true, kind: 'PERMISSION', rootAuthorityId: IDS.authority }, 'successor separate grant');
  check(grant.grantEventId === `${CASE}:successor-authority` && grant.grantEventPosition === 10, 'successor grant event');
  const survival = survives.answer;
  check(survival.exists === true && survival.targetAgentId === IDS.predecessor && survival.lifecycleStatus === 'TERMINATED', 'survival target');
  const duty = one(survival.obligations, item => item.obligationId === IDS.obligation, 'surviving obligation');
  keys(duty, ['deadline', 'durableRoleId', 'evidence', 'obligationId', 'performanceAssigneeId', 'status'], 'surviving obligation fields');
  array(duty.evidence, 'surviving obligation evidence');
  check(duty.status === obligation.status && duty.performanceAssigneeId === obligation.performanceAssigneeId && duty.durableRoleId === IDS.role && duty.deadline === 100, 'survival obligation');
  const assignment = one(survival.currentPerformanceAssignments, item => item.obligationId === IDS.obligation, 'performance assignment');
  keys(assignment, ['assigneeId', 'evidence', 'obligationId', 'successionRuleId'], 'performance assignment fields');
  array(assignment.evidence, 'performance assignment evidence');
  check(assignment.assigneeId === IDS.successor && assignment.successionRuleId === creation.successionRuleId, 'performance assignee');
  check(responsible.answer.authorizationDecision === 'ALLOW', 'responsible historical authorization');
  const attributions = array(responsible.answer.attributions, 'attributions');
  for (const a of attributions) { keys(a, ['evidence', 'kind', 'subjectId', 'temporalBasis'], 'attribution'); check(typeof a.kind === 'string' && typeof a.subjectId === 'string' && ['ACTION_PREFIX', 'LATER_CAUSAL_STATE'].includes(a.temporalBasis), 'attribution fields'); array(a.evidence, 'attribution evidence'); }
  one(attributions, a => a.kind === 'DURABLE_OBLIGOR' && a.subjectId === IDS.role, 'durable obligor');
  one(attributions, a => a.kind === 'PERFORMANCE_ASSIGNEE' && a.subjectId === IDS.successor, 'successor attribution');
  const auth = allowed.answer.authorization;
  keys(allowed.answer, ['authorization', 'presentConsequentialUse'], 'successor answer');
  keys(auth, ['consequential', 'decision', 'operationVersion', 'proof', 'scopeAssurance'], 'successor authorization fields');
  check(record(auth) && auth.decision === 'ALLOW' && auth.consequential === false && allowed.answer.presentConsequentialUse === false && record(auth.proof), 'nonconsequential authorization');
  equal(auth.proof.domain, DOMAIN, 'authorization domain'); equal(auth.proof.historyHead, HEAD, 'authorization head');
  equal(auth.proof.request, { actorId: IDS.successor, action: 'record-collection-disposition', resource: IDS.obligation, claimedAt: 25 }, 'authorization request');
  equal(auth.proof.controllingAuthorityIds, [IDS.authority], 'authorization authority');
  check(auth.proof.consequential === false && auth.proof.evaluationTime === 25, 'authorization evaluation');
  const receipt = artifacts.receiptVerification;
  const axes = ['canonicalInclusion', 'contentIntegrity', 'externalOutcome', 'finality', 'freshness', 'historicalAuthorization', 'issuerAuthentication', 'signaturePossession'];
  keys(receipt, [...axes, 'authentic', 'current', 'historical', 'limitations', 'operationVersion', 'status', 'valid'], 'receipt verification');
  check(receipt.operationVersion === 'continuity-receipt-verification/0.1' && receipt.status === 'EVALUATED' && receipt.authentic === true && receipt.historical === true && receipt.valid === true && receipt.current === false, 'receipt flags');
  for (const axis of axes) { keys(receipt[axis], ['causes', 'evidence', 'primaryCode', 'status'], `receipt ${axis}`); array(receipt[axis].causes, `receipt ${axis}.causes`); array(receipt[axis].evidence, `receipt ${axis}.evidence`); check(typeof receipt[axis].primaryCode === 'string' && ['PASS', 'FAIL', 'UNVERIFIED'].includes(receipt[axis].status), `receipt ${axis}.status`); }
  check(receipt.freshness.primaryCode === 'STALE' && receipt.freshness.status === 'FAIL' && receipt.externalOutcome.primaryCode === 'SIMULATED' && receipt.externalOutcome.status === 'UNVERIFIED' && receipt.finality.primaryCode === 'LOCAL_ONLY', 'receipt temporal axes');
  array(receipt.limitations, 'receipt limitations');
  const durable = artifacts.durabilityObservations;
  keys(durable, ['beforeInvoke', 'capabilityReuseMechanism', 'completeReopenMatched', 'consumption', 'expectedConsumptionId', 'finalClock', 'manualAppends', 'signatureRequests'], 'durability observations');
  keys(durable.beforeInvoke, ['admissionEventId', 'head', 'history', 'phase'], 'beforeInvoke');
  const before = durable.beforeInvoke;
  check(before.phase === 'BEFORE_FIRST_INVOKE' && before.admissionEventId === `${CASE}:source-admitted`, 'beforeInvoke identity'); equal(before.head, ADMISSION_HEAD, 'beforeInvoke head');
  equal(before.history, state.events.slice(0, 13), 'beforeInvoke history');
  equal(durable.consumption, state.events[13], 'consumption event');
  check(durable.consumption.id === creation.trigger && durable.consumption.id === durable.expectedConsumptionId && durable.consumption.type === 'TRANSACTION_INTENT_CONSUMED' && durable.consumption.data.intentId === IDS.intent && durable.consumption.data.status === 'SUBMITTED' && durable.consumption.data.adapterId === 'adapter:simulated', 'consumption identity');
  check(durable.completeReopenMatched === true && durable.signatureRequests === 6 && durable.finalClock === 25 && durable.capabilityReuseMechanism === 'CONSUMED_INSTANCE_LOCAL_CAPABILITY', 'durability values');
  array(durable.manualAppends, 'manual append observations');
  const result = {
    schemaVersion: 'continuity-durable-case-summary/0.1', kind: 'RETAINED_CASE_PRESENTATION',
    catalog: { profile: PROFILE, catalogId: CATALOG_ID, catalogSha256, scope },
    case: { caseId: CASE, domain: state.genesis.domain, observedHead: state.head, sourceEvidenceIds: ['graph'] },
    duty: { sourceEvidenceIds: ['query.survives', 'graph'], predecessor: { agentId: survival.targetAgentId, lifecycleStatus: survival.lifecycleStatus }, obligation: duty, creation: { status: creation.status, performanceAssigneeId: creation.performanceAssigneeId }, transitionPolicies: creation.transitionPolicies },
    responsibility: { sourceEvidenceIds: ['query.responsible'], authorizationDecision: responsible.answer.authorizationDecision, attributions },
    successor: { sourceEvidenceIds: ['query.survives', 'query.successorAllowed', 'graph'], agentId: IDS.successor, roleTenure: tenure, performanceAssignment: assignment, grant, recordedAuthorization: allowed.answer, readerGrantsCurrentAuthority: false },
    receipt: { sourceEvidenceIds: ['receiptVerification'], verification: receipt },
    durability: { sourceEvidenceIds: ['durabilityObservations', 'graph'], beforeInvoke: { phase: before.phase, admissionEventId: before.admissionEventId, head: before.head }, consumption: durable.consumption, completeReopenMatched: durable.completeReopenMatched, signatureRequests: durable.signatureRequests, finalClock: durable.finalClock, capabilityReuseMechanism: durable.capabilityReuseMechanism, receiptRetentionBeforeCommitment: 'NOT_SELECTED', simulatorAttemptCount: 'NOT_SELECTED' },
    sources,
    limitations: ['Presentation of six complete verified retained artifacts; no new Core evaluation or current authority.', 'CURRENT query scope means its recorded evaluation/observation heads agree; it does not mean latest live authority.', 'Performance assignment and independently granted powers are separate; the downstream duty remains OUTCOME_UNKNOWN.', 'This selection contains a consumption acknowledgment, not the adapter-entry counter or separate receipt-retention acknowledgment; those counts/ordering are not inferred.', 'Cooperative local storage and same-host reopen evidence do not establish crash recovery, hostile-writer isolation or public finality.'],
  };
  if (Buffer.byteLength(JSON.stringify(result) + '\n') > OUTPUT_BYTES) fail('summary JSON bytes', 'DURABLE_CASE_OUTPUT_LIMIT');
  return snapshot(result);
}

export function projectSelectedCase(input) {
  try { return project(input); }
  catch (error) {
    if (error?.code === 'DURABLE_CASE_INVALID' || error?.code === 'DURABLE_CASE_OUTPUT_LIMIT') throw error;
    fail('unsupported selected structure');
  }
}

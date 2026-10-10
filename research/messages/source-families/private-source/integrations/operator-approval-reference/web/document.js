'use strict';
// Display only. Keep source-established local messages; suppress arbitrary server/exception details.
const knownHumanErrors=new Set([
  "Agent request download unavailable.",
  "Choose a valid approval name and bounded decision file.",
  "Choose an agent, valid new name and 1–2048 UTF-8 bytes.",
  "Complete approval command exceeds 16 KiB after JSON encoding.",
  "Creation response did not match the requested review.",
  "Decision file exceeds 16 KiB.",
  "Decision file must contain exact valid UTF-8.",
  "Downloaded request did not match the exact selected review.",
  "Exact selection unavailable.",
  "No exact review selected.",
  "Public signer identity unavailable.",
  "Selected review mismatch.",
  "Selected signing identity mismatch.",
  "Unsupported approval identity.",
  "Unsupported case observation.",
  "Unsupported response.",
  "Unsupported review identity."
]);
function humanErrorText(error) {
 const value=error && typeof error==='object'?Object.getOwnPropertyDescriptor(error,'message')?.value:undefined;
 return knownHumanErrors.has(value)?value:'The request could not finish. Detailed cause information is not shown here. Keep the existing review and inspect retained state before considering another request.';
}

// Presentation only. Broker observations and kernel-authenticated channels own authority.
const el = id => document.getElementById(id);
const show = value => value === undefined ? 'Not supplied' : value === null ? 'null (explicit)' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
const put = (id, value) => { el(id).textContent = show(value); };
const slug = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,31}$/.exec(value)?.[0] === value;
const byteLength = value => new TextEncoder().encode(value).byteLength;
const validText = (value, limit) => typeof value === 'string' && value.isWellFormed() && byteLength(value) > 0 && byteLength(value) <= limit;
const base = '/api/document';
let desk = null, review = null, selectedId = null, busy = false;
const retainedWording = {
  refresh: 'Reload recording',
  'preparation-heading': 'Review preparation · unavailable in this recording',
  'preparation-copy': 'These disabled controls show the live preparation workflow for reference. This recording cannot create or change a review.',
  'signing-heading': 'Inspect exact recorded review',
  'signing-copy': 'Download the original challenge and review display to inspect their exact text. No new signing is needed to review this recording. No key or local key path belongs in this page.',
  'signing-template-copy': 'The collapsed signer template is an inert reference for the live workflow. It is unnecessary for this recording; no command runs here.',
  'decision-heading': 'Recorded decisions',
  'decision-records-heading': 'Decision records from the original review',
  'handoff-heading': 'Agent-request handoff · unavailable in this recording',
  'handoff-copy': 'Agent-request export is disabled in this recording. In the live workflow, a separately enrolled agent submits the exact approved request through its existing client and agent socket; the broker rechecks identity, current permission and approval.',
  'handoff-boundary': 'This recording cannot switch identity or release a document. Its decision records do not establish current permission.',
  'recovery-heading': 'Original-result recovery · reference only',
  'recovery-copy': 'Recovery cannot run from this recording. In the live workflow, explicit recovery inspects the original attempt and may record its matching result without republishing or creating a fresh intent. Unconfirmed requests are never automatically retried.',
  'desk-footer': 'This page displays recorded observations. Reloading rereads the recording; it does not contact the lab or check current permission, review context or publication. Original OS enforcement and recipient reading are not proved here.'
};
const liveWording = Object.fromEntries(Object.keys(retainedWording).map(id => [id, el(id).textContent]));
const isRecording = () => desk?.accessMode === 'READ_ONLY' && ['a','b'].every(who => desk.current?.power?.[who]?.scope === 'RETAINED_RECORDING');
const recordingSources = ['RETAINED_LINUX_DOCUMENT_DESK_REHEARSAL','DATA_ONLY_APPLICATION_REHEARSAL_NO_NATIVE_SOCKET_OR_DOCUMENT_EFFECT'];
function renderWording() {
  for (const [id, text] of Object.entries(isRecording() ? retainedWording : liveWording)) put(id, text);
}
function recordedStatus(value, label, known) {
  if (value === undefined || value === null) return `No ${label} observation supplied (${show(value)}).`;
  return typeof value === 'string' && Object.hasOwn(known, value) ? known[value] : `Recorded ${label} status: ${show(value)}.`;
}
function renderRetainedSummary(data) {
  el('retained-summary').hidden = true;
  if (!isRecording() || !recordingSources.includes(data.scope?.source)) return;
  put('summary-review', `Review: ${data.reviewId} · Actor: ${show(data.actorBinding?.actorId)}`);
  put('summary-document', `Resource: ${show(data.descriptor?.resource)} · Bytes: ${show(data.descriptor?.documentBytes)}`);
  put('summary-recipient', data.descriptor?.recipientId);
  el('summary-decisions').replaceChildren();
  const decisions = data.approvals.length ? data.approvals.map(a => `Decision: ${show(a.decision)} · Record: ${show(a.approvalId)} · Operator: ${show(a.operatorId)}`) : ['No decision records supplied.'];
  for (const text of decisions) { const item = document.createElement('li'); item.textContent = text; el('summary-decisions').append(item); }
  put('summary-invocation', recordedStatus(data.outcome.invocation == null ? data.outcome.invocation : data.outcome.invocation.status, 'invocation', {OUTCOME_UNKNOWN:'Acknowledgment unknown.'}));
  put('summary-publication', recordedStatus(data.outcome.publication == null ? data.outcome.publication : data.outcome.publication.status, 'publication', {LOCAL_PUBLICATION_VERIFIED:'Local publication observed.'}));
  put('summary-recording', recordedStatus(data.outcome.coreRecording, 'Core recording', {RECORDED:'Result recorded in Core.',NOT_RECORDED:'No Core result recorded in this observation.'}));
  put('summary-duty', data.current.duty == null ? `No duty observation supplied (${show(data.current.duty)}).` : `Status: ${show(data.current.duty.status)} · Assignee: ${show(data.current.duty.assignee)} · Source: ${show(data.current.duty.source)}`);
  el('retained-summary').hidden = false;
}
const controls = ['create-who','create-name','create-proposal','create','approval-name','decision-file','import','approval-select','recover'];
const route = (id, suffix = '') => { if (!slug(id)) throw new Error('No exact review selected.'); return `${base}/reviews/${id}${suffix}`; };
function message(text, error = false) { put('feedback', text); el('feedback').classList.toggle('error', error); }
function clearTransient() {
  el('approval-name').value = ''; el('decision-file').value = ''; el('approval-select').value = '';
  el('download-release').removeAttribute('href'); el('response-details').hidden = true; put('response', '');
}
function clearSelection() {
  clearTransient(); review = null; selectedId = null; el('selected-review').hidden = true; el('selection-prompt').hidden = false;
  el('retained-summary').hidden = true;
  for (const id of ['summary-review','summary-document','summary-recipient','summary-invocation','summary-publication','summary-recording','summary-duty']) put(id, '');
  el('summary-decisions').replaceChildren();
  for (const id of ['download-challenge','download-display']) el(id).removeAttribute('href');
}
function updateControls() {
  for (const id of controls) el(id).disabled = true;
  el('refresh').disabled = busy;
  document.querySelectorAll('[data-review-id]').forEach(button => { button.disabled = busy; });
  el('download-release').removeAttribute('href');
  el('download-release').setAttribute('aria-disabled', 'true');
  if (busy || desk === null) return;
  if (desk.available.createReview === true) {
    for (const id of ['create-who','create-name','create-proposal']) el(id).disabled = false;
    el('create').disabled = !['a','b'].includes(el('create-who').value) || !slug(el('create-name').value) || !validText(el('create-proposal').value, 2048);
  }
  if (review === null) return;
  if (review.available.importDecision === true) {
    el('approval-name').disabled = false; el('decision-file').disabled = false;
    el('import').disabled = !slug(el('approval-name').value) || el('decision-file').files.length !== 1;
  }
  el('recover').disabled = review.available.recover !== true;
  el('approval-select').disabled = review.available.exportAgentRequest !== true;
  const approvalId = el('approval-select').value;
  if (review.available.exportAgentRequest === true && review.approvals.some(a => a.approvalId === approvalId && a.decision === 'APPROVE')) {
    el('download-release').href = route(selectedId, `/approvals/${approvalId}/release-request`);
    el('download-release').setAttribute('aria-disabled', 'false');
  }
}
async function request(path, body, download = false) {
  const options = { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error' };
  if (body !== undefined) { options.headers = {'Content-Type':'application/json'}; options.body = JSON.stringify(body); }
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(`Request refused or unavailable (HTTP ${response.status}).`);
  if (download) return response.text();
  const result = await response.json();
  if (result === null || typeof result !== 'object' || Array.isArray(result)) throw new Error('Unsupported response.');
  return result;
}
function renderDesk(data) {
  if (data.schemaVersion !== 'continuity-document-desk/1' || !Array.isArray(data.reviews) || data.reviews.length > 8 || !data.available || !data.current) throw new Error('Unsupported case observation.');
  desk = data;
  renderWording();
  put('origin', data.accessMode === 'READ_ONLY' ? 'Retained or read-only observation. Writes and agent-request export are disabled; current authority is not established by this page.' + (typeof data.observationScope === 'string' ? '\n' + data.observationScope : '') : 'Live local observation. Refresh explicitly; the broker independently rechecks authority before use.');
  put('document-facts', data.document); put('power', data.current.power); put('duty', data.current.duty);
  put('case-state', {caseId:data.caseId, head:data.current.head, delivery:data.current.delivery}); put('coverage', data.coverage);
  el('reviews').replaceChildren();
  for (const row of data.reviews) {
    if (!slug(row.reviewId)) throw new Error('Unsupported review identity.');
    const item = document.createElement('li'), button = document.createElement('button'), facts = document.createElement('pre');
    button.type = 'button'; button.className = 'secondary'; button.dataset.reviewId = row.reviewId; button.textContent = `Select ${row.reviewId} · Agent ${row.who}`;
    button.addEventListener('click', () => selectReview(row.reviewId)); facts.textContent = show(row); item.append(button, facts); el('reviews').append(item);
  }
  if (!data.reviews.length) el('reviews').textContent = isRecording() ? 'No reviews supplied in this recording.' : 'No reviews prepared. Create one explicitly.';
}
function signingTemplate(id, signer) {
  const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const required = (name, instruction) => '"${' + name + ':?' + instruction + '}"';
  if (!signer || !['operatorId','keyId'].every(k => typeof signer[k] === 'string' && /^[\x21-\x7e]{1,128}$/.exec(signer[k])?.[0] === signer[k])) throw new Error('Public signer identity unavailable.');
  return [required('CONTINUITY_NODE','Set absolute Node path'), '--require', required('CONTINUITY_HARDEN','Set absolute Linux native hardening preload path'),
    required('CONTINUITY_SIGNER','Set absolute detached signer script path'),
    '"${CONTINUITY_INPUT_DIR:?Set absolute download directory}/challenge-' + id + '.json"',
    '"${CONTINUITY_INPUT_DIR:?Set absolute download directory}/review-display-' + id + '.json"',
    required('CONTINUITY_SIGNER_KEY','Set absolute private key path locally'), quote(signer.operatorId), quote(signer.keyId),
    required('CONTINUITY_DECISION','Choose APPROVE or DENY explicitly'), required('CONTINUITY_REASON','Supply your decision reason'), required('CONTINUITY_OUTPUT','Set new absolute decision output path')].join(' \\\n  ');
}
function renderReview(data, id) {
  if (data.schemaVersion !== 'continuity-document-view/1' || data.reviewId !== id || !Array.isArray(data.approvals) || data.approvals.length > 32 || !data.available) throw new Error('Selected review mismatch.');
  const selection = data.selection;
  for (const key of ['descriptorUtf8','requestUtf8','displayUtf8','challengeUtf8']) if (typeof selection?.[key] !== 'string') throw new Error('Exact selection unavailable.');
  const challenge = JSON.parse(selection.challengeUtf8), display = JSON.parse(selection.displayUtf8);
  if (challenge.challengeId !== data.challengeId || challenge.actionId !== id || challenge.requestUtf8 !== selection.requestUtf8 || display.reviewId !== id) throw new Error('Selected signing identity mismatch.');
  const template = signingTemplate(id, data.signer);
  selectedId = id; review = data; clearTransient();
  put('selected-id', `Review: ${id}\nChallenge: ${data.challengeId}`);
  put('selected-document', data.descriptor); put('actor', data.actorBinding); put('proposal', display.proposalUtf8);
  for (const key of ['descriptor','request','display','challenge']) put(key, selection[key+'Utf8']);
  put('selected-power', {contextStatus:data.contextStatus, power:data.current.power});
  put('invocation', {admitted:data.outcome.admitted, invocation:data.outcome.invocation});
  put('publication', data.outcome.publication === null ? 'No local publication observation supplied; absence is not inferred.' : data.outcome.publication);
  put('recording', {coreRecording:data.outcome.coreRecording, coreExternalEffect:'NOT_PROVEN'}); put('selected-duty', data.current.duty);
  put('scope', {scope:data.scope, signer:data.signer}); put('availability', data.available); put('approvals', data.approvals);
  for (const name of ['challenge','display']) { el('download-'+name).href = route(id, '/'+name); el('download-'+name).download = (name === 'challenge' ? 'challenge-' : 'review-display-') + id + '.json'; }
  put('signing-files', `challenge-${id}.json\nreview-display-${id}.json\nOperator: ${data.signer.operatorId}\nKey ID: ${data.signer.keyId}\nPublic key: ${data.signer.publicKeyHex}\nCredential class: ${data.signer.credentialClass}`);
  put('signing-command', template);
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose an approval'; el('approval-select').replaceChildren(placeholder);
  for (const approval of data.approvals) {
    if (!slug(approval.approvalId)) throw new Error('Unsupported approval identity.');
    if (approval.decision === 'APPROVE') { const option = document.createElement('option'); option.value = approval.approvalId; option.textContent = `${approval.approvalId} · ${approval.operatorId} · ${approval.reason}`; el('approval-select').append(option); }
  }
  el('approval-select').value = ''; el('selected-review').hidden = false; el('selection-prompt').hidden = true;
  renderRetainedSummary(data);
}
function failed(error, submitted = false) {
  desk = null; clearSelection(); el('reviews').replaceChildren(); put('coverage', 'Observation unavailable. Refresh explicitly; visible facts may be outdated.');
  message(humanErrorText(error) + (submitted ? ' Outcome unconfirmed. This request is not retried. Refresh and inspect retained state.' : ' Controls disabled. Refresh explicitly.'), true);
}
async function refresh() {
  if (busy) return; const id = selectedId; busy = true; clearSelection(); updateControls();
  try { renderDesk(await request(base+'/desk')); if (id !== null) renderReview(await request(route(id)), id); message(isRecording() ? 'Recording reloaded. Select a review to inspect its recorded evidence; current conditions are not checked.' : 'Observation refreshed. Choose an exact review and operation explicitly.'); }
  catch (error) { failed(error); } finally { busy = false; updateControls(); }
}
async function selectReview(id) {
  if (busy) return; busy = true; clearSelection(); updateControls();
  try { renderReview(await request(route(id)), id); message(isRecording() ? 'Recorded review loaded. Exact evidence is available; new decisions, agent submission and recovery are disabled.' : 'Exact review loaded. Approval, agent submission and recovery remain separate.'); }
  catch (error) { failed(error); } finally { busy = false; updateControls(); }
}
async function mutate(kind) {
  if (busy || desk === null) return;
  const id = selectedId;
  if (kind === 'create' ? desk.available.createReview !== true : review === null || review.available[kind === 'decision' ? 'importDecision' : 'recover'] !== true) return;
  busy = true; updateControls(); let submitted = false;
  try {
    let body, path;
    if (kind === 'create') {
      body = {reviewId:el('create-name').value, who:el('create-who').value, proposalUtf8:el('create-proposal').value};
      if (!slug(body.reviewId) || !['a','b'].includes(body.who) || !validText(body.proposalUtf8,2048)) throw new Error('Choose an agent, valid new name and 1–2048 UTF-8 bytes.');
      path = base+'/reviews';
    } else if (kind === 'decision') {
      const file = el('decision-file').files[0], approvalId = el('approval-name').value;
      if (!slug(approvalId) || !file || file.size === 0 || file.size > 16384) throw new Error('Choose a valid approval name and bounded decision file.');
      const bytes = await file.arrayBuffer(); if (bytes.byteLength > 16384) throw new Error('Decision file exceeds 16 KiB.');
      const envelopeUtf8 = new TextDecoder('utf-8', {fatal:true,ignoreBOM:true}).decode(bytes);
      if (!validText(envelopeUtf8,16384)) throw new Error('Decision file must contain exact valid UTF-8.');
      const command = {schemaVersion:'continuity-document-operator-command/1', operation:'IMPORT_APPROVAL', reviewId:id, approvalId, envelopeUtf8};
      body = {approvalId,envelopeUtf8};
      if (byteLength(JSON.stringify(command)+'\n') > 16384 || byteLength(JSON.stringify(body)) > 16384) throw new Error('Complete approval command exceeds 16 KiB after JSON encoding.');
      path = route(id,'/decision');
    } else { body = {}; path = route(id,'/recover'); }
    submitted = true; const result = await request(path,body);
    if (kind === 'create' && (result.status !== 'REVIEW_CREATED' || result.reviewId !== body.reviewId)) throw new Error('Creation response did not match the requested review.');
    clearSelection(); renderDesk(await request(base+'/desk'));
    if (kind !== 'create') renderReview(await request(route(id)),id);
    else { for (const field of ['create-name','create-who','create-proposal']) el(field).value = ''; }
    put('response',{operation:kind,reviewId:kind==='create'?body.reviewId:id,result}); el('response-details').hidden = false;
    message(kind === 'create' ? 'Unsigned review prepared. Select it explicitly from the queue; no decision or release occurred.' : kind === 'decision' ? 'Decision import response retained. Choose an approval separately before downloading an agent request.' : 'Recovery response retained. Inspect local publication and Core recording separately; no release was requested.');
  } catch (error) { failed(error,submitted); } finally { busy = false; updateControls(); }
}
async function downloadRelease(event) {
  event.preventDefault();
  const approvalId = el('approval-select').value;
  if (busy || review === null || review.available.exportAgentRequest !== true || !review.approvals.some(a => a.approvalId === approvalId && a.decision === 'APPROVE')) return;
  const id = selectedId; busy = true; updateControls();
  try {
    const text = await request(route(id,`/approvals/${approvalId}/release-request`),undefined,true);
    if (!validText(text,16384)) throw new Error('Agent request download unavailable.');
    const wire = JSON.parse(text);
    if (!wire || Object.keys(wire).sort().join(',') !== ['schemaVersion','operation','runtimeSessionId','reviewId','approvalId','descriptorUtf8'].sort().join(',') || wire.schemaVersion !== 'continuity-document-release-request/1' || wire.operation !== 'REQUEST_RELEASE' || wire.reviewId !== id || wire.approvalId !== approvalId || wire.descriptorUtf8 !== review.selection.descriptorUtf8 || wire.runtimeSessionId !== review.actorBinding.runtimeSessionId) throw new Error('Downloaded request did not match the exact selected review.');
    const url = URL.createObjectURL(new Blob([text],{type:'application/json'}));
    try { const link = document.createElement('a'); link.href = url; link.download = `agent-request-${id}-${approvalId}.json`; link.click(); } finally { URL.revokeObjectURL(url); }
    clearTransient(); message('Exact agent request downloaded as data only. Nothing was admitted or released; the enrolled agent must submit separately.');
  } catch (error) { failed(error,true); } finally { busy = false; updateControls(); }
}
el('refresh').addEventListener('click',refresh);
for (const id of ['create-who','create-name','create-proposal','approval-name','decision-file','approval-select']) el(id).addEventListener(id === 'decision-file' || id.endsWith('who') || id === 'approval-select' ? 'change' : 'input',updateControls);
el('create').addEventListener('click',()=>mutate('create'));
el('import').addEventListener('click',()=>mutate('decision'));
el('recover').addEventListener('click',()=>mutate('recover'));
el('download-release').addEventListener('click',downloadRelease);
updateControls(); refresh();

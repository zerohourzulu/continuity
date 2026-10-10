'use strict';
// Display only. Keep source-established local messages; suppress arbitrary server/exception details.
const knownHumanErrors=new Set([
  "Choose a signed decision envelope.",
  "Comparison bindings did not match the selected pair.",
  "Comparison did not match the selected review.",
  "Expected preparation link was not available.",
  "No exact review is selected.",
  "Preparation response did not identify the expected new review. Refresh and inspect the named request before trying again.",
  "Returned review does not match the exact selection.",
  "Review is missing its selection or availability.",
  "Server response has an unsupported shape.",
  "The signed envelope exceeds 256 KiB.",
  "The signed envelope must contain 1 to 262144 bytes.",
  "The signed envelope must contain valid UTF-8.",
  "Unsupported case observation."
]);
function humanErrorText(error) {
 const value=error && typeof error==='object'?Object.getOwnPropertyDescriptor(error,'message')?.value:undefined;
 return knownHumanErrors.has(value)?value:'The request could not finish. Detailed cause information is not shown here. Keep the existing review and inspect retained state before considering another request.';
}


// Presentation only. Authority and availability come exclusively from the server.
const MAX_ENVELOPE_BYTES = 256 * 1024;
const controls = ['refresh', 'decision-file', 'import', 'admit', 'invoke', 'reconcile'];
const deskMode = document.getElementById('desk') !== null;
let selectedId = null;
let review = null;
let busy = false;
const element = (id) => document.getElementById(id);
const own = (value, key) => value !== null && typeof value === 'object' && Object.hasOwn(value, key);
const field = (value, key) => own(value, key) ? value[key] : undefined;
const display = (value) => value === undefined ? 'Not supplied' : value === null ? 'null (explicit)' : value === '' ? 'Empty string (explicit)' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
const put = (id, value) => { element(id).textContent = display(value); };
const feedback = (message, error = false) => {
  element('feedback').textContent = message;
  element('feedback').classList.toggle('error', error);
};

function updateControls() {
  controls.forEach((id) => { element(id).disabled = true; });
  element('refresh').disabled = busy;
  if(deskMode) element('compare').disabled=busy||review===null;
  if(deskMode) document.querySelectorAll('[data-challenge-id]').forEach(button=>{button.disabled=busy || button.dataset.readable!=='true';});
  if(deskMode) for(const id of ['fresh-actor','fresh-name','fresh-proposal','prepare']) element(id).disabled=true;
  if (busy || review === null) return;
  const available = field(review, 'available');
  if(deskMode && field(available,'prepareFresh')===true) {
    for(const id of ['fresh-actor','fresh-name','fresh-proposal']) element(id).disabled=false;
    element('prepare').disabled=!['a','b'].includes(element('fresh-actor').value)||!/^[a-z][a-z0-9-]{0,31}$/.test(element('fresh-name').value)||element('fresh-proposal').value.length===0;
  }
  const importAvailable = field(available, 'importDecision') === true;
  element('decision-file').disabled = !importAvailable;
  element('import').disabled = !importAvailable || element('decision-file').files.length !== 1;
  ['admit', 'invoke', 'reconcile'].forEach((id) => { element(id).disabled = field(available, id) !== true; });
}

function outcomeLabel(value, phase) {
  if (value === null || value === undefined) return 'No result supplied';
  const status = field(value, 'status');
  if (phase === 'reconciliation' && status === 'RETRY') return field(value, 'recorded') === true
    ? 'Original result recovered · no resubmission' : 'Recovery not confirmed · inspect evidence';
  if (phase === 'admission' && status === 'ADMITTED') return 'Admission recorded · inspect available steps';
  if (status === 'OUTCOME_UNKNOWN') return 'Outcome unknown · no automatic resubmission';
  if (['REFUSED', 'DENIED', 'NOT_ADMITTED', 'NOT_INVOKED', 'INVALID_CAPABILITY'].includes(status)) return 'Request refused · inspect the recorded reason';
  if (status === 'SUBMITTED') return field(value, 'recorded') === true
    ? 'Acknowledgment recorded · duty remains separate' : 'Submission reported · inspect evidence';
  if (status === 'FAILED') return 'Failure reported · inspect evidence';
  if (status === 'RETRY') return 'Prior result reported · inspect evidence';
  return 'Outcome unclear · inspect the recorded response';
}

function requestLabel(name, result) {
  if (name === 'decision') {
    if (field(result, 'status') === 'ACCEPTED' && field(result, 'decision') === 'APPROVE')
      return 'Signed approval imported · agent permission is checked separately';
    if (field(result, 'status') === 'ACCEPTED' && field(result, 'decision') === 'DENY')
      return 'Signed denial imported';
    if (field(result, 'status') === 'IDENTICAL_REIMPORT') return 'Same signed decision already retained · no new approval';
  }
  return outcomeLabel(result, { admit: 'admission', invoke: 'invocation', reconcile: 'reconciliation' }[name]);
}

function clearResponse() {
  element('response-details').hidden = true;
  element('response-details').open = false;
  element('response-context').textContent = ''; element('response').textContent = '';
}

function showResponse(name, id, result) {
  put('response-context', `Request: ${name} · Review: ${display(id)}. This response does not establish current step availability.`);
  put('response', result);
  element('response-details').open = false;
  element('response-details').hidden = false;
}

// Inert instructions only. Values supplied to the shell remain separate arguments.
function signingHandoff(data) {
  const ch = field(data, 'challenge');
  const id = field(ch, 'challengeId');
  const digest = field(ch, 'sha256');
  const publicId = value => typeof value === 'string' && /^[\x21-\x7e]{1,128}$/.exec(value)?.[0] === value;
  if (typeof id !== 'string' || id.length !== 32 || !/^[a-f0-9]+$/.test(id)
    || typeof digest !== 'string' || digest.length !== 64 || !/^[a-f0-9]+$/.test(digest)
    || !publicId(field(ch, 'operatorId')) || !publicId(field(ch, 'keyId'))) return null;
  const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const challengeName = `challenge-${id}.json`, displayName = `review-display-${id}.json`;
  const required = (name, instruction) => '"${' + name + ':?' + instruction + '}"';
  const command = [
    required('CONTINUITY_NODE', 'Set the absolute Node executable path'),
    required('CONTINUITY_SIGNER', 'Set the absolute detached signer script path'),
    '"${CONTINUITY_INPUT_DIR:?Set the absolute download directory}/' + challengeName + '"',
    '"${CONTINUITY_INPUT_DIR:?Set the absolute download directory}/' + displayName + '"',
    required('CONTINUITY_SIGNER_KEY', 'Set the absolute private key path locally'),
    quote(ch.operatorId), quote(ch.keyId),
    required('CONTINUITY_DECISION', 'Choose APPROVE or DENY explicitly'),
    required('CONTINUITY_REASON', 'Supply your decision reason'),
    required('CONTINUITY_OUTPUT', 'Set a new absolute decision output path')
  ].join(' \\\n  ');
  return { id, digest, operatorId: ch.operatorId, keyId: ch.keyId, challengeName, displayName, command };
}

function clearSigningHandoff() {
  element('signing-handoff-content').hidden = true;
  element('signing-handoff-status').textContent = 'Select and load a review to see its detached-signing instructions.';
  for (const id of ['signing-handoff-identity', 'signing-handoff-files', 'signing-handoff-command']) element(id).textContent = '';
  for (const name of ['challenge', 'display']) element('download-' + name).removeAttribute('download');
}

function renderSigningHandoff(data) {
  clearSigningHandoff();
  const handoff = signingHandoff(data);
  if (handoff === null || (deskMode && handoff.id !== selectedId)) {
    element('signing-handoff-status').textContent = 'Signing instructions unavailable: the selected public identity or challenge digest is incomplete.';
    return;
  }
  const recorded = field(field(data, 'scope'), 'readingMode') === 'RETAINED_OBSERVATION';
  put('signing-handoff-status', recorded
    ? 'Recorded review reference. These instructions do not establish current authority.'
    : 'Instructions for this exact review. Choose your decision separately; no command runs here.');
  put('signing-handoff-identity', `Review: ${handoff.id}\nChallenge SHA256: ${handoff.digest}\nOperator ID: ${handoff.operatorId}\nKey ID: ${handoff.keyId}`);
  put('signing-handoff-files', `${handoff.challengeName}\n${handoff.displayName}`);
  put('signing-handoff-command', handoff.command);
  element('download-challenge').download = handoff.challengeName;
  element('download-display').download = handoff.displayName;
  element('signing-handoff-content').hidden = false;
}

function render(data) {
  review = data;
  if(deskMode) {
    element('selected-review').hidden=false;
    element('selection-prompt').hidden=true;
    put('selected-id', `Exact review: ${selectedId}`);
    put('fresh-parent', `Parent review: ${selectedId} · Action: ${data.selection.descriptor.action}`);
    put('preparation-record',data.preparation??'No recorded preparation link.');
    for(const name of ['challenge','display']) element('download-'+name).href=route(name,selectedId);
  }
  const selection = field(data, 'selection');
  const descriptor = field(selection, 'descriptor');
  const actor = field(selection, 'actorBinding');
  const scope = field(data, 'scope');
  const current = field(data, 'current');
  put('case-action', `${display(field(selection, 'caseId'))} / ${display(field(selection, 'actionId'))}`);
  put('resource', field(descriptor, 'resource'));
  put('action', field(descriptor, 'action'));
  put('revision', field(descriptor, 'expectedRevision'));
  put('snapshot', field(selection, 'snapshotId'));
  put('actor', field(actor, 'actorId'));
  put('proposal', field(selection, 'proposalUtf8'));
  put('request', field(selection, 'requestUtf8'));
  put('descriptor', descriptor);
  put('evidence', field(selection, 'evidenceDisplay'));
  put('selection', selection);
  put('context', `Context: ${display(field(current, 'contextStatus'))}\nTrust: ${display(field(current, 'trustStatus'))}`);
  ['permission', 'duties', 'head', 'state'].forEach((id) => put(id, field(current, id)));
  put('actor-binding', actor);
  put('challenge', field(data, 'challenge'));
  put('approval', field(data, 'approval'));
  put('scope', scope);
  put('credential-scope', `Reported credential class: ${display(field(scope, 'credentialClass'))}. Reported human presence: ${display(field(scope, 'humanPresence'))}.`);
  put('availability', field(data, 'available'));
  const outcome = field(data, 'outcome');
  ['admission', 'invocation', 'reconciliation'].forEach((id) => {
    const value = field(outcome, id);
    put(id, value);
    put(`${id}-label`, outcomeLabel(value, id));
  });
  renderSigningHandoff(data);
}

async function api(path, body) {
  const options = { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error' };
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  let data;
  try { data = await response.json(); } catch { throw new Error(`Server response was not JSON (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(`Request failed: ${display(field(data, 'error'))} (HTTP ${response.status}).`);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('Server response has an unsupported shape.');
  return data;
}

function route(name,id=selectedId) {
  if(!deskMode) return '/api/'+name;
  if(typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id)) throw new Error('No exact review is selected.');
  return '/api/reviews/'+id+'/'+name;
}
function clearSelection() {
  review=null;element('decision-file').value='';
  clearResponse();
  clearSigningHandoff();
  if(deskMode) {
    clearComparison();
    for(const id of ['fresh-actor','fresh-name','fresh-proposal']) element(id).value='';
    element('selected-review').hidden=true;element('selection-prompt').hidden=false;
    for(const name of ['challenge','display']) element('download-'+name).removeAttribute('href');
  }
}
function clearComparison(message='Load a comparison to inspect this review and its direct parent.') {
  element('comparison-content').hidden=true;
  put('comparison-status',message);
  for(const id of ['comparison-pair','comparison-evidence-counts','comparison-parent-proposal','comparison-child-proposal','comparison-proposal-status','comparison-details','comparison-current','comparison-decisions']) put(id,'');
  element('comparison-files').replaceChildren();element('comparison-bindings').replaceChildren();
}
async function loadComparison() {
  if(busy||review===null) return;
  const id=selectedId,selected=review;busy=true;updateControls();clearComparison('Loading this review and its direct parent…');
  try {
    const data=await api(route('comparison',id));
    if(selectedId!==id||review!==selected||data.schemaVersion!=='continuity-operator-comparison/1'||data.childChallengeId!==id) throw new Error('Comparison did not match the selected review.');
    if(data.status==='NO_PARENT') {
      if(selected.preparation!=null) throw new Error('Expected preparation link was not available.');
      clearComparison('This review has no recorded parent.');return;
    }
    if(data.status==='UNAVAILABLE') {clearComparison('Comparison unavailable. Direct review evidence could not be reconstructed; no equality or permission is inferred.');return;}
    if(data.status!=='COMPARABLE'||data.child?.challengeId!==id||data.child.challengeSha256!==selected.challenge.sha256||
      data.parent?.challengeId!==selected.preparation?.parentChallengeId||data.parent.challengeSha256!==selected.preparation?.parentChallengeSha256) throw new Error('Comparison bindings did not match the selected pair.');
    const d=data.differences;
    put('comparison-pair',`Previous: ${data.parent.challengeId}\nSelected: ${id}`);
    put('comparison-parent-proposal',d.proposal.parent.utf8);put('comparison-child-proposal',d.proposal.child.utf8);
    put('comparison-proposal-status',`${d.proposal.status} · Exact UTF-8 bytes: ${d.proposal.parent.bytes} → ${d.proposal.child.bytes}. Whitespace and Unicode are not normalized.`);
    put('comparison-evidence-counts',`Evidence files: ${d.evidence.counts.ADDED} added · ${d.evidence.counts.REMOVED} removed · ${d.evidence.counts.CHANGED} changed · ${d.evidence.counts.UNCHANGED} unchanged`);
    for(const row of d.evidence.originals) {const li=document.createElement('li');li.textContent=`${row.status} · ${row.path}\nPrevious: ${display(row.parent)}\nSelected: ${display(row.child)}`;element('comparison-files').append(li);}
    for(const row of d.actor) {const p=document.createElement('p');p.textContent=`${row.field} · ${row.status}\nPrevious: ${display(row.parent)}\nSelected: ${display(row.child)}`;element('comparison-bindings').append(p);}
    put('comparison-details',{action:d.action,snapshot:d.snapshot,history:d.history,material:d.evidence.material,progress:d.evidence.progress,summary:d.evidence.summary});
    put('comparison-current',data.currentObservation??'Not evaluated for this recording.');
    put('comparison-decisions',{parent:data.parent,child:data.child,scope:data.scope});
    put('comparison-status','Direct comparison loaded. Selected historical context and current permission remain separate.');element('comparison-content').hidden=false;
  } catch(error) {clearComparison('Comparison unavailable: '+humanErrorText(error));}
  finally {busy=false;updateControls();}
}
const labels={PENDING_DECISION:'Awaiting signed decision',STALE_REVIEW:'Stale review · prepare a fresh selection',DENIED:'Signed denial',
  READY_TO_INVOKE:'Admitted · ready for controlled use',READY_FOR_ADMISSION:'Approved · admission available',PERMISSION_REQUIRED:'Approved · current permission required',
  ATTEMPT_RESULT_UNAVAILABLE:'Approval spent · attempt result unavailable',ORIGINAL_RESULT_RECOVERED:'Original result recovered · no resubmission',
  RECOVERY_RECORDED:'Recovery recorded · inspect outcome',RECOVERY_AVAILABLE:'Original-result recovery available',OUTCOME_UNRESOLVED:'Outcome unresolved',RECORDED:'Result recorded',UNREADABLE:'Unreadable · no controls'};
function renderDesk(data) {
  if(data.schemaVersion!=='continuity-operator-desk/1'||!Array.isArray(data.reviews)||data.reviews.length>32) throw new Error('Unsupported case observation.');
  put('desk-origin',data.scope.readingMode==='RETAINED_OBSERVATION'?'Recorded case observation. Refresh rereads saved bytes; it does not establish current authority.':'Live local case observation. Refresh explicitly; authority is checked again before use.');
  put('desk-case',data.caseId);put('desk-state',data.current.state.status==='OK'?`${data.current.state.state.status} · revision ${data.current.state.state.revision}`:'State unavailable');
  put('desk-trust',data.current.trustStatus);put('desk-head',data.current.head);put('desk-scope',{...data.scope,accessMode:data.accessMode});
  const duties=element('desk-duties');duties.replaceChildren();
  for(const duty of data.current.duties) {const box=document.createElement('div');box.className='duty';
    const title=document.createElement('strong');title.textContent=`${duty.status} · ${duty.performanceAssigneeId}`;
    const description=document.createElement('p');description.textContent=duty.description;
    const original=document.createElement('p');original.className='muted';original.textContent=`Original assignment: ${duty.originalPerformanceAssigneeId} · Continuing role: ${duty.durableRoleId}`;
    box.append(title,description,original);duties.append(box);}
  if(data.current.duties.length===0) duties.textContent='No recorded duty in this observation.';
  put('desk-coverage',`${data.coverage.status} observation · ${data.coverage.total} of up to ${data.coverage.limit} reviews · ${data.accessMode==='READ_ONLY'?'Read-only review':'Controlled use available after selection'}`);
  element('desk-coverage').classList.toggle('error',data.coverage.status!=='COMPLETE');
  const counts=element('desk-counts');counts.replaceChildren();
  for(const [label,predicate] of [['Awaiting decision',r=>r.attention==='PENDING_DECISION'],['Stale',r=>r.approvalStatus==='STALE'],['Recovery available',r=>r.attention==='RECOVERY_AVAILABLE'],['Recovered',r=>r.attention==='ORIGINAL_RESULT_RECOVERED']]) {
    const item=document.createElement('span');item.textContent=`${label}: ${data.reviews.filter(predicate).length}`;counts.append(item);}
  const rows=element('desk-rows');rows.replaceChildren();
  for(const row of data.reviews) {
    const li=document.createElement('li'),button=document.createElement('button'),summary=document.createElement('p'),phases=document.createElement('p'),id=document.createElement('code');
    button.type='button';button.className='secondary';button.dataset.challengeId=row.challengeId;button.dataset.readable=String(row.readStatus==='READABLE');
    button.disabled=busy||row.readStatus!=='READABLE';button.textContent=row.readStatus==='READABLE'?`${row.action} · ${row.actionId}`:'Unreadable review';
    const attentionLabel = row.attention === 'ORIGINAL_RESULT_RECOVERED'
      ? outcomeLabel({status:field(field(row,'phases'),'reconciliation'),recorded:field(field(row,'phases'),'reconciliationRecorded')}, 'reconciliation')
      : labels[row.attention]??'Review status unclear · inspect evidence';
    button.addEventListener('click',()=>selectReview(row.challengeId));summary.textContent=attentionLabel+(row.readStatus==='READABLE'?` · Signed decision: ${row.decision??'none'} · Actor: ${row.actorId}`:'');
    const phaseLabel = phase => {
      const status = field(field(row, 'phases'), phase);
      return outcomeLabel(status === null || status === undefined ? status
        : { status, recorded: phase === 'reconciliation' ? field(row.phases, 'reconciliationRecorded') : undefined }, phase);
    };
    phases.className='muted';phases.textContent=row.readStatus==='READABLE'?`Admission: ${phaseLabel('admission')} · Invocation: ${phaseLabel('invocation')} · Recovery: ${phaseLabel('reconciliation')}`:'This review could not be reconstructed. Case coverage is incomplete.';
    id.textContent=row.challengeId+(row.preparedFrom?` · Prepared from ${row.preparedFrom}`:'');li.append(button,summary,phases,id);rows.append(li);
    if(row.readStatus==='READABLE') {
      const details=document.createElement('details'),label=document.createElement('summary'),raw=document.createElement('pre');
      label.textContent='Recorded phase fields';raw.textContent=display(row.phases);raw.tabIndex=0;
      details.append(label,raw);li.append(details);
    }
  }
  if(data.reviews.length===0) rows.textContent='No reviews prepared for this case yet.';
}
async function readDesk() {renderDesk(await api('/api/desk'));}
async function readReview(id=selectedId) {
  if(deskMode) clearComparison();
  const data = await api(route('review',id));
  if (!own(data, 'selection') || !own(data, 'available')) throw new Error('Review is missing its selection or availability.');
  if(deskMode && (data.challenge?.challengeId!==id || selectedId!==id)) throw new Error('Returned review does not match the exact selection.');
  render(data);
}
async function selectReview(id) {
  if(busy) return;
  busy=true;clearSelection();selectedId=id;updateControls();feedback('Loading the exact selected review…');
  try {await readReview(id);feedback('Selected review loaded. Admission and use independently recheck current authority.');}
  catch(error) {selectedId=null;clearSelection();feedback(humanErrorText(error),true);}
  finally {busy=false;updateControls();}
}
async function refreshReview() {
  if (busy) return;
  const id=selectedId;busy=true;clearSelection();updateControls();feedback('Refreshing the case observation…');
  try {
    if(deskMode) await readDesk();
    if(!deskMode || id!==null) await readReview(id);
    feedback('Observation refreshed. Select a review to inspect its exact evidence and available steps.');
  } catch(error) {clearSelection();if(deskMode) {selectedId=null;element('desk-rows').replaceChildren();put('desk-coverage','Observation unavailable. Visible case facts may be outdated.');}feedback(humanErrorText(error)+' Controls are disabled.',true);}
  finally {busy=false;updateControls();}
}

async function mutate(name, makeBody) {
  if (busy || review === null) return;
  const flag = name === 'decision' ? 'importDecision' : name==='prepare'?'prepareFresh':name;
  if (field(field(review, 'available'), flag) !== true) return;
  const id=selectedId;let resultId=id;
  const requestReviewId = id ?? field(field(review, 'challenge'), 'challengeId');
  let responseData;
  clearResponse();
  busy = true;
  updateControls();
  feedback('Submitting the selected request…');
  let resultMessage = '';
  let failed = false;
  let submitted = false;
  try {
    const body = await makeBody();
    submitted = true;
    const result = await api(route(name,id), body);
    responseData = result;
    if(name==='prepare') {
      if(result.status!=='PREPARED'||result.parentChallengeId!==id||typeof result.challengeId!=='string'||!/^[a-f0-9]{32}$/.test(result.challengeId)||result.challengeId===id) throw new Error('Preparation response did not identify the expected new review. Refresh and inspect the named request before trying again.');
      resultId=result.challengeId;clearSelection();selectedId=resultId;
      resultMessage='Fresh unsigned review prepared. Inspect the new evidence, then obtain a separate signed decision.';
    } else resultMessage = requestLabel(name, result);
    if (name === 'decision') element('decision-file').value = '';
  } catch (error) {
    resultMessage = humanErrorText(error)+(name==='prepare'?' Preparation is not retried. Refresh the case and inspect the new name and parent link before preparing again.'
      : submitted?' Result not confirmed. Inspect retained state before any further request; this request is not retried.':'');
    failed = true;
  }
  // No mutation is retried. Refresh even after transport failure to inspect retained state.
  if (submitted) {
    try { if(deskMode) await readDesk(); await readReview(resultId); }
    catch (error) {
      clearSelection();
      if(deskMode) {element('desk-rows').replaceChildren();put('desk-coverage','Observation unavailable. Refresh explicitly before selecting another review.');}
      resultMessage += ` Review refresh failed: ${humanErrorText(error)} Controls are disabled; visible data may be outdated.`;
      failed = true;
    }
  }
  if (responseData !== undefined) showResponse(name, requestReviewId, responseData);
  feedback(resultMessage, failed);
  busy = false;
  updateControls();
}

element('refresh').addEventListener('click', refreshReview);
element('decision-file').addEventListener('change', updateControls);
element('import').addEventListener('click', () => mutate('decision', async () => {
  const file = element('decision-file').files[0];
  if (!file) throw new Error('Choose a signed decision envelope.');
  if (file.size === 0 || file.size > MAX_ENVELOPE_BYTES) throw new Error('The signed envelope must contain 1 to 262144 bytes.');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_ENVELOPE_BYTES) throw new Error('The signed envelope exceeds 256 KiB.');
  let envelopeUtf8;
  try { envelopeUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error('The signed envelope must contain valid UTF-8.'); }
  return { envelopeUtf8 };
}));
['admit', 'invoke', 'reconcile'].forEach((name) => {
  element(name).addEventListener('click', () => mutate(name, async () => ({})));
});
if(deskMode) {
  element('compare').addEventListener('click',loadComparison);
  for(const id of ['fresh-actor','fresh-name','fresh-proposal']) element(id).addEventListener('input',updateControls);
  element('prepare').addEventListener('click',()=>mutate('prepare',async()=>({who:element('fresh-actor').value,actionId:element('fresh-name').value,proposalUtf8:element('fresh-proposal').value})));
}
if(deskMode) for(const name of ['challenge','display']) element('download-'+name).addEventListener('click',event=>{if(busy||review===null) event.preventDefault();});
refreshReview();

// Specific accepted preparation recording only; no Core, live case or execution imports.
import { readFileSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { parseChallenge,sha } from './contract.mjs';
import { compareSelections } from './comparison.mjs';
import { inspectPreparationRecording } from './inspect-preparation-retained.mjs';

export function openComparisonRecording(directory) {
  inspectPreparationRecording(directory);
  const text=name=>readFileSync(join(directory,name),'utf8'),json=name=>JSON.parse(text(name));
  const scenario=json('SCENARIO.json'),desk=json('FINAL.json');
  const ids=[scenario.parentId,scenario.childId,scenario.grandchildId];
  const records=new Map(ids.map(id=>{
    const challengeUtf8=text('CHALLENGE-'+id+'.json'),ch=parseChallenge(challengeUtf8),displayUtf8=text('DISPLAY-'+id+'.json'),display=JSON.parse(displayUtf8);
    const request=JSON.parse(ch.requestUtf8),r={...request,descriptor:JSON.parse(request.descriptorUtf8)},view=json('VIEW-'+id+'.json');
    assert.equal(display.requestUtf8,ch.requestUtf8);assert.deepEqual(display.actorBinding,ch.actorBinding);
    assert.equal(sha(r.proposalUtf8),r.descriptor.proposalSha256);
    assert.deepEqual(display,view.selection.evidenceDisplay);
    assert.equal(new Set(display.originals.map(row=>row.path)).size,display.originals.length);
    for(const row of display.originals) {
      const value=Buffer.from(row.utf8===null?row.base64:row.utf8,row.utf8===null?'base64':'utf8');
      assert.equal(value.length,row.bytes);assert.equal(sha(value),row.sha256);
    }
    return [id,{ch,r,display,view,challengeUtf8,displayUtf8}];
  }));
  const get=id=>{assert.ok(records.has(id),'UNKNOWN_RECORDED_REVIEW');return records.get(id);};
  const scope={observation:'RETAINED_OBSERVATION',authority:'NONE',currentAuthority:'NOT_EVALUATED',provenance:'UNSIGNED_APPLICATION_PROVENANCE_ONLY',
    limitations:['Specific accepted synthetic preparation recording; no new Core replay or live authority.','Exact stored displays and retained signature are checked; source truth is not established.']};
  const comparison=id=>{
    const child=get(id),base={schemaVersion:'continuity-operator-comparison/1',childChallengeId:id,scope};
    if(child.view.preparation===null) return {...base,status:'NO_PARENT'};
    const parent=get(child.view.preparation.parentChallengeId);
    const identity=r=>({challengeId:r.ch.challengeId,challengeSha256:sha(r.challengeUtf8),displaySha256:sha(r.displayUtf8),
      decision:r.view.approval.decision,signatureStatus:r.view.approval.signatureStatus,spent:r.view.approval.status==='SPENT'});
    return {...base,status:'COMPARABLE',parent:identity(parent),child:identity(child),differences:compareSelections(parent,child),
      currentObservation:{scope:'RECORDED_AT_CAPTURE_ONLY',currentAuthority:'NOT_EVALUATED',head:desk.current.head,
        parentPermission:parent.view.current.permission,childPermission:child.view.current.permission,duties:desk.current.duties,state:desk.current.state}};
  };
  const forbidden=()=>{throw new Error('RECORDING_IS_READ_ONLY');};
  return {ids,comparison,desk:async()=>({...desk,scope:{...desk.scope,readingMode:'RETAINED_OBSERVATION',currentAuthority:'NOT_EVALUATED'}}),
    view:async id=>{const v=get(id).view;return {...v,scope:{...v.scope,readingMode:'RETAINED_OBSERVATION',currentAuthority:'NOT_EVALUATED'}};},
    downloadChallenge:id=>get(id).challengeUtf8,downloadDisplay:id=>get(id).displayUtf8,
    importDecision:forbidden,admit:forbidden,invoke:forbidden,reconcile:forbidden};
}
export function inspectComparisonRecording(directory) {
  const recording=openComparisonRecording(directory),comparisons=recording.ids.slice(1).map(recording.comparison);
  return {status:'RETAINED_COMPARISONS_INSPECTED',currentAuthority:'NOT_EVALUATED',source:'Accepted preparation recording; original execution not repeated.',
    comparisons:comparisons.map(c=>({parent:c.parent.challengeId,child:c.child.challengeId,sha256:sha(JSON.stringify(c)),
      proposal:c.differences.proposal.status,evidence:c.differences.evidence.counts,changedActorFields:c.differences.actor.filter(r=>r.status==='CHANGED').map(r=>r.field),
      originalDecision:c.parent.decision,selectedDecision:c.child.decision,dutyStatus:c.currentObservation.duties[0].status,state:c.currentObservation.state.state}))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(inspectComparisonRecording(resolve(process.argv[2]))));

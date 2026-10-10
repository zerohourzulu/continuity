// Reads retained observation bytes only. Does not reopen policy paths or authorize actions.
import { readFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
export function inspectDeskRecording(directory) {
  const d=JSON.parse(readFileSync(join(directory,'FINAL.json'),'utf8'));
  assert.equal(d.schemaVersion,'continuity-operator-desk/1');assert.equal(d.coverage.status,'COMPLETE');
  assert.equal(d.coverage.total,7);assert.equal(d.reviews.length,7);
  assert.equal(new Set(d.reviews.map(r=>r.challengeId)).size,7);
  assert.deepEqual(d.current.state.state,{revision:2,status:'HELD'});
  assert.equal(d.current.duties[0].status,'OPEN');assert.equal(d.current.duties[0].performanceAssigneeId,'b:'+d.caseId);
  assert.equal(d.current.duties[0].originalPerformanceAssigneeId,'a:'+d.caseId);
  const counts={};for(const row of d.reviews) counts[row.attention]=(counts[row.attention]??0)+1;
  assert.deepEqual(counts,{STALE_REVIEW:2,ORIGINAL_RESULT_RECOVERED:1,RECORDED:1,PENDING_DECISION:1,DENIED:1,READY_FOR_ADMISSION:1});
  for(const row of d.reviews) {
    const v=JSON.parse(readFileSync(join(directory,'VIEW-'+row.challengeId+'.json'),'utf8'));
    assert.equal(v.challenge.challengeId,row.challengeId);assert.equal(v.selection.caseId,d.caseId);
    assert.equal(v.selection.actionId,row.actionId);assert.deepEqual(v.current.head,d.current.head);
  }
  return {status:'RETAINED_DESK_OBSERVATIONS_INSPECTED',caseId:d.caseId,reviews:7,counts,
    retainedState:d.current.state.state,retainedDuty:d.current.duties[0],currentAuthority:'NOT_EVALUATED',
    verification:'Saved observation consistency; package hashes bind the retained source, tests and underlying case. No new Core replay, signature verification or live authority is claimed.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log(JSON.stringify(inspectDeskRecording(resolve(process.argv[2]))));

// Snapshot planning only. Mirrors the accepted snapshot format without writing files.
import { bytes,assert,slug,sha } from '../../security-action-reference/src/protocol.mjs';
export function planSnapshot(review,snapshotId) {
  slug(snapshotId);
  const payload=new Map([['history.json',bytes(review.events)],['summary.json',bytes(review.summary)],
    ['progress.json',bytes(review.entries)],['material.json',bytes(review.material)]]);
  for(const [path,data] of review.originals) payload.set('originals/'+path,data);
  const files=[...payload].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,data])=>({path,bytes:data.length,sha256:sha(data)}));
  assert(files.length<=52&&files.every(r=>r.bytes<=1048576)&&files.reduce((n,r)=>n+r.bytes,0)<=4*1024*1024,'APPROVAL_FRESH_CAPTURE_LIMIT');
  const manifest={schemaVersion:'continuity-security-action-snapshot/1',caseId:review.config.caseId,snapshotId,head:review.summary.head,files};
  assert(bytes(manifest).length<=16384,'APPROVAL_FRESH_CAPTURE_LIMIT');
  return {snapshotId,manifestSha256:sha(bytes(manifest)),head:manifest.head,materialSha256:sha(bytes(review.material))};
}
export function validateFreshInput(who,actionId,proposalUtf8) {
  assert(who==='a'||who==='b','APPROVAL_FRESH_ACTOR');
  assert(typeof actionId==='string'&&/^[a-z][a-z0-9-]{0,31}$/.exec(actionId)?.[0]===actionId,'APPROVAL_FRESH_NAME');
  assert(typeof proposalUtf8==='string'&&proposalUtf8.isWellFormed()&&Buffer.byteLength(proposalUtf8)>0&&Buffer.byteLength(proposalUtf8)<=4096,'APPROVAL_FRESH_PROPOSAL');
}

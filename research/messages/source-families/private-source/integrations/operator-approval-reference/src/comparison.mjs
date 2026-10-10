// Read-only projection of already verified historical records. No authority or effects.
import { sha } from './contract.mjs';
import { isDeepStrictEqual as equal } from 'node:util';

const slot=(record,key)=>Object.hasOwn(record,key)?{present:true,value:record[key]}:{present:false};
const change=(parent,child)=>({status:equal(parent,child)?'UNCHANGED':'CHANGED',parent,child});
const fields=(parent,child,keys)=>keys.map(field=>({field,...change(slot(parent,field),slot(child,field))}));
const content=row=>Buffer.from(row.utf8===null?row.base64:row.utf8,row.utf8===null?'base64':'utf8');
const evidenceSlot=row=>row===undefined?{present:false}:{present:true,bytes:row.bytes,sha256:row.sha256};
const proposal=text=>({utf8:text,bytes:Buffer.byteLength(text),sha256:sha(text)});

export function compareSelections(parent,child) {
  const before=new Map(parent.display.originals.map(row=>[row.path,row]));
  const after=new Map(child.display.originals.map(row=>[row.path,row]));
  const originals=[...new Set([...before.keys(),...after.keys()])].sort().map(path=>{
    const a=before.get(path),b=after.get(path);
    const status=a===undefined?'ADDED':b===undefined?'REMOVED':content(a).equals(content(b))?'UNCHANGED':'CHANGED';
    return {path,status,parent:evidenceSlot(a),child:evidenceSlot(b)};
  });
  return {
    proposal:change(proposal(parent.r.proposalUtf8),proposal(child.r.proposalUtf8)),
    actor:fields(parent.ch.actorBinding,child.ch.actorBinding,['actorId','runtimeSessionId','credentialKeyId','controlEpoch','roleId','roleTenureId']),
    action:fields(parent.r.descriptor,child.r.descriptor,['action','resource','expectedRevision','intentId']),
    snapshot:fields(parent.r,child.r,['snapshotId','snapshotManifestSha256']),
    history:change(parent.r.descriptor.reviewHead,child.r.descriptor.reviewHead),
    evidence:{originals,counts:Object.fromEntries(['ADDED','REMOVED','CHANGED','UNCHANGED'].map(status=>[status,originals.filter(row=>row.status===status).length])),
      material:change(parent.display.material,child.display.material),
      progress:change(parent.display.progress,child.display.progress),
      summary:change(parent.display.summary,child.display.summary)}
  };
}

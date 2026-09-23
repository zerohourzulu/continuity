import {createHash} from 'node:crypto';
import * as core from '@ramex-labs/continuity/adapter';
import {PortableFileEventStore} from '@ramex-labs/continuity/adapter';
import {openLocalExecution} from '@ramex-labs/continuity/adapter';
import {record,identifier,requireCondition} from '@ramex-labs/continuity/adapter';

/** Trusted application factory. Model arguments cannot select identity or client. */
export function createCooperativeExecutor({local,client,registry,role,tenure}) {
  requireCondition(local.additionalPolicy === undefined, "UNSUPPORTED_ADDITIONAL_POLICY");
  const store=new PortableFileEventStore(local.historyFile);
  const profile=core.approvedPortableAdapterProfileForPolicy(core.PORTABLE_ADAPTER_POLICY_E5_HASH,core.REMOTE_SERVICE_REPORT_ADAPTER_ID);
  role=identifier(role);tenure=identifier(tenure);
  const select=input=>{
    const value=record(input,['operationId','businessKey','tool','arguments']);
    const selected=registry.capture({intentId:identifier(value.operationId),businessKey:value.businessKey,
      tool:value.tool,arguments:value.arguments,contractId:registry.contractId});
    return {...selected,op:{id:selected.wire.intentId,action:selected.action,resource:selected.resource,role,tenure,termsCommitment:selected.termsCommitment,...selected.quantities}};
  };
  const retained=new Map();
  const adapterFor=selected=>{
    const unknown=i=>({status:'OUTCOME_UNKNOWN',idempotencyKey:i.idempotencyKey,submissionFingerprint:i.submissionFingerprint});
    const convert=(reply,i,status)=>{
      const report=reply.result;
      if(report.state!=='APPLIED') {
        requireCondition(report.key === undefined || report.key === i.idempotencyKey, "REPORT_MISMATCH");
        retained.set(i.intentId,reply);
        return unknown(i);
      }
      requireCondition(report.key===i.idempotencyKey&&report.fingerprint===i.submissionFingerprint&&report.intentId===i.intentId&&
        report.tool===selected.wire.tool&&report.businessKey===selected.wire.businessKey&&report.contractId===registry.contractId,'REPORT_MISMATCH');
      retained.set(i.intentId,reply);
      const digest='0x'+createHash('sha256').update(core.canonicalEncode(report)).digest('hex');
      const acknowledgment=core.createRemoteServiceReportAcknowledgment(i,digest);
      const evidence=core.portableAdapterAcknowledgmentEvidence(i,acknowledgment);
      return {status,idempotencyKey:i.idempotencyKey,submissionFingerprint:i.submissionFingerprint,
        acknowledgment,...(status==='RETRY'?{retainedEvidence:evidence}:{evidence})};
    };
    return {adapterProfile:profile,
      async submit(submission) {
        const i=core.derivePortableAdapterIdentity(submission);
        try {
          const checkpoint=await client.checkpoint(store.readAll());
          if(checkpoint.result.state!=='CHECKPOINTED')return unknown(i);
          const prepared=await client.prepare(selected.wire);
          if(prepared.result.state==='APPLIED')return convert(prepared,i,'RETRY');
          if(prepared.result.state!=='PENDING')return convert(prepared,i,'RETRY');
          return convert(await client.commit(i.idempotencyKey),i,'SUBMITTED');
        } catch {return unknown(i);}
      },
      async reconcile(submission) {
        const i=core.derivePortableAdapterIdentity(submission);
        try {return convert(await client.status(i.idempotencyKey),i,'RETRY');}
        catch {return unknown(i);}
      },
    };
  };
  return Object.freeze({
    async run(input) {
      const selected=select(input);
      const execution=await openLocalExecution(local,adapterFor(selected),'REMOTE_REPORT').run(selected.op);
      return Object.freeze({execution,serviceReport:retained.get(selected.wire.intentId)??null,
        externalOutcome:'NOT_PROVEN',revocationBoundary:'DESTINATION_ACKNOWLEDGED_CHECKPOINT'});
    },
    // Publishing a checkpoint is an owner/application action, not an agent tool.
    checkpoint(){return client.checkpoint(store.readAll());},
  });
}

import { openStore } from '../../synthetic-action-store/src/store.mjs';
import { hashCanonical, immutableProtocolInput } from '../../../packages/core-0.2/src/core/canonical.ts';
import { derivePortableAdapterIdentity } from '../../../packages/core-0.2/src/core/portable-integration.ts';
import { approvedPortableAdapterProfileForPolicy, PORTABLE_ADAPTER_POLICY_E2_HASH,
  LOCAL_SYNTHETIC_ENDPOINT_STATE_ADAPTER_ID, createLocalSyntheticEndpointStateAcknowledgment,
  portableAdapterAcknowledgmentEvidence } from '../../../packages/core-0.2/src/core/portable-adapter-engine.ts';
import { parseReviewedAction, commandFromAdmission } from './contract.mjs';

export function createStateExecutor({ storeDirectory, descriptorUtf8, beforeSubmit, withholdAcknowledgment = false }) {
  // All configuration, including the callback, is trusted application code.
  // The callback supplies no independent authority and must hold no new lock.
  if (typeof storeDirectory !== 'string' || typeof beforeSubmit !== 'function'
    || typeof withholdAcknowledgment !== 'boolean') throw new TypeError('INVALID_STATE_EXECUTOR_CONFIGURATION');
  const descriptor = parseReviewedAction(descriptorUtf8);
  const adapterProfile = approvedPortableAdapterProfileForPolicy(PORTABLE_ADAPTER_POLICY_E2_HASH,
    LOCAL_SYNTHETIC_ENDPOINT_STATE_ADAPTER_ID);
  const unknown = identity => Object.freeze(identity
    ? { status: 'OUTCOME_UNKNOWN', idempotencyKey: identity.idempotencyKey, submissionFingerprint: identity.submissionFingerprint }
    : { status: 'OUTCOME_UNKNOWN' });

  function capture(submission) {
    const stable = immutableProtocolInput(submission);
    const commandUtf8 = commandFromAdmission(descriptorUtf8, stable);
    const identity = derivePortableAdapterIdentity(stable);
    return Object.freeze({ submission: stable, descriptor, commandUtf8, identity });
  }

  function acknowledgment(captured, record, status) {
    if (record.commandUtf8 !== captured.commandUtf8) return unknown(captured.identity);
    // Store validates the entire retained chain and exact command/transition
    // identity. This hash is Keccak canonical data, not the command SHA-256.
    const typed = createLocalSyntheticEndpointStateAcknowledgment(captured.identity, hashCanonical(record.transition));
    const evidence = portableAdapterAcknowledgmentEvidence(captured.identity, typed);
    return Object.freeze({ status, idempotencyKey: captured.identity.idempotencyKey,
      submissionFingerprint: captured.identity.submissionFingerprint, acknowledgment: typed,
      ...(status === 'RETRY' ? { retainedEvidence: evidence } : { evidence }) });
  }

  function submit(submission) {
    let captured, store, result;
    try {
      captured = capture(submission);
      store = openStore(storeDirectory);
      // Synchronous order: application lock -> existing coordinator writer
      // lock -> trusted context check -> SQLite commit. No yield or reacquire.
      if (beforeSubmit(captured) !== true) result = unknown(captured.identity);
      else {
        const committed = store.commit(captured.commandUtf8);
        if (committed.status === 'APPLIED') {
          // Controlled response loss only AFTER a real commit, never a crash.
          result = withholdAcknowledgment ? unknown(captured.identity) : acknowledgment(captured, committed, 'SUBMITTED');
        } else if (committed.status === 'ALREADY_RECORDED') result = acknowledgment(captured, committed, 'RETRY');
        else result = unknown(captured.identity);
      }
    } catch { result = unknown(captured?.identity); }
    finally { if (store) { try { store.close(); } catch { result = unknown(captured?.identity); } } }
    return result;
  }

  function reconcile(submission) {
    let captured, store, result;
    try {
      captured = capture(submission);
      store = openStore(storeDirectory, { readOnly: true });
      const retained = store.reconcile(captured.identity.idempotencyKey, captured.identity.submissionFingerprint);
      result = retained.status === 'RETAINED' ? acknowledgment(captured, retained, 'RETRY') : unknown(captured.identity);
    } catch { result = unknown(captured?.identity); }
    finally { if (store) { try { store.close(); } catch { result = unknown(captured?.identity); } } }
    return result;
  }

  return Object.freeze({ adapterProfile, submit, reconcile });
}

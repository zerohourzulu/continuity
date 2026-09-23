// Private experiment. Remote reports are evidence claims, never settlement.
import { createHash } from 'node:crypto';
import { openSync, closeSync, writeFileSync, readFileSync, fsyncSync, mkdirSync, realpathSync, lstatSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as core from '../packages/core-0.2/src/core/index.ts';
import { openLocalExecution, commitTerms } from '../packages/core-0.3/src/execution.ts';
import { captureData, record, identifier, requireCondition } from '../packages/core-0.3/src/input.ts';
import { parseStrictJson } from './strict-json.mjs';

const digest = (bytes) => '0x' + createHash('sha256').update(bytes).digest('hex');
const plain = (value) => JSON.parse(JSON.stringify(value));
const encode = (value) => JSON.stringify(plain(captureData(value)));
const hash = (value) => digest(encode(value));
function directory(path) {
  const full = resolve(path);
  requireCondition(realpathSync(full) === full && lstatSync(full).isDirectory());
  return full;
}
function durableCreate(path, value) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, encode(value)); fsyncSync(fd); } finally { closeSync(fd); }
  const parent = openSync(resolve(path, '..'), 'r');
  try { fsyncSync(parent); } finally { closeSync(parent); }
}
function read(path) {
  requireCondition(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink());
  return parseStrictJson(readFileSync(path), {maxBytes:16384, maxDepth:16, maxNodes:2048});
}
function same(a, b) { return core.canonicalEncode(a) === core.canonicalEncode(b); }

// Operator declarations; transport annotations cannot change these mappings.
export const LAB_TOOLS = Object.freeze({
  'ticket.create': {version:'1', schema:'ticket/1', action:'create-ticket', resource:'queue:security', fields:{title:'string'}},
  'access.set': {version:'1', schema:'access/1', action:'set-access', resource:'document:synthetic', fields:{level:['closed','reviewer']}},
  'payment.send': {version:'1', schema:'payment/1', action:'send-synthetic-payment', resource:'account:synthetic', fields:{amount:'integer'}},
  'document.read': {version:'1', schema:'read/1', action:'read-document', resource:'document:synthetic', fields:{}},
});

/** Trusted host construction. No caller URL, callback, account or credential. */
export function createBroker(options) {
  const target = new URL(options.target);
  requireCondition(target.protocol === 'http:' && target.hostname === '127.0.0.1' && target.port &&
    target.pathname === '/' && !target.username && !target.password && !target.search && !target.hash);
  const tools = captureData(options.tools ?? LAB_TOOLS);
  const storage = directory(options.storage);
  requireCondition(options.enforcement === 'DISPATCH_ONLY', 'INVALID_INPUT');
  const timeoutMs = options.timeoutMs ?? 500;
  requireCondition(Number.isSafeInteger(timeoutMs) && timeoutMs >= 20 && timeoutMs <= 5000);
  const role = identifier(options.role), tenure = identifier(options.tenure);
  const config = {historyFile:options.historyFile, domain:captureData(options.domain), owner:options.owner,
    controller:options.controller, now:options.now, session:options.session, signHash:options.signHash};
  const staticBinding = captureData({version:'remote-tool-contract/experiment-1', target:target.origin,
    method:'POST', path:'/execute', lookup:'/operations/', serviceIdentity:options.serviceIdentity,
    account:options.account, enforcement:options.enforcement, automaticResubmission:false});
  // This journal is operator-private, single-host storage under the same trust
  // assumption as Core history. It is not authenticated protection from rollback.
  const profile = core.approvedPortableAdapterProfileForPolicy(core.PORTABLE_ADAPTER_POLICY_E4_HASH, 'adapter:remote-service-report');
  const prepare = (input) => {
    const r = record(input, ['operationId','tool','arguments']);
    const id = identifier(r.operationId), name = identifier(r.tool);
    requireCondition(Object.hasOwn(tools, name));
    const tool = tools[name];
    const args = record(r.arguments, Object.keys(tool.fields));
    for (const [field, type] of Object.entries(tool.fields)) {
      const value = args[field];
      if (Array.isArray(type)) requireCondition(type.includes(value));
      else if (type === 'string') requireCondition(typeof value === 'string' && value.length > 0 && value.length <= 256);
      else if (type === 'integer') requireCondition(Number.isSafeInteger(value) && value >= 0 && value <= 1000);
      else throw Error('UNSUPPORTED_SCHEMA');
    }
    // The amount check above bounds this synthetic fixture; it is NOT a mandate
    // budget. Core's public facade currently has no typed quantity projection.
    const terms = captureData({...staticBinding, tool:name, version:tool.version, schema:tool.schema,
      action:tool.action, resource:tool.resource, arguments:args});
    const op = {id, action:tool.action, resource:tool.resource, role,
      tenure, termsCommitment:commitTerms(terms)};
    const opdir = join(storage, hash({domain:config.domain, operationId:id}).slice(2));
    const paths = {attempt:join(opdir,'attempt.json'), report:join(opdir,'report.json'), conflict:join(opdir,'conflict.json')};
    const attemptFor = (identity, epoch) => ({version:'remote-attempt/1', operationId:id, terms,
      identity, request:{key:identity.idempotencyKey, fingerprint:identity.submissionFingerprint,
        tool:name, arguments:args, epoch}});
    const unknown = (i) => ({status:'OUTCOME_UNKNOWN',idempotencyKey:i.idempotencyKey,submissionFingerprint:i.submissionFingerprint});
    const reportFor = (value, i) => {
      const report = record(value, ['key','fingerprint','state','effectId','tool']);
      requireCondition(report.key === i.idempotencyKey && report.fingerprint === i.submissionFingerprint &&
        report.state === 'APPLIED' && report.tool === name && typeof report.effectId === 'string' &&
        report.effectId.length > 0 && report.effectId.length <= 128);
      return report;
    };
    const disposition = (i, status) => {
      if (existsSync(paths.conflict)) return unknown(i);
      const retained = reportFor(read(paths.report), i);
      const ack = core.createRemoteServiceReportAcknowledgment(i, hash(retained));
      const evidence = core.portableAdapterAcknowledgmentEvidence(i, ack);
      return {status, idempotencyKey:i.idempotencyKey,submissionFingerprint:i.submissionFingerprint,
        ...(status === 'RETRY' ? {retainedEvidence:evidence} : {evidence}), acknowledgment:ack};
    };
    const receive = async (url, init, i) => {
      // Abort only bounds waiting. It is never evidence of remote cancellation.
      const response = await fetch(url, {...init, headers:{...init.headers,connection:'close'}, redirect:'manual', signal:AbortSignal.timeout(timeoutMs)});
      const parts = []; let size = 0;
      for await (const chunk of response.body ?? []) {
        size += chunk.length;
        if (size > 16384) throw Error('RESPONSE_LIMIT');
        parts.push(chunk);
      }
      if (response.status !== 200) return unknown(i);
      const value = parseStrictJson(Buffer.concat(parts), {maxBytes:16384,maxDepth:10,maxNodes:256});
      const report = reportFor(value, i);
      try { durableCreate(paths.report, report); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (!same(read(paths.report), report)) {
          if (!existsSync(paths.conflict)) durableCreate(paths.conflict, {reason:'CONFLICTING_PROVIDER_REPORTS'});
          return unknown(i);
        }
      }
      return disposition(i, init.method === 'POST' ? 'SUBMITTED' : 'RETRY');
    };
    const adapter = {
      adapterProfile:profile,
      // This function's synchronous prefix runs inside Core's writer lock.
      // No socket await or provider wait happens while that lock is held.
      submit(submission) {
        const i = core.derivePortableAdapterIdentity(submission);
        try {
          mkdirSync(opdir, {mode:0o700});
          const parent = openSync(storage, 'r');
          try { fsyncSync(parent); } finally { closeSync(parent); }
          directory(opdir);
          durableCreate(paths.attempt, attemptFor(i, submission.admissionEvent.data.authorizationProof.controlEpoch));
        } catch { return Promise.resolve(unknown(i)); }
        return receive(target.origin+'/execute', {method:'POST',headers:{'content-type':'application/json'},
          body:encode(attemptFor(i, submission.admissionEvent.data.authorizationProof.controlEpoch).request)}, i).catch(() => unknown(i));
      },
      async reconcile(submission) {
        const i = core.derivePortableAdapterIdentity(submission);
        try {
          if (!same(read(paths.attempt), attemptFor(i, submission.admissionEvent.data.authorizationProof.controlEpoch))) return unknown(i);
          if (existsSync(paths.conflict)) return unknown(i);
          if (existsSync(paths.report)) return disposition(i, 'RETRY');
          return await receive(target.origin+'/operations/'+encodeURIComponent(i.idempotencyKey), {method:'GET'}, i);
        } catch { return unknown(i); }
      },
    };
    return {op, paths, adapter, name};
  };
  return Object.freeze({
    async run(input) {
      const {op, paths, adapter, name} = prepare(input);
      const result = await openLocalExecution(config, adapter, 'REMOTE_REPORT').run(op);
      let report, providerReportStatus = 'UNAVAILABLE_OR_MISMATCH';
      try {
        const candidate = record(read(paths.report), ['key','fingerprint','state','effectId','tool']);
        const ack = (result.invocation ?? result.result)?.disposition?.acknowledgment;
        requireCondition(candidate.tool === name && candidate.state === 'APPLIED');
        if (ack) {
          requireCondition(candidate.key === ack.idempotencyKey && candidate.fingerprint === ack.submissionFingerprint &&
            ack.result.kind === 'REMOTE_SERVICE_REPORTED' && hash(candidate) === ack.result.reportDigest.value);
          providerReportStatus = 'MATCHES_RECORDED_DIGEST';
        } else {
          // No canonical acknowledgment exists yet (e.g. late retirement).
          // This is an operator-private provider claim, not verified Core evidence.
          const attempt = read(paths.attempt);
          requireCondition(candidate.key === attempt.identity.idempotencyKey && candidate.fingerprint === attempt.identity.submissionFingerprint);
          providerReportStatus = 'UNRECORDED_REPORT';
        }
        report = candidate;
      } catch {}
      return {result, providerReport:report ?? null, providerReportStatus, providerReportAuthenticity:'TRUSTED_LOOPBACK_FIXTURE_ONLY',
        effectTimeRevocation:'NOT_GUARANTEED', remoteSettlement:'NOT_ESTABLISHED'};
    },
  });
}

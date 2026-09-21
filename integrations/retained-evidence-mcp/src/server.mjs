#!/usr/bin/env node
// Adapted contributed MCP vocabulary. Local stdio only; configuration and
// filesystem are trusted administration, requests are bounded untrusted bytes.
import { resolve } from 'node:path';
import { parseStrictJson } from './strict-json.mjs';
import { loadSourceConfig, selectSource } from '../../../lib/history-source.mjs';
import { runObservation } from '../../../lib/reader-runner.mjs';
import { LIMITS, NOTE, OPERATIONS, ReaderError, fail, closed, record } from '../../../lib/reader-contract.mjs';

const PROTOCOL = '2025-06-18';
const string = { type: 'string', minLength: 1, maxLength: 256 };
const decimal = { type: 'string', pattern: '^(0|[1-9][0-9]*)$', maxLength: 78 };
const descriptions = {
  verify: 'Replay the supplied history. ACCEPTED establishes internal consistency only, not truth, global freshness or root legitimacy.',
  status: 'Show the retained history status and, if configured for evidence, each declared agent’s enduring duties and separately recorded powers.',
  check: 'Observe ALLOW, DENY or INDETERMINATE for a scoped request at one history head. This is not an execution gate or capability.',
  why: 'Explain the observed authorization in the Core query envelope, including scope and external assumptions.',
  responsible: 'Show protocol attribution for the scoped request; this is not legal liability or factual truth.',
  survives: 'Show duties and evidence surviving the named agent. Continuing duty does not grant power.',
  handover_report: 'Report every declared agent from one captured history and evaluation time, including unresolved duties and outcomes.',
};
const tools = [{ name: 'continuity_list_histories', description: 'List configured source names and their permitted operations and disclosure. No host paths.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false } }, ...OPERATIONS.map(op => {
  const ask = ['check', 'why', 'responsible'].includes(op);
  return { name: `continuity_${op}`, description: descriptions[op],
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', properties: { source: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,31}$' }, at: decimal,
      ...(ask ? { actor: string, action: string, resource: string, amount: decimal } : op === 'survives' ? { agent: string } : {}) },
      required: ['source', ...(ask ? ['actor', 'action', 'resource'] : op === 'survives' ? ['agent'] : [])], additionalProperties: false } };
})];

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--config') fail('CONFIG_REQUIRED');
  const config = loadSourceConfig(resolve(process.argv[3]));
  let lifecycle = 'new';
  const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  const response = (id, result) => ({ jsonrpc: '2.0', id, result });
  function dispatch(message) {
    if (!record(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || Object.keys(message).some(k => !['jsonrpc', 'id', 'method', 'params'].includes(k))) return rpcError(null, -32600, 'INVALID_REQUEST');
    const hasId = Object.hasOwn(message, 'id');
    const id = message.id;
    if (hasId && !(typeof id === 'string' && id.length <= 128 || Number.isSafeInteger(id))) return rpcError(null, -32600, 'INVALID_REQUEST');
    if (!hasId) {
      if (message.method === 'notifications/initialized' && lifecycle === 'negotiating') lifecycle = 'ready';
      return null;
    }
    const params = message.params ?? {};
    try {
      if (!record(params)) return rpcError(id, -32602, 'INVALID_PARAMS');
      if (message.method === 'ping') return response(id, {});
      if (message.method === 'initialize') {
        if (lifecycle !== 'new') return rpcError(id, -32600, 'ALREADY_INITIALIZED');
        if (typeof params.protocolVersion !== 'string' || !record(params.capabilities) || !record(params.clientInfo) || typeof params.clientInfo.name !== 'string' || typeof params.clientInfo.version !== 'string') return rpcError(id, -32602, 'INVALID_PARAMS');
        lifecycle = 'negotiating';
        return response(id, { protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'continuity-retained-evidence', version: '0.2-reader.1' }, instructions: NOTE });
      }
      if (lifecycle !== 'ready') return rpcError(id, -32600, 'NOT_INITIALIZED');
      if (message.method === 'tools/list') { closed(params, []); return response(id, { tools }); }
      if (message.method !== 'tools/call') return rpcError(id, -32601, 'METHOD_NOT_FOUND');
      closed(params, ['name', 'arguments', '_meta'], ['name']);
      const tool = tools.find(t => t.name === params.name);
      if (!tool) return rpcError(id, -32602, 'UNKNOWN_TOOL');
      const args = params.arguments ?? {};
      closed(args, Object.keys(tool.inputSchema.properties), tool.inputSchema.required ?? []);
      let value;
      try {
        if (params.name === 'continuity_list_histories') value = { histories: Object.entries(config.sources).map(([source, spec]) => ({ source, disclosure: spec.disclosure, operations: spec.operations })) };
        else {
          const operation = params.name.slice('continuity_'.length);
          const { source, ...options } = args;
          const selected = selectSource(config, source, operation);
          value = runObservation(selected, operation, options);
        }
      } catch (error) {
        value = { error: error instanceof ReaderError ? error.code : 'READER_FAILED' };
        return response(id, { isError: true, content: [{ type: 'text', text: JSON.stringify(value) }] });
      }
      return response(id, { content: [{ type: 'text', text: JSON.stringify(value) }] });
    } catch { return rpcError(id, -32602, 'INVALID_PARAMS'); }
  }

  // Backpressure: at most one child and one bounded input chunk are processed.
  // No promises/request queue can accumulate behind a slow Core operation.
  let pending = Buffer.alloc(0), idle;
  const disarm = () => { clearTimeout(idle); idle = undefined; };
  const arm = () => {
    if (idle !== undefined) return;
    idle = setTimeout(() => { process.stderr.write('{"error":"FRAME_TIMEOUT"}\n'); process.exit(2); }, LIMITS.ioMs);
    idle.unref();
  };
  async function send(value) {
    if (value === null) return;
    let line = JSON.stringify(value) + '\n';
    // MCP's escaped text envelope can be larger than its inner result.
    if (Buffer.byteLength(line) > 2 * LIMITS.output + 8192) line = JSON.stringify(rpcError(value.id ?? null, -32603, 'OUTPUT_LIMIT_EXCEEDED')) + '\n';
    await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(new ReaderError('OUTPUT_STALLED')), LIMITS.ioMs);
      process.stdout.write(line, error => { clearTimeout(timer); error ? reject(error) : accept(); });
    });
  }
  try {
    for await (const chunk of process.stdin) {
      let offset = 0;
      while (offset < chunk.length) {
        const newline = chunk.indexOf(10, offset);
        const end = newline < 0 ? chunk.length : newline;
        if (pending.length + end - offset > LIMITS.request) {
          await send(rpcError(null, -32700, 'REQUEST_LIMIT_EXCEEDED'));
          process.exitCode = 2; return;
        }
        pending = Buffer.concat([pending, chunk.subarray(offset, end)]);
        offset = end + 1;
        if (newline >= 0) {
          disarm();
          let result;
          try { result = dispatch(parseStrictJson(pending, { maxBytes: LIMITS.request, maxDepth: 16, maxNodes: 2048 })); }
          catch { result = rpcError(null, -32700, 'PARSE_ERROR'); }
          pending = Buffer.alloc(0);
          await send(result);
        }
      }
      // An idle fully framed session remains open; partial messages must finish.
      if (pending.length) arm();
    }
    if (pending.length) { await send(rpcError(null, -32700, 'INCOMPLETE_MESSAGE')); process.exitCode = 2; }
  } finally { clearTimeout(idle); process.stdin.destroy(); }
}
main().catch(error => {
  process.stderr.write(JSON.stringify({ error: error instanceof ReaderError ? error.code : 'SERVER_FAILED' }) + '\n');
  // A pending stdout write may keep the event loop alive indefinitely. Timeout
  // is a transport failure: terminate even when the peer never drains the pipe.
  process.exit(2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { openEvidenceClient } from '../src/client.mjs';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { CATALOG_URI, CATALOG_ID, DEFAULT_BUNDLE_DIR, EXPECTED_CATALOG_SHA256,
  SCHEMA_VERSION, PROTOCOL_VERSION, RETAINED_SCOPE, LIMITS } from '../src/profile.mjs';

const catalogText = await readFile(join(DEFAULT_BUNDLE_DIR, 'catalog.json'), 'utf8');
const catalog = JSON.parse(catalogText);
const originals = new Map(await Promise.all(catalog.members.map(async member =>
  [member.evidenceId, await readFile(join(DEFAULT_BUNDLE_DIR, member.fileName))])));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// A protocol peer, independent of server.mjs and its guards. It serves retained original
// fixtures; fault injection changes the wire after construction of the honest response.
function peer({ mutate = () => {}, resourceText = catalogText, version = PROTOCOL_VERSION } = {}) {
  const requests = [];
  let closed = false;
  return {
    requests,
    async start() {},
    async close() { if (!closed) { closed = true; this.onclose?.(); } },
    async send(request) {
      requests.push(structuredClone(request));
      if (request.id === undefined) return;
      let result;
      if (request.method === 'initialize') {
        result = { protocolVersion: version, capabilities: { resources: {}, tools: {} },
          serverInfo: { name: 'fixture-peer', version: '1' } };
      } else if (request.method === 'resources/read') {
        result = { contents: [{ uri: CATALOG_URI, mimeType: 'application/json', text: resourceText }] };
      } else if (request.method === 'tools/call') {
        const { evidenceId, chunkIndex } = request.params.arguments;
        const member = catalog.members.find(item => item.evidenceId === evidenceId);
        const original = originals.get(evidenceId);
        const segment = original.subarray(chunkIndex * LIMITS.chunkBytes, (chunkIndex + 1) * LIMITS.chunkBytes);
        const value = { schemaVersion: SCHEMA_VERSION, catalogId: CATALOG_ID, catalogSha256: EXPECTED_CATALOG_SHA256,
          evidenceId, encoding: member.encoding, artifactBytes: original.length, artifactSha256: member.sha256,
          chunkIndex, chunkCount: member.chunkCount, chunkBytes: segment.length, chunkSha256: hash(segment),
          dataBase64: segment.toString('base64'), scope: structuredClone(RETAINED_SCOPE) };
        result = { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
      } else throw new Error(`Unexpected fixture request ${request.method}`);
      const message = { jsonrpc: '2.0', id: request.id, result };
      mutate(message, request);
      // Match stdio's JSON roundtrip and first SDK framing parse. The subsequent
      // CallToolResultSchema parse is performed by the actual client under test.
      const received = JSONRPCMessageSchema.parse(JSON.parse(JSON.stringify(message)));
      queueMicrotask(() => { if (!closed) this.onmessage?.(received); });
    },
  };
}

const changeChunk = callback => (message, request) => {
  if (request.method !== 'tools/call') return;
  callback(message.result.structuredContent, request, message.result);
  if (message.result.structuredContent) message.result.content = [{ type: 'text', text: JSON.stringify(message.result.structuredContent) }];
};

test('all 21 originals are byte-identical after 947 sequential chunk reads', async () => {
  const transport = peer();
  const reader = await openEvidenceClient({ transport });
  try {
    let bytes = 0;
    for (const member of catalog.members) {
      const original = await reader.readEvidence(member.evidenceId);
      assert.ok(Buffer.isBuffer(original));
      assert.deepEqual(original, originals.get(member.evidenceId));
      bytes += original.length;
    }
    assert.equal(bytes, 7_648_163);
    assert.equal(transport.requests.filter(request => request.method === 'tools/call').length, 947);
    assert.equal(transport.requests[0].params.protocolVersion, PROTOCOL_VERSION);
  } finally { await reader.close(); }
});

test('repeated and concurrent complete reads preserve originals; exposed catalog cannot change the pin', async () => {
  const reader = await openEvidenceClient({ transport: peer() });
  try {
    assert.throws(() => { reader.catalog.members[0].sha256 = '0'.repeat(64); });
    const [first, again] = await Promise.all([reader.readEvidence('result.why'), reader.readEvidence('result.why')]);
    assert.deepEqual(first, again);
    first.fill(0);
    assert.deepEqual(again, originals.get('result.why'));
  } finally { await reader.close(); }
  await assert.rejects(reader.readEvidence('result.replay'), /closed/);
});

test('untrusted pin overrides and arbitrary IDs never become transport requests', async () => {
  await assert.rejects(openEvidenceClient({ expectedCatalogSha256: '0'.repeat(64) }), /unknown client option/);
  const transport = peer();
  const reader = await openEvidenceClient({ transport });
  try {
    for (const id of ['../snapshot.json', 'file:///tmp/data', 'https://example.invalid', '', null, {}]) {
      await assert.rejects(reader.readEvidence(id), /unknown evidence ID/);
    }
    assert.equal(transport.requests.filter(request => request.method === 'tools/call').length, 0);
  } finally { await reader.close(); }
});

test('catalog whitespace changes fail the trusted original-byte pin', async () => {
  await assert.rejects(openEvidenceClient({ transport: peer({ resourceText: catalogText + '\n' }) }), /pin mismatch/);
});

test('older supported MCP negotiation is rejected by this fixed profile', async () => {
  await assert.rejects(openEvidenceClient({ transport: peer({ version: '2025-06-18' }) }), /negotiated protocol/);
});

const badMetadata = [
  ['schemaVersion', 'continuity-retained-evidence/9'], ['catalogId', 'another-catalog'],
  ['catalogSha256', '0'.repeat(64)], ['evidenceId', 'result.survives'], ['encoding', 'normalized JSON'],
  ['artifactBytes', '9957'], ['artifactSha256', '0'.repeat(64)], ['chunkCount', 1],
  ['chunkBytes', 8191], ['chunkIndex', 1], ['scope', { ...RETAINED_SCOPE, newEvaluation: true }],
];
for (const [key, value] of badMetadata) {
  test(`reject altered ${key} before returning any original bytes`, async () => {
    const reader = await openEvidenceClient({ transport: peer({ mutate: changeChunk(segment => { segment[key] = value; }) }) });
    try { await assert.rejects(reader.readEvidence('result.receiptVerification'), /mismatch/); }
    finally { await reader.close(); }
  });
}

for (const [name, mutation, pattern] of [
  ['truncated base64', value => { value.dataBase64 = value.dataBase64.slice(0, -4); }, /base64 length/],
  ['base64 whitespace', value => { value.dataBase64 = ' ' + value.dataBase64.slice(1); }, /noncanonical base64/],
  ['segment hash', value => { value.chunkSha256 = '0'.repeat(64); }, /segment hash mismatch/],
  ['uppercase hash', value => { value.chunkSha256 = value.chunkSha256.toUpperCase(); }, /hash encoding/],
  ['extra segment field', value => { value.extra = true; }, /segment fields/],
  ['missing segment field', value => { delete value.scope; }, /segment fields/],
  ['corrupt bytes with recomputed segment hash', value => {
    const bytes = Buffer.from(value.dataBase64, 'base64'); bytes[0] ^= 1;
    value.dataBase64 = bytes.toString('base64'); value.chunkSha256 = hash(bytes);
  }, /complete original length\/hash mismatch/],
]) {
  test(`reject ${name}`, async () => {
    const reader = await openEvidenceClient({ transport: peer({ mutate: changeChunk(mutation) }) });
    try { await assert.rejects(reader.readEvidence('result.replay'), pattern); }
    finally { await reader.close(); }
  });
}

test('duplicating a valid first segment at the second index fails ordered retrieval', async () => {
  let first;
  const reader = await openEvidenceClient({ transport: peer({ mutate(message, request) {
    if (request.method !== 'tools/call') return;
    if (request.params.arguments.chunkIndex === 0) first = structuredClone(message.result);
    else message.result = structuredClone(first);
  } }) });
  try { await assert.rejects(reader.readEvidence('result.receiptVerification'), /chunkIndex mismatch/); }
  finally { await reader.close(); }
});

for (const [name, mutate] of [
  ['text truncated', result => { result.content[0].text = result.content[0].text.slice(0, -1); }],
  ['text differs', result => { result.content[0].text = '{}'; }],
  ['structured absent', result => { delete result.structuredContent; }],
  ['extra text block', result => { result.content.push({ type: 'text', text: 'unexpected' }); }],
  ['transport tool error', result => { result.isError = true; }],
]) {
  test(`reject ${name}`, async () => {
    const reader = await openEvidenceClient({ transport: peer({ mutate(message, request) {
      if (request.method === 'tools/call') mutate(message.result);
    } }) });
    try { await assert.rejects(reader.readEvidence('result.replay'), /Evidence retrieval failed/); }
    finally { await reader.close(); }
  });
}

test('oversized complete response fails the connection rather than succeeding partially', async () => {
  const reader = await openEvidenceClient({ transport: peer({ mutate(message, request) {
    if (request.method === 'tools/call') message.result.content[0].text = 'x'.repeat(LIMITS.responseBytes);
  } }) });
  try { await assert.rejects(reader.readEvidence('result.replay')); }
  finally { await reader.close(); }
});

test('peer disconnect on a missing segment rejects complete retrieval', async () => {
  const transport = peer();
  const send = transport.send.bind(transport);
  transport.send = async request => {
    if (request.method === 'tools/call' && request.params.arguments.chunkIndex === 1) {
      await transport.close(); return;
    }
    return send(request);
  };
  const reader = await openEvidenceClient({ transport });
  try { await assert.rejects(reader.readEvidence('result.receiptVerification')); }
  finally { await reader.close(); }
});

for (const mirrorExtraInText of [false, true]) {
  test(`reject own __proto__ in structured segment${mirrorExtraInText ? ' and matching text' : ' only'} before SDK key erasure`, async () => {
    let injected = false;
    const reader = await openEvidenceClient({ transport: peer({ mutate(message, request) {
      if (request.method !== 'tools/call' || injected) return;
      injected = true;
      Object.defineProperty(message.result.structuredContent, '__proto__', {
        value: { unexpected: true }, enumerable: true, configurable: true, writable: true,
      });
      assert.ok(Object.hasOwn(message.result.structuredContent, '__proto__'));
      if (mirrorExtraInText) message.result.content[0].text = JSON.stringify(message.result.structuredContent);
    } }) });
    try {
      await assert.rejects(reader.readEvidence('result.replay'), /segment fields/);
      // The rejected envelope still held authentic bytes. A later honest result
      // remains usable and must pass the unchanged whole-original verification.
      assert.deepEqual(await reader.readEvidence('result.replay'), originals.get('result.replay'));
    } finally { await reader.close(); }
  });
}

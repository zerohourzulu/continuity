import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { parseStrictJson } from '../../retained-evidence-mcp/src/strict-json.mjs';
import { documentRoute, dispatchDocument } from './document-routes.mjs';

const BODY_LIMIT = 300 * 1024;
const BODY_TIMEOUT_MS = 10000;
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";
class TransportError extends Error {
  constructor(status, code) { super(code); this.status = status; this.publicCode = code; }
}
const failure = (status, code) => new TransportError(status, code);
const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function readBody(request, maximum = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const finish = (error, result) => {
      clearTimeout(timer);
      request.off('data', data);
      request.off('end', end);
      request.off('error', aborted);
      request.off('aborted', aborted);
      if (error) { request.pause(); reject(error); } else resolve(result);
    };
    const data = chunk => {
      size += chunk.length;
      if (size > maximum) finish(failure(413, 'BODY_TOO_LARGE'));
      else chunks.push(chunk);
    };
    const end = () => finish(null, Buffer.concat(chunks, size));
    const aborted = () => finish(failure(400, 'REQUEST_ABORTED'));
    const timer = setTimeout(() => finish(failure(408, 'BODY_TIMEOUT')), BODY_TIMEOUT_MS);
    request.on('data', data);
    request.once('end', end);
    request.once('error', aborted);
    request.once('aborted', aborted);
  });
}

/** Fixed local transport. This module neither starts itself nor owns signing/custody. */
export async function startWorkbench({ application, challengeId, port = 0, readOnly = false, desk = false, document: documentMode = false }) {
  const methods = documentMode ? ['desk', 'view', 'downloadChallenge', 'downloadDisplay', 'createReview', 'importDecision', 'exportAgentRequest', 'recover'] : ['view', 'downloadChallenge', 'downloadDisplay', 'importDecision', 'admit', 'invoke', 'reconcile'];
  if (!application || !methods.every(name => typeof application[name] === 'function')
    || typeof documentMode !== 'boolean' || typeof desk !== 'boolean' || (documentMode ? (desk || challengeId !== undefined) : (desk ? (challengeId !== undefined || typeof application.desk !== 'function') : (typeof challengeId !== 'string' || challengeId.length !== 32 || !/^[0-9a-f]{32}$/.test(challengeId))))
    || !Number.isInteger(port) || port < 0 || port > 65535 || typeof readOnly !== 'boolean') throw new Error('INVALID_WORKBENCH_CONFIG');
  const staticFiles = new Map(await Promise.all([
    ['/', documentMode ? 'document.html' : desk ? 'desk.html' : 'index.html', 'text/html; charset=utf-8'],
    ['/app.js', documentMode ? 'document.js' : 'app.js', 'text/javascript; charset=utf-8'],
    ['/style.css', 'style.css', 'text/css; charset=utf-8']
  ].map(async ([route, file, type]) => [route, { bytes: await readFile(new URL(`../web/${file}`, import.meta.url)), type }])));
  let origin = '';
  let host = '';
  let busy = false;
  const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
    const send = (status, value, type = 'application/json; charset=utf-8', attachment) => {
      if (response.destroyed || response.writableEnded) return;
      response.statusCode = status;
      response.setHeader('Content-Type', type);
      response.setHeader('Content-Security-Policy', CSP);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Connection', 'close');
      if (attachment) response.setHeader('Content-Disposition', `attachment; filename="${attachment}"`);
      response.end(Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value));
    };
    const run = async () => {
      const count = name => request.rawHeaders.filter((_, index) => index % 2 === 0 && request.rawHeaders[index].toLowerCase() === name).length;
      if (count('host') !== 1 || request.headers.host !== host) throw failure(403, 'HOST_REJECTED');
      if (count('origin') > 1 || (request.headers.origin !== undefined && request.headers.origin !== origin)) throw failure(403, 'ORIGIN_REJECTED');
      const method = request.method;
      let route = request.url;
      const documentSelection = documentMode ? documentRoute(request.method, route) : null;
      let selectedId=challengeId;
      if(desk && route.startsWith('/api/')) {
        if(route!=='/api/desk') {
          const match=/^\/api\/reviews\/([0-9a-f]{32})\/(review|challenge|display|decision|admit|invoke|reconcile|prepare|comparison)$/.exec(route);
          if(!match) throw failure(404,'ROUTE_NOT_FOUND');
          selectedId=match[1];route='/api/'+match[2];
        }
      }
      if (method !== 'GET' && method !== 'POST') throw failure(405, 'METHOD_REJECTED');
      if (method === 'POST' && readOnly) throw failure(403, 'READ_ONLY');
      if (method === 'GET' && staticFiles.has(route)) {
        const file = staticFiles.get(route);
        send(200, file.bytes, file.type);
        return;
      }
      if (documentMode && !documentSelection) throw failure(404, 'ROUTE_NOT_FOUND');
      const getRoutes = new Set(['/api/review', '/api/challenge', '/api/display', ...(desk ? ['/api/desk','/api/comparison'] : [])]);
      const postRoutes = new Set(['/api/decision', '/api/admit', '/api/invoke', '/api/reconcile', ...(desk ? ['/api/prepare'] : [])]);
      if (!documentMode && !(method === 'GET' ? getRoutes : postRoutes).has(route)) throw failure(404, 'ROUTE_NOT_FOUND');
      if (method === 'POST') {
        if (count('origin') !== 1 || request.headers.origin !== origin) throw failure(403, 'ORIGIN_REQUIRED');
        if (count('content-type') !== 1 || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'])) throw failure(415, 'CONTENT_TYPE_REJECTED');
        if (request.headers['content-encoding'] !== undefined) throw failure(415, 'CONTENT_ENCODING_REJECTED');
        const length = request.headers['content-length'];
        if (length !== undefined && (!/^[0-9]+$/.test(length) || Number(length) > (documentMode ? 16384 : BODY_LIMIT))) throw failure(413, 'BODY_TOO_LARGE');
      }
      if (busy) throw failure(409, 'WORKBENCH_BUSY');
      busy = true;
      try {
        if (documentMode) {
          let body;
          if (method === 'POST') {
            try { body = parseStrictJson(await readBody(request, 16384)); }
            catch (error) { if (error instanceof TransportError) throw error; throw failure(400, 'INVALID_JSON'); }
          }
          await dispatchDocument({ application, selected: documentSelection, body, readOnly, send, failure });
          return;
        }
        if (method === 'GET') {
          if(route==='/api/desk') {
            send(200,{...await application.desk(),accessMode:readOnly?'READ_ONLY':'CONTROLLED_USE'});
          } else if(route==='/api/comparison') {
            if(typeof application.comparison!=='function') throw failure(409,'COMPARISON_UNAVAILABLE');
            send(200,await application.comparison(selectedId));
          } else if (route === '/api/review') {
            const view = await application.view(selectedId);
            send(200, readOnly ? { ...view, available: { importDecision: false, admit: false, invoke: false, reconcile: false, ...(Object.hasOwn(view.available,'prepareFresh')?{prepareFresh:false}:{}) } } : view);
          } else {
            const challenge = route === '/api/challenge';
            const text = await application[challenge ? 'downloadChallenge' : 'downloadDisplay'](selectedId);
            if (typeof text !== 'string') throw failure(500, 'INVALID_APPLICATION_RESPONSE');
            send(200, text, 'application/json; charset=utf-8', `${challenge ? 'challenge' : 'review-display'}-${selectedId}.json`);
          }
          return;
        }
        let body;
        try { body = parseStrictJson(await readBody(request)); }
        catch (error) { if (error instanceof TransportError) throw error; throw failure(400, 'INVALID_JSON'); }
        let result;
        if(route==='/api/prepare') {
          if(!closed(body,['who','actionId','proposalUtf8'])||!['a','b'].includes(body.who)||typeof body.actionId!=='string'||(/^[a-z][a-z0-9-]{0,31}$/.exec(body.actionId)?.[0]!==body.actionId)) throw failure(400,'INVALID_PREPARATION_BODY');
          if(typeof body.proposalUtf8!=='string'||!body.proposalUtf8.isWellFormed()||Buffer.byteLength(body.proposalUtf8)===0||Buffer.byteLength(body.proposalUtf8)>4096) throw failure(400,'INVALID_PREPARATION_BODY');
          if(typeof application.prepareFresh!=='function') throw failure(409,'PREPARATION_UNAVAILABLE');
          try {const prepared=await application.prepareFresh(selectedId,body.who,body.actionId,body.proposalUtf8);result={status:prepared.status,parentChallengeId:prepared.parentChallengeId,challengeId:prepared.challengeId};}
          catch(error) {
            if(new Set(['APPROVAL_FRESH_PARENT_REQUIRED','APPROVAL_FRESH_ACTOR_NOT_CURRENT','APPROVAL_FRESH_STATE_REQUIRED','APPROVAL_FRESH_CAPACITY','APPROVAL_FRESH_NAME_IN_USE','APPROVAL_FRESH_CAPTURE_LIMIT','APPROVAL_POLICY_CHANGED']).has(error.code)) throw failure(409,error.code);
            throw error;
          }
        } else if (route === '/api/decision') {
          if (!closed(body, ['envelopeUtf8']) || typeof body.envelopeUtf8 !== 'string' || !body.envelopeUtf8.isWellFormed()
            || Buffer.byteLength(body.envelopeUtf8, 'utf8') === 0 || Buffer.byteLength(body.envelopeUtf8, 'utf8') > 256 * 1024) throw failure(400, 'INVALID_DECISION_BODY');
          result = await application.importDecision(selectedId, body.envelopeUtf8);
        } else {
          if (!closed(body, [])) throw failure(400, 'INVALID_EMPTY_BODY');
          const action = route.slice('/api/'.length);
          result = await application[action](selectedId);
        }
        send(200, result ?? { status: 'COMPLETED' });
      } finally { busy = false; }
    };
    run().catch(error => send(error instanceof TransportError ? error.status : 500,
      { error: error instanceof TransportError ? error.publicCode : 'APPLICATION_FAILURE' }));
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  server.keepAliveTimeout = 1000;
  server.on('upgrade', (_request, socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  host = `127.0.0.1:${server.address().port}`;
  origin = `http://${host}`;
  return {
    url: origin,
    close: async () => {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
  };
}

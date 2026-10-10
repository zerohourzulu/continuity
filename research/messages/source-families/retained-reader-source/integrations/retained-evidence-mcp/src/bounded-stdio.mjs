import { EventEmitter } from 'node:events';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import { LIMITS } from './profile.mjs';
import { parseStrictJson } from './strict-json.mjs';

// Feed the official SDK one complete validated frame at a time. A pipe read may
// contain many valid frames whose combined length exceeds the per-frame limit.
export class BoundedStdioTransport {
  constructor(input = process.stdin, output = process.stdout, { limits = LIMITS } = {}) {
    this.input = input;
    this.limits = limits;
    this.frames = 0;
    this.outputBytes = 0;
    this.closed = false;
    this.bridge = new EventEmitter();
    this.bridge.pause = () => {};
    this.inner = new StdioServerTransport(this.bridge, output, { maxBufferSize: limits.inputFrameBytes + 1 });
    this.inner.onmessage = message => this.onmessage?.(message);
    this.inner.onerror = () => this.fail('INVALID_MCP_FRAME');
    this.output = output;
    this.outputError = () => this.fail('OUTPUT_UNAVAILABLE');
  }

  async start() {
    if (this.started) throw new Error('TRANSPORT_ALREADY_STARTED');
    this.started = true;
    this.output.on('error', this.outputError);
    this.output.on('close', this.outputError);
    await this.inner.start();
    // Completion is retained for finite tests/CLI shutdown, but start must return
    // immediately so the SDK can complete its connection lifecycle.
    this.done = this.consume();
  }

  fail(code) {
    if (this.closed || this.failureCode) return;
    this.failureCode = code;
    this.onerror?.(new Error(code));
    void this.close();
  }

  async consume() {
    let pending = Buffer.alloc(0);
    try {
      for await (const raw of this.input) {
        const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        let offset = 0;
        while (offset < chunk.length && !this.closed) {
          const newline = chunk.indexOf(10, offset);
          const end = newline < 0 ? chunk.length : newline;
          const part = chunk.subarray(offset, end);
          if (pending.length + part.length > this.limits.inputFrameBytes) throw new Error('INPUT_FRAME_LIMIT');
          pending = pending.length ? Buffer.concat([pending, part]) : Buffer.from(part);
          offset = newline < 0 ? chunk.length : newline + 1;
          if (newline < 0) continue;
          if (++this.frames > this.limits.sessionRequests) throw new Error('SESSION_REQUEST_LIMIT');
          const message = parseStrictJson(pending);
          if (!message || Array.isArray(message) || typeof message !== 'object') throw new Error('INVALID_MCP_FRAME');
          if (Object.hasOwn(message, 'id')) {
            const id = message.id;
            if (!(typeof id === 'number' && Number.isSafeInteger(id)) &&
                !(typeof id === 'string' && Buffer.byteLength(id, 'utf8') <= 128)) throw new Error('INVALID_RPC_ID');
          }
          // The server has no outgoing requests and therefore accepts no inbound responses.
          if (typeof message.method !== 'string') throw new Error('INVALID_MCP_FRAME');
          let completed;
          if (Object.hasOwn(message, 'id')) {
            this.pendingId = message.id;
            completed = new Promise(resolve => { this.release = resolve; });
          }
          this.bridge.emit('data', Buffer.concat([pending, Buffer.from('\n')]));
          pending = Buffer.alloc(0);
          if (completed) await completed;
        }
        if (this.closed) break;
      }
      if (!this.closed && pending.length) throw new Error('UNTERMINATED_FRAME');
      await this.close();
    } catch (error) {
      const codes = new Set(['INPUT_FRAME_LIMIT', 'SESSION_REQUEST_LIMIT', 'INVALID_UTF8', 'INVALID_JSON', 'DUPLICATE_KEY', 'INVALID_MCP_FRAME', 'INVALID_RPC_ID', 'UNTERMINATED_FRAME']);
      this.fail(codes.has(error?.message) ? error.message : 'INPUT_UNAVAILABLE');
    }
  }

  async send(message) {
    if (this.closed) throw new Error('TRANSPORT_CLOSED');
    const size = Buffer.byteLength(serializeMessage(message));
    if (size > this.limits.responseBytes) { this.fail('RESPONSE_FRAME_LIMIT'); throw new Error('RESPONSE_FRAME_LIMIT'); }
    if (this.outputBytes + size > this.limits.sessionOutputBytes) { this.fail('SESSION_OUTPUT_LIMIT'); throw new Error('SESSION_OUTPUT_LIMIT'); }
    this.outputBytes += size;
    // The SDK handles stdout backpressure; its write is the exact serialization measured above.
    await Promise.race([
      this.inner.send(message),
      new Promise(resolve => { this.releaseWrite = resolve; })
    ]);
    this.releaseWrite = undefined;
    if (Object.hasOwn(message, 'id') && message.id === this.pendingId) {
      this.release?.(); this.release = undefined; this.pendingId = undefined;
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.release?.(); this.release = undefined;
    this.releaseWrite?.(); this.releaseWrite = undefined;
    this.output.off('error', this.outputError);
    this.output.off('close', this.outputError);
    await this.inner.close();
    this.input.destroy();
    this.onclose?.();
  }
}

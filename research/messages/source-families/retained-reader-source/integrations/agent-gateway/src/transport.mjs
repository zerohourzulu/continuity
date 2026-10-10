import { BoundedStdioTransport } from '../../retained-evidence-mcp/src/bounded-stdio.mjs';
import { parseStrictJson } from '../../retained-evidence-mcp/src/strict-json.mjs';

// Keep the accepted framing/limits/serialization implementation. Its bridge feeds
// exactly one validated frame at a time into the SDK. SDK generic params parsing
// discards own __proto__; retain the raw tool params for the server's closed check.
// SDK JSON-RPC shape validation still runs before this forwarding callback.
export class GatewayStdioTransport extends BoundedStdioTransport {
  constructor(input, output, options) {
    super(input, output, options);
    let raw;
    this.bridge.prependListener('data', bytes => { raw = parseStrictJson(bytes); });
    this.inner.onmessage = message => {
      if (message.method === 'tools/call') {
        const original = raw;
        raw = undefined;
        if (!original || original.method !== message.method || original.id !== message.id) {
          this.fail('RAW_TOOL_FRAME_UNAVAILABLE');
          return;
        }
        this.onmessage?.({ ...message, params: original.params });
      } else { raw = undefined; this.onmessage?.(message); }
    };
  }
}

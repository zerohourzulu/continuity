import { isDeepStrictEqual } from 'node:util';

// This agent-side interface accepts only an already-connected MCP channel.
// It has no application, signer, executor, filesystem, or process-launch imports.
export function createAgentClient(connectedClient, { caseId, actor }) {
  return Object.freeze({
    listTools: () => connectedClient.listTools(),
    async request(name, args = {}) {
      try {
      const response = await connectedClient.callTool({ name, arguments: args });
      const value = response.structuredContent;
      if (!value || value.schemaVersion !== 'continuity-agent-gateway/1' || value.caseId !== caseId || value.actor !== actor ||
          typeof value.ok !== 'boolean' || response.isError !== !value.ok || response.content?.length !== 1 ||
          response.content[0].type !== 'text' || !isDeepStrictEqual(JSON.parse(response.content[0].text), value) ||
          Buffer.byteLength(JSON.stringify(response)) > 49 * 1024) {
        throw new Error('GATEWAY_RESPONSE_UNAVAILABLE_OUTCOME_UNKNOWN');
      }
      return value;
      } catch {
        // Neither a transport failure nor an unreadable reply establishes no effect.
        throw new Error('GATEWAY_RESPONSE_UNAVAILABLE_OUTCOME_UNKNOWN');
      }
    }
  });
}

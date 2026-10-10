import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { Client, StdioClientTransport } from './mcp-dependencies.mjs';
import { createAgentClient } from './client.mjs';

// Trusted operator setup, separate from the agent's request interface.
// Possession of this repository/OS account is not an untrusted-agent sandbox.
export async function openOperatorGateway(caseId, actor) {
  if (typeof caseId !== 'string' || !/^[a-z][a-z0-9-]{0,31}$(?![\s\S])/.test(caseId) || !['a', 'b'].includes(actor)) throw new Error('INVALID_LAUNCH_ARGUMENTS');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./server.mjs', import.meta.url)), '--case', caseId, '--actor', actor],
    env: { PATH: dirname(process.execPath) }, stderr: 'pipe'
  });
  const client = new Client({ name: 'continuity-synthetic-agent-caller', version: '0.2.0' }, { capabilities: {} });
  try { await client.connect(transport); }
  catch { await transport.close(); throw new Error('GATEWAY_CONNECTION_UNAVAILABLE_OUTCOME_UNKNOWN'); }
  return Object.freeze({ agent: createAgentClient(client, { caseId, actor }), serverPid: transport.pid, close: () => client.close() });
}

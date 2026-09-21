// Actual stdio liveness regressions for R4 review findings. Real production
// 15-second bounds, without injected clock/transport/executable shortcuts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
function start(t) {
  const child = spawn(process.execPath, [root + 'integrations/retained-evidence-mcp/src/server.mjs',
    '--config', root + 'integrations/retained-evidence-mcp/example-config.json'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '', watchdog = false;
  const began = Date.now();
  child.stderr.on('data', b => { stderr += b; });
  child.stdin.on('error', () => {}); // Expected EPIPE when the timed-out peer exits.
  t.after(() => { child.kill('SIGKILL'); child.stdout.destroy(); child.stdin.destroy(); });
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { watchdog = true; child.kill('SIGKILL'); }, 22000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { child.stdout.destroy(); });
    child.once('close', (status, signal) => { clearTimeout(timer); resolve({ status, signal, stderr, watchdog, milliseconds: Date.now() - began }); });
  });
  return { child, done };
}
test('trickled bytes do not restart the unfinished-frame deadline', { timeout: 25000 }, async t => {
  const { child, done } = start(t);
  child.stdout.resume();
  child.stdin.write('{');
  let writes = 0;
  const interval = setInterval(() => { writes++; child.stdin.write(' '); }, 200);
  t.after(() => clearInterval(interval));
  const result = await done; clearInterval(interval);
  assert(writes >= 10, 'continuous input actually exercised the reset boundary');
  assert.equal(result.watchdog, false, JSON.stringify(result));
  assert.equal(result.status, 2); assert.equal(result.signal, null);
  assert.match(result.stderr, /FRAME_TIMEOUT/);
});
test('a client that never drains stdout cannot retain the server after timeout', { timeout: 25000 }, async t => {
  const { child, done } = start(t);
  // Intentionally never consume stdout; finite requests exceed pipe capacity.
  const messages = [
    { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stall-regression', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    ...Array.from({ length: 256 }, (_, i) => ({ jsonrpc: '2.0', id: i + 1, method: 'tools/list', params: {} })),
  ];
  child.stdin.end(messages.map(x => JSON.stringify(x)).join('\n') + '\n');
  const result = await done;
  assert.equal(result.watchdog, false, JSON.stringify(result));
  assert.equal(result.status, 2); assert.equal(result.signal, null);
  assert.match(result.stderr, /OUTPUT_STALLED/);
});

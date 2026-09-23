import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
const temp = mkdtempSync(join(tmpdir(), "continuity-packed-mcp-"));
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, {
    cwd: temp,
    encoding: "utf8",
    timeout: 90000,
  });
  if (r.error || r.status !== 0) throw Error(r.error?.message ?? r.stderr);
  return r.stdout;
};
try {
  writeFileSync(
    join(temp, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  run("npm", [
    "install",
    "--prefer-offline",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    join(root, "sdk/ramex-labs-continuity-0.3.0-preview.7.tgz"),
    join(root, "sdk/ramex-labs-continuity-mcp-0.3.0-preview.8.tgz"),
  ]);
  const pkg = join(temp, "node_modules/@ramex-labs/continuity-mcp");
  assert.equal(
    JSON.parse(readFileSync(join(pkg, "package.json"))).mcpName,
    "io.github.zerohourzulu/continuity-evidence",
  );
  run(process.execPath, [
    "--no-experimental-strip-types",
    join(temp, "node_modules/.bin/continuity-evidence-setup"),
    join(temp, "case"),
  ]);
  const result = run(process.execPath, [
    "--no-experimental-strip-types",
    join(temp, "node_modules/.bin/continuity-evidence-demo"),
    join(temp, "case/gateway.json"),
  ]);
  assert.match(result, /RECORDED/);
  assert.match(result, /RECONCILIATION_ONLY/);
  // Verify the package-name launch used by Registry clients, not only named bins.
  run(process.execPath, [join(temp, "node_modules/.bin/continuity-evidence-setup"), join(temp, "registry-case")]);
  const clientSource = readFileSync(join(pkg, "client.mjs"), "utf8")
    .replace('command: process.execPath,', 'command: "npx",')
    .replace('fileURLToPath(new URL("./server.mjs", import.meta.url)),', '"--no-install", "@ramex-labs/continuity-mcp",');
  writeFileSync(join(temp, "registry-client.mjs"), clientSource);
  const registryResult = run(process.execPath, [join(temp, "registry-client.mjs"), join(temp, "registry-case/gateway.json")]);
  assert.match(registryResult, /RECORDED/);
  assert.match(registryResult, /RECONCILIATION_ONLY/);
  console.log("PASS: npx package-name launch through actual MCP handshake and one-attempt retry.");
  console.log(
    "PASS: independently installed MCP tarball, compiled Core, fresh keys, actual client/server and one-attempt retry.",
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}

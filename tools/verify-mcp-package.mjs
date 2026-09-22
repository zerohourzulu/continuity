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
    join(root, "sdk/continuity-evidence-mcp-0.3.0-preview.5.tgz"),
  ]);
  const pkg = join(temp, "node_modules/@continuity/evidence-mcp");
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
  console.log(
    "PASS: independently installed MCP tarball, compiled Core, fresh keys, actual client/server and one-attempt retry.",
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}

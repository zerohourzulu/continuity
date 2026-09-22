import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  createLocalDomain,
  createLocalOwner,
} from "../../packages/core-0.3/src/local-owner.ts";
import {
  openLocalEvidenceTool,
  selectEvidence,
} from "../../packages/core-0.3/src/evidence.ts";
import {
  openLocalExecution,
  commitTerms,
} from "../../packages/core-0.3/src/execution.ts";
import { createPacketExecutor } from "../../packages/core-0.3/src/adapters/packet-executor.mjs";
const { generatePrivateKey, privateKeyToAccount } = createRequire(
  new URL("../../packages/core/package.json", import.meta.url),
)("viem/accounts");
const code = (value) => (e) => e.code === value;
export function setup(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "continuity-evidence-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const inputDirectory = join(dir, "source"),
    outputDirectory = join(dir, "packets");
  mkdirSync(inputDirectory, { mode: 0o700 });
  mkdirSync(outputDirectory, { mode: 0o700 });
  writeFileSync(
    join(inputDirectory, "incident.txt"),
    "Synthetic event: review this.\n",
    { mode: 0o600 },
  );
  const account = privateKeyToAccount(generatePrivateKey()),
    config = {
      historyFile: join(dir, "history.jsonl"),
      domain: createLocalDomain(),
      owner: "operations",
      controller: "operator",
      now: () => 100,
    };
  const owner = createLocalOwner(config);
  owner.createAgent({ id: "bea" });
  owner.createRole({ id: "reviewer" });
  owner.appoint({ agent: "bea", role: "reviewer", tenure: "shift", number: 1 });
  owner.admitRuntime({
    session: "session",
    agent: "bea",
    epoch: 1,
    key: "key",
    address: account.address,
    expiresAt: 200,
  });
  owner.grant({
    id: "collect",
    to: "bea",
    actions: ["collect-evidence-packet"],
    resources: ["incident:42"],
    expiresAt: 200,
  });
  const options = {
    ...config,
    session: "session",
    signHash: (hash) => account.signMessage({ message: { raw: hash } }),
    inputDirectory,
    outputDirectory,
    selection: selectEvidence(inputDirectory),
    resource: "incident:42",
    role: "reviewer",
    tenure: "shift",
  };
  const tool = openLocalEvidenceTool(options),
    request = { operationId: "collect:42", resource: "incident:42" };
  return { tool, owner, options, request, config };
}

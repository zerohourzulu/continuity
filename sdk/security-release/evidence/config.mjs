import {
  openSync,
  closeSync,
  fstatSync,
  readFileSync,
  constants,
  lstatSync,
} from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { openLocalEvidenceTool } from "@ramex-labs/continuity/evidence";
import { parseStrictJson } from "./strict-json.mjs";
const fail = () => {
  throw Error("CONFIG_UNAVAILABLE");
};
function privateFile(path, maximum) {
  if (typeof path !== "string") fail();
  const before = lstatSync(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    (before.mode & 0o077) !== 0 ||
    before.size > maximum
  )
    fail();
  const fd = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.dev !== before.dev ||
      stat.ino !== before.ino ||
      stat.nlink !== 1 ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > maximum
    )
      fail();
    const bytes = readFileSync(fd);
    if (bytes.length > maximum) fail();
    return bytes;
  } finally {
    closeSync(fd);
  }
}
export function loadGateway(configFile, { additionalPolicy } = {}) {
  const config = parseStrictJson(privateFile(configFile, 16384), {
    maxBytes: 16384,
    maxDepth: 12,
    maxNodes: 2048,
  });
  const fields = [
    ...(config?.historyProfile === "continuity-segmented-local/1" ? ["historyProfile", "historyBinding"] : ["historyFile"]),
    "domain",
    "owner",
    "controller",
    "session",
    "role",
    "tenure",
    "resource",
    "inputDirectory",
    "outputDirectory",
    "selection",
    "keyFile",
  ];
  if (
    !config ||
    Array.isArray(config) ||
    Object.keys(config).length !== fields.length ||
    fields.some((k) => !Object.hasOwn(config, k))
  )
    fail();
  const key = privateFile(config.keyFile, 128).toString("utf8").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) fail();
  const account = privateKeyToAccount(key);
  return openLocalEvidenceTool({
    ...config,
    ...(additionalPolicy ? { additionalPolicy } : {}),
    now: Date.now,
    signHash: (hash) => account.signMessage({ message: { raw: hash } }),
  });
}

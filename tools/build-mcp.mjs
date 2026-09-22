// Build an independently installable stdio tool from the checked-in compiled Core.
import {
  readFileSync,
  writeFileSync,
  cpSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url)),
  out = join(root, "sdk/evidence-mcp");
if (process.argv.length !== 2) throw Error("Use: node tools/build-mcp.mjs");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "sdk/core-0.3/dist"), join(out, "core/dist"), {
  recursive: true,
});
cpSync(
  join(root, "sdk/core-0.3/BUILD-PROVENANCE.json"),
  join(out, "CORE-BUILD-PROVENANCE.json"),
);
for (const name of [
  "server.mjs",
  "config.mjs",
  "setup.mjs",
  "client.mjs",
  "strict-json.mjs",
]) {
  const code = readFileSync(
    join(root, "integrations/protected-evidence-mcp", name),
    "utf8",
  )
    .replaceAll(
      "@continuity/core/evidence",
      "./core/dist/core-0.3/src/evidence.js",
    )
    .replaceAll(
      "@continuity/core/local",
      "./core/dist/core-0.3/src/local-owner.js",
    );
  writeFileSync(join(out, name), code, {
    mode: name.endsWith(".mjs") ? 0o755 : 0o644,
  });
}
for (const name of ["LICENSE", "NOTICE"])
  cpSync(join(root, name), join(out, name));
writeFileSync(join(out, "THIRD-PARTY-NOTICES.md"), `# Package dependencies

This archive bundles Continuity-authored compiled Core and MCP glue under Apache-2.0, with LICENSE and NOTICE. It does not bundle third-party runtime code or website assets. npm installs the pinned MCP client/server, viem and zod dependencies separately; their own package licenses and transitive dependency notices remain applicable and accompany those installed packages. The full source distribution has a separate dependency and website notice inventory.
`);
cpSync(join(root, "docs/MCP-PACKAGE.md"), join(out, "README.md"));
writeFileSync(
  join(out, "package.json"),
  JSON.stringify(
    {
      name: "@continuity/evidence-mcp",
      version: "0.3.0-preview.5",
      private: true,
      description:
        "A bounded local MCP evidence tool that checks current authority and preserves operation history",
      type: "module",
      license: "Apache-2.0",
      mcpName: "io.github.zerohourzulu/continuity-evidence",
      repository: {
        type: "git",
        url: "https://github.com/zerohourzulu/continuity.git",
      },
      engines: { node: "^22.18.0 || ^24.0.0 || ^26.0.0" },
      bin: {
        "continuity-evidence": "./server.mjs",
        "continuity-evidence-setup": "./setup.mjs",
        "continuity-evidence-demo": "./client.mjs",
      },
      files: [
        "*.mjs",
        "core",
        "CORE-BUILD-PROVENANCE.json",
        "LICENSE",
        "NOTICE",
        "THIRD-PARTY-NOTICES.md",
        "README.md",
      ],
      dependencies: {
        "@modelcontextprotocol/client": "2.0.0",
        "@modelcontextprotocol/server": "2.0.0",
        viem: "2.55.19",
        zod: "4.6.5",
      },
    },
    null,
    2,
  ) + "\n",
);
// Preserve the tested dependency graph for standalone installs. The compiled
// Core is included directly, so its local development tarball is not a dependency.
const manifest = JSON.parse(readFileSync(join(out, "package.json")));
const lock = JSON.parse(readFileSync(join(root, "integrations/protected-evidence-mcp/package-lock.json")));
delete lock.packages["node_modules/@continuity/core"];
lock.name = manifest.name; lock.version = manifest.version;
lock.packages[""] = { name: manifest.name, version: manifest.version, license: manifest.license,
  dependencies: manifest.dependencies, bin: manifest.bin, engines: manifest.engines };
writeFileSync(join(out, "npm-shrinkwrap.json"), JSON.stringify(lock, null, 2) + "\n");
const result = spawnSync(
  "npm",
  [
    "pack",
    "--ignore-scripts",
    "--json",
    "--pack-destination",
    join(root, "sdk"),
  ],
  { cwd: out, encoding: "utf8" },
);
if (result.error || result.status !== 0)
  throw Error("MCP pack failed: " + result.stderr);
console.log(result.stdout);

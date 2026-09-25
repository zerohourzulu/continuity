# The action is uncertain. Can the investigation still finish?

Yes. You can finish checking an incident while honestly saying that an outside result has not been proven. If another report arrives, the investigation needs another look. If someone with the required permissions challenges the conclusion, that challenge stays visible.

This walkthrough follows one case from beginning to end. It uses a synthetic incident file and real local access controls. No AI account, chain, cloud service or API key is needed.

## Run it

Use Node 22.18+ on the 22.x line or Node 24.x. From this source package:

```sh
npm ci --ignore-scripts
node --experimental-strip-types examples/protected-evidence/investigation-scenario.mjs
```

Allow several minutes: the example deliberately carries more than 256 history entries into the same case. Each printed stage describes a checked result. An assertion stops the run if a claim is false. This is a local demonstration, not an installation on your existing documents or services.

## What happens

1. A reviewer can read a synthetic incident file. An agent asks the evidence service to restrict access. The service acts, but its reply gets lost.
2. The case keeps the unanswered request, its reserved one-use allowance and the duty to investigate. A revoked restoration permission stays revoked.
3. Another agent takes over. The old process remains alive, but its requests are refused. The replacement receives permission to investigate; it still cannot restore access.
4. The service and coordinator restart. The replacement finds the original result without repeating the action. A separate permission allows one restoration. The investigation is still OPEN.
5. The host reads the incident file and checks its digest against the file selected when the service was created. It writes a local report, checks those bytes, and records a finding and an independently authorized completion. The current view is COMPLETED_UNDER_POLICY. The outside result remains NOT_PROVEN.
6. A later signed service observation is recorded. The view becomes NEEDS_REVIEW. This is another recorded report of the original result, not another outside action or a claim of new factual truth.
7. An updated report is recorded, then challenged under the declared permissions. The view becomes CONTESTED. The earlier reports remain readable.
8. The service and a fresh host reopen the same case. Retrying the exact operations signs nothing, appends nothing and sends no action again. The old worker still has no restored authority.

The final case has two external effects: restriction and the separately permitted restoration. Finishing or challenging the investigation adds records, not effects.

## Where to look

The command prints its temporary case directory. Under `host/`, inspect `result.json`, the two `investigation:*.json` reports, `investigation-challenge.json` and `investigation-retry.json`. The current view in the result is CONTESTED and outstanding. The original creation record still says OPEN because that is what was recorded when the duty began.

Keep that directory private. It also contains generated local test credentials. Share the source example or a reviewed report, not the entire case directory. The run preserves the case for inspection and closes its child processes and listeners. A failed run is also retained; the host does not silently replace that case to make it pass.

Report and source digests are checked before each finding/disposition signature. Changed, missing, linked or oversized material refuses. This does not prove that a person read carefully or that a report is true. The host is making an attributed statement within explicit permissions.

## Try the installed integrations

The four packages adds the same engine to the existing remote, MCP gateway and evidence packages. To install the exact bundled archives into a new empty directory:

```sh
node tools/release/install.mjs "$(mktemp -d)"
```

Maintainers rebuilding the archives first run `npm ci --prefix tools/sdk-build --ignore-scripts --no-audit --no-fund`, then `npm run release:build` and `npm run release:check`. Run `npm run release:verify` for strict types and installed integration checks after that compiler setup. The release lock updater is a maintainer tool, not required to evaluate an existing archive.

The verifier creates a fresh consumer, installs the exact local archives and locked dependencies, checks strict TypeScript and exercises MCP recovery, operator summaries and the native LangChain tool. The gateway's status includes the current investigation view; the operator's count-only summary reports how many activated duties are complete, need review or contested. Permission checks still control the gateway's inspection surface. None of these readers grants execution authority.

## What protects the file?

The ordinary run uses your account for every process. It proves the flow, not operating-system isolation. The [protected evidence guide](../examples/protected-evidence/README.md) explains the separate-account Linux lab: workers cannot read the protected file, host credentials or configuration, connect directly to the private reader socket, or submit an unsigned write. Root, the host, service, kernel, clock and filesystem remain trusted.

The history and quotas are finite. This first rule set reserves four dispositions and two contests per activated duty. It has no automatic way to withdraw or resolve a contest. [The host API guide](../packages/core-0.3/package-docs/0.3.0-d03.1.md) explains the exact permissions and limits. A mature deployment still needs its own operational review; this private walkthrough does not certify one.

import { humanEvidenceCommandError } from '../../retained-evidence-mcp/src/human-error.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openEvidenceClient } from '../../retained-evidence-mcp/src/client.mjs';
import { resolveProfile } from '../../retained-evidence-mcp/src/profile.mjs';
import { projectSelectedCase, PROFILE, CATALOG_SHA256, SELECTED_EVIDENCE_IDS } from './project.mjs';

/** One fixed retained case. No caller input, new evaluation or current authority. */
export async function readDurableCaseSummary() {
  if (arguments.length !== 0) throw new Error('readDurableCaseSummary accepts no arguments');
  const profile = resolveProfile(PROFILE);
  if (profile.expectedCatalogSha256 !== CATALOG_SHA256) throw new Error('Fixed durable catalog pin mismatch');
  const reader = await openEvidenceClient({ profile: PROFILE });
  try {
    const artifacts = Object.create(null);
    for (const id of SELECTED_EVIDENCE_IDS) {
      const bytes = await reader.readEvidence(id);
      artifacts[id] = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    }
    return projectSelectedCase({ catalog: reader.catalog, catalogSha256: CATALOG_SHA256, artifacts });
  } finally { await reader.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(async () => {
    if (process.argv.length !== 2) throw new Error('Usage: node src/summary.mjs (no arguments)');
    process.stdout.write(JSON.stringify(await readDurableCaseSummary()) + '\n');
  }).catch(error => { process.stderr.write(humanEvidenceCommandError(error) + '\n'); process.exitCode = 1; });
}

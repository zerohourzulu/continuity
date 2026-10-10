import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const VERIFIER_SOURCE_PIN_SHA256 = 'b1136946230b536895e8ac684ea9c8fea4e5e8e5645c8b0d48f07b3694ee4fe5';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
/** Fixed local source identity check, before loading the approved verifier. */
export async function verifyAcceptedCoreSource() {
  if(arguments.length!==0) throw new Error('UNEXPECTED_SOURCE_ARGUMENT');
  const raw=await readFile(new URL('../sources/core-source-pin.json',import.meta.url));
  if(raw.length>32768 || digest(raw)!==VERIFIER_SOURCE_PIN_SHA256) throw new Error('VERIFIER_SOURCE_PIN_MISMATCH');
  const pin=JSON.parse(raw.toString('utf8'));
  for(const member of pin.files) {
    const bytes=await readFile(new URL('../../../'+member.path,import.meta.url));
    if(bytes.length!==member.bytes || digest(bytes)!==member.sha256) throw new Error('VERIFIER_SOURCE_CHANGED');
  }
  return Object.freeze({verifierId:pin.verifierId,packageVersion:pin.packageVersion,sourcePinSha256:VERIFIER_SOURCE_PIN_SHA256,filesChecked:pin.files.length});
}

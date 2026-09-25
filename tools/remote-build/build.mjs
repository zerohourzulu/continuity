// Compatibility entry for: node tools/remote-build/build.mjs .
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
if(process.argv.length!==3||resolve(process.argv[2])!==resolve(root))throw Error('Pass this source directory');
process.argv.splice(2);
await import('../release/build.mjs');

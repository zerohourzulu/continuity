import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './environment.mjs';
import { snippets } from './quickstart-content.mjs';
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== '--check')) { console.error('Use: node tools/render-quickstart.mjs [--check]'); process.exit(2); }
const check = args[0] === '--check';
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
let drift = false;
for (const path of ['README.md','docs/QUICKSTART.md','docs/TUTORIAL.md','website/index.html']) {
  const file = join(ROOT,path), before = readFileSync(file,'utf8');
  let count=0;
  const after = before.replace(/<!-- quickstart:(clone|recorded|run|compare) -->([\s\S]*?)<!-- \/quickstart -->/g, (_,name) => {
    count++;
    const content = path.endsWith('.html') ? `<pre${name === 'run' ? ' id="commands"' : ''}><code>${escape(snippets[name])}</code></pre>` : `\n\`\`\`sh\n${snippets[name]}\n\`\`\`\n`;
    return `<!-- quickstart:${name} -->${content}<!-- /quickstart -->`;
  });
  if(!count)throw Error(`Missing quickstart markers: ${path}`);
  if(before!==after){if(check){console.error(`Setup snippet drift: ${path}`);drift=true;}else writeFileSync(file,after);}
}
if(drift)process.exitCode=1;
else console.log(check ? 'Quickstart snippets agree.' : 'Quickstart snippets rendered. Review the diff; the package index was not changed.');

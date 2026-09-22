import { checks, TARGETS } from './environment.mjs';
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: node tools/doctor.mjs [--for reader|tutorial|test|setup]\nChecks local prerequisites; never downloads or changes files. Default: tutorial.');
} else {
  const target = args.length === 0 ? 'tutorial' : args.length === 2 && args[0] === '--for' ? args[1] : null;
  if (!TARGETS.includes(target)) {
    console.error('Use: node tools/doctor.mjs --for reader|tutorial|test|setup'); process.exitCode = 2;
  } else {
    const rows = checks(target);
    for (const row of rows) console.log(`${row.ok ? 'OK' : 'NEEDED'} — ${row.detail}${row.ok ? '' : `\n  ${row.fix}`}`);
    if (rows.some(row => !row.ok)) process.exitCode = 2;
    else console.log(`Ready for ${target}. No files were changed.`);
  }
}

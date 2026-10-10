// Human display only. Never forward raw exception text, paths or assertion values.
const codes = new Set(['ENOENT','EACCES','EPERM','EEXIST','ERR_ASSERTION',
  'SOURCE_UNAVAILABLE','SOURCE_CHANGED','SOURCE_BYTES_EXCEEDED','SOURCE_NOT_REGULAR',
  'HISTORY_EMPTY','HISTORY_INTEGRITY','HISTORY_MALFORMED','EVENT_LIMIT_EXCEEDED',
  'SOURCE_DENIED','SOURCE_PATH_DENIED','OPERATION_DENIED','UNSUPPORTED_HISTORY_PROFILE','CONFIG_INVALID',
  'UNKNOWN_OPERATION','INVALID_ARGUMENTS','INVALID_EVALUATION_TIME','INVALID_AMOUNT',
  'REQUEST_LIMIT_EXCEEDED','OUTPUT_LIMIT_EXCEEDED','READER_TIMEOUT','READER_FAILED']);
const messages = new Map([
  ["Use: node tutorial/start.mjs [--deny-review] [--packet]", "Use node tutorial/start.mjs [--deny-review] [--packet] for a fresh case. It does not recover an earlier case."],
  ["Tutorial did not complete successfully; retained evidence was not removed.", "The tutorial did not reach its expected completion. Keep and inspect the existing case before considering a new run."],
  ["Use: node tools/setup.mjs (no arguments). See docs/QUICKSTART.md for the manual install command.", "setup takes no arguments. See node tools/setup.mjs and docs/QUICKSTART.md; setup is an explicit installation step."],
  ["Installation did not finish. Check npm/registry access and free disk space, then rerun this command. Keep the lockfile and scripts-disabled options; no tutorial was started. See docs/TROUBLESHOOTING.md.", "The installation did not finish successfully. Possible causes include registry access or disk space. Inspect the installation state before another authorized installation. Keep the lockfile and scripts-disabled options. This setup command did not start a tutorial. See docs/TROUBLESHOOTING.md."],
  ["Use: node tools/playground.mjs SCENARIO.json", "Supply one saved scenario JSON file to node tools/playground.mjs. This command checks a scenario locally."],
  ["Choose a regular scenario JSON file of at most 32 KB.", "Choose a regular scenario JSON file of at most 32 KiB (32,768 bytes)."],

  ['Use: inspect CASE_NAME','Supply the original case name after inspect.'],
  ['Unknown command. Use --help.','That tutorial command is not supported. Run node tutorial/cli.mjs --help.'],
  ['Invalid or repeated option. Use --help.','An option is missing a value, repeated or unsupported. Run node tutorial/cli.mjs --help.'],
  ['Invalid mode or policy. Use --help.','The mode or review choice is not supported. Run node tutorial/cli.mjs --help.'],
  ['Case name: 1–32 lowercase letters, digits or hyphens, starting with a letter.','Use a case name of 1–32 lowercase letters, digits or hyphens, starting with a letter.'],
  ['Case must use its original non-symlink directory and history','Use the original case directory and history. Aliases and symbolic links are refused.'],
  ['Run directory must not be aliased','Use the original run directory. An aliased directory is refused.'],
]);
export function humanLocalError(error) {
  if (!error || typeof error !== 'object') return 'The local command did not finish. This does not judge the retained case or history bad. The software could not track the cause; possible causes include a crash, timeout or unexpected error. Keep the command and retained state and inspect status/check before considering another action. Code: LOCAL_ERROR_UNKNOWN.';
  const code = Object.getOwnPropertyDescriptor(error,'code')?.value;
  if (typeof code === 'string' && codes.has(code)) {
    const advice = code === 'ERR_ASSERTION' ? 'A local expectation was not met; this alone is not a verdict on the history.' :
      code === 'ENOENT' ? 'A required local file or directory was not found.' :
      ['EACCES','EPERM'].includes(code) ? 'Access to a required local file or directory was denied.' :
      code === 'EEXIST' ? 'A file or directory already exists. Inspect it before considering another creation.' :
      'The local command reported this code. Check the command and retained case records.';
    return `${advice} Code: ${code}.`;
  }
  const message = Object.getOwnPropertyDescriptor(error,'message')?.value;
  return messages.get(message) ?? environmentPrerequisiteText(message) ?? 'The local command did not finish. This does not judge the retained case or history bad. The software could not track the cause; possible causes include a crash, timeout or unexpected error. Keep the command and retained state and inspect status/check before considering another action. Code: LOCAL_ERROR_UNKNOWN.';
}

// Recognize only complete source-defined assertReady line forms; do not echo
// dynamic Node versions, unsupported-platform strings or any arbitrary payload.
function environmentPrerequisiteText(message) {
  if(typeof message!=='string' || message.length>2048)return undefined;
  const nodeFix='Use Node 22.18+ (22.x), 24.x or 26.x; prefer the latest patch of your chosen release.';
  const lines=message.split('\n');if(!lines.length || lines.length>4)return undefined;
  const recognized=[];
  for(const line of lines) {
    if(/^Node [0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\. /.test(line) && line.replace(/^Node [0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\. /,'')===nodeFix) recognized.push(['node',nodeFix]);
    else if(line==='win32. This edition supports macOS and Linux. Native Windows is not yet validated.') recognized.push(['platform','This edition supports macOS and Linux. Native Windows is not yet validated.']);
    else if(line==='Tutorial dependencies missing. Run: node tools/setup.mjs') recognized.push(['dependencies','Tutorial dependencies are missing. The existing installation command is node tools/setup.mjs. Review that installation separately before using the tutorial.']);
    else if(line==='npm unavailable. Install a standard supported Node distribution, which includes npm; then open a new terminal. Global pnpm is not required.') recognized.push(['npm','npm is unavailable. Use a supported Node distribution that includes npm, then open a new terminal. Global pnpm is not required.']);
    else if(line==='Python 3.9+ unavailable. Install Python 3.9+ as python3 for the complete suite. For the Node-only subset: node tools/test.mjs --node-only') recognized.push(['python','The complete test suite needs Python 3.9+ as python3. The existing Node-only subset command is node tools/test.mjs --node-only; it does not cover the complete suite.']);
    else return undefined;
  }
  const keys=recognized.map(x=>x[0]),order=['node','platform','dependencies','npm','python'];
  if(new Set(keys).size!==keys.length || keys.some((k,i)=>i>0&&order.indexOf(k)<order.indexOf(keys[i-1])) || keys.includes('npm')&&(keys.includes('dependencies')||keys.includes('python')))return undefined;
  return 'A local prerequisite check reported missing or unsupported requirements. '+recognized.map(x=>x[1]).join(' ');
}
const clientSetupMessages=Object.freeze({
 USAGE:'Usage: node tools/mcp-client-config.mjs --client vscode|claude|portable --gateway-dir PATH --config PATH\nPrints JSON only; does not edit settings, inspect keys or start tools. Use Node 22.18+ (22.x) or 24.x on macOS/Linux.',
 UNSUPPORTED_RUNTIME:'Run this helper with Node 22.18+ on the 22.x line or Node 24 on macOS/Linux.',
 GATEWAY_UNAVAILABLE:'Choose a trusted installation of @ramex-labs/continuity-mcp-gateway@0.3.0-preview.8.',
 CONFIG_UNAVAILABLE:'Choose an existing private gateway.json in a private case directory. This helper never changes permissions or creates a case.',
 NODE_UNAVAILABLE:'Use an installed Node executable.'
});
export function humanClientSetupError(error) {
 const code=error && typeof error==='object'?Object.getOwnPropertyDescriptor(error,'code')?.value:undefined;
 const message=error && typeof error==='object'?Object.getOwnPropertyDescriptor(error,'message')?.value:undefined;
 return typeof code==='string' && Object.hasOwn(clientSetupMessages,code) && clientSetupMessages[code]===message ? code+': '+message : 'The launch fragment could not be reported. The software could not track the cause; possible causes include a crash, timeout or unexpected error. Code: SETUP_UNAVAILABLE. Keep the original command and inspect the selected trusted installation and private configuration with the maintainer. This message does not establish how far the helper progressed.';
}

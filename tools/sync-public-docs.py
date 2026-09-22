#!/usr/bin/env python3
"""Generate website Markdown copies from the repository's current guides."""
from pathlib import Path
import argparse, posixpath, re
root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
base = 'https://github.com/zerohourzulu/continuity/blob/main/'
pairs = [(f, root/'docs'/f.name) for f in sorted((root/'website/docs').glob('*.md'))]
pairs += [(f, root/f.name) for f in sorted((root/'website/downloads').glob('*.md')) if (root/f.name).is_file()]
failed = []
for dest, source in pairs:
    text = source.read_text()
    def link(match):
        label, target = match.groups()
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) or target.startswith('#'):
            return match.group(0)
        normalized = posixpath.normpath(str(source.parent.relative_to(root)) + '/' + target)
        return '[' + label + '](' + base + normalized + ')'
    text = re.sub(r'\[([^\]\n]*)\]\(([^)\s]+)\)', link, text)
    if args.check:
        if dest.read_text() != text: failed.append(str(dest.relative_to(root)))
    else:
        dest.write_text(text)
if failed:
    raise SystemExit('Outdated website documents: ' + ', '.join(failed))
print(('Checked' if args.check else 'Updated') + ' ' + str(len(pairs)) + ' website documents')

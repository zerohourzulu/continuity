"""Conservative CI selection. Missing history and unknown paths use full checks."""
import json,os,subprocess
from pathlib import Path

PRESENTATION={'README.md','README-ELI5.md','docs/WEBSITE.md','website/index.html','website/style.css','website/app.js','website/favicon.svg','website/playground/index.html','website/playground/style.css','website/playground/README.md'}
def classify(paths,force=False):
    paths=set(paths)-{'PACKAGE-FILES.json'}
    if force or not paths:return 'full'
    level='site'
    for p in paths:
        if p in PRESENTATION or p.startswith(('website/images/','website/fonts/')) or (p.startswith('website/downloads/') and p.endswith('.md')):continue
        if p.startswith(('website/playground/','tests/browser/')):level='playground';continue
        return 'full'
    return level

def selection():
    try:
        event=json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
        name=os.environ['GITHUB_EVENT_NAME']
        if name=='pull_request':
            base=event['pull_request']['base']['sha'];head=event['pull_request']['head']['sha']
            base=subprocess.check_output(['git','merge-base',base,head],text=True).strip()
        elif name=='push':base=event['before'];head=event['after']
        else:return 'full',[]
        if not base or set(base)=={'0'}:return 'full',[]
        raw=subprocess.check_output(['git','diff','--no-renames','--name-only','-z',base,head,'--'])
        paths=[p.decode('utf-8') for p in raw.split(b'\0') if p]
        return classify(paths),paths
    except (KeyError,ValueError,OSError,subprocess.CalledProcessError):return 'full',[]

if __name__=='__main__':
    level,paths=selection();print(json.dumps({'level':level,'paths':paths}))
    with open(os.environ['GITHUB_OUTPUT'],'a') as f:f.write('level='+level+'\n')

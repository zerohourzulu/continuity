from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1]
exclude={'.git','node_modules','runs','__pycache__'}
generated={'integrations/core-0.2-reference/cases','integrations/document-release-native/build'}
rows=[]
for f in sorted(root.rglob('*')):
 rel=f.relative_to(root)
 if any(x in exclude for x in rel.parts) or any(rel.as_posix()==x or rel.as_posix().startswith(x+'/') for x in generated) or f.name=='.DS_Store' or not f.is_file() or rel.as_posix()=='PACKAGE-FILES.json':continue
 if f.is_symlink():raise SystemExit('Symlinks cannot enter a release')
 b=f.read_bytes();rows.append({'path':rel.as_posix(),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
(root/'PACKAGE-FILES.json').write_text(json.dumps({'schemaVersion':'continuity-evaluation-files/1','files':rows},indent=2)+'\n')
print('Indexed',len(rows),'files')

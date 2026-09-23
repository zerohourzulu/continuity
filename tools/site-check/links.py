"""Check static HTML targets within the published website; never fetch external URLs."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
root=Path(__file__).resolve().parents[2]/'website'
class Links(HTMLParser):
    def __init__(self):super().__init__();self.links=[]
    def handle_starttag(self,tag,attrs):
        self.links.extend(v for k,v in attrs if k in ('href','src') and v)
n=0
for p in root.rglob('*.html'):
    parser=Links();parser.feed(p.read_text())
    for link in parser.links:
        u=urlsplit(link)
        if u.scheme or u.netloc or not u.path:continue
        target=((root/unquote(u.path).lstrip('/')) if u.path.startswith('/') else p.parent/unquote(u.path)).resolve()
        assert target.is_relative_to(root.resolve()),(p,link,'outside website')
        if target.is_dir():target=target/'index.html'
        assert target.is_file(),(p,link,'missing')
        n+=1
print(f'PASS: {n} local HTML targets')

#!/usr/bin/env python3
"""Single-file offline preview embedding all site and post JSON."""
from pathlib import Path
import json
import base64
import re
ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/'dist'

def run():
    all_data={
        'portal':json.loads((DIST/'data/portal.json').read_text(encoding='utf-8')),
        'sites':{},'posts':{}
    }
    for path in sorted((DIST/'data/sites').glob('*.json')):
        all_data['sites'][path.stem]=json.loads(path.read_text(encoding='utf-8'))
    for path in sorted((DIST/'data/posts').glob('*/*.json')):
        all_data['posts'][f'{path.parent.name}:{path.stem}']=json.loads(path.read_text(encoding='utf-8'))
    css=(DIST/'assets/style.css').read_text(encoding='utf-8')
    js=(DIST/'assets/app.js').read_text(encoding='utf-8')
    encoded=json.dumps(all_data,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    template=(DIST/'index.html').read_text(encoding='utf-8')
    favicon=DIST/'assets/favicon.svg'
    if favicon.exists():
        template=template.replace('href="assets/favicon.svg"','href="data:image/svg+xml;base64,'+base64.b64encode(favicon.read_bytes()).decode('ascii')+'"')
    # Inline code is only used in the downloadable offline preview, not the hosted site.
    template=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '', template)
    template=re.sub(r'<link rel="stylesheet" href=".*?">',lambda _: f'<style>{css}</style>',template)
    template=re.sub(r'(data-default="[^"]+")', r'\1 data-preview="true"',template,count=1)
    template=re.sub(r'<script src=".*?" defer></script>',
        lambda _: f'<script type="application/json" id="preview-data">{encoded}</script><script>{js}</script>',template)
    (DIST/'preview.html').write_text(template,encoding='utf-8')
    print('Offline preview:',(DIST/'preview.html').stat().st_size,'bytes')

if __name__=='__main__':run()

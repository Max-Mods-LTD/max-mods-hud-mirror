#!/usr/bin/env python3
"""Render the real GPU dashboard recordings for host layout checks.

These are previews of app commands, not screenshots of the BMW compositor.
"""
import base64
import json
from pathlib import Path
import struct
import subprocess
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/test_dashboard.js','--preview'],cwd=ROOT,check=True)
out=ROOT/'build/ui-preview'
for record in json.loads((out/'recordings.json').read_text()):
    raw=base64.b64decode(record['words'])
    words=struct.unpack('<%dI'%(len(raw)//4),raw)
    floats=struct.unpack('<%df'%(len(raw)//4),raw)
    image=Image.new('RGBA',(round(record['w']),record['h']))
    draw=ImageDraw.Draw(image)
    atlases={a['id']:Image.frombytes('L',(a['w'],a['h']),base64.b64decode(a['alpha'])) for a in record['atlases']}
    pictures={a['id']:Image.frombytes('RGBA',(a['w'],a['h']),base64.b64decode(a['rgba'])) for a in record['images']}
    def color(c):
        return ((c>>24)&255,(c>>16)&255,(c>>8)&255,c&255)
    at=0
    while at<len(words):
        op=words[at]
        at+=1
        if op==2:
            x,y,w,h=floats[at:at+4]
            draw.rectangle((round(x),round(y),round(x+w)-1,round(y+h)-1),fill=color(words[at+4]))
            at+=5
        elif op==11:
            atlas,c,count=words[at:at+3]
            at+=3
            for _ in range(count):
                x,y,w,h,x0,y0,x1,y1=floats[at:at+8]
                at+=8
                glyph=atlases[atlas].crop(tuple(round(v) for v in (x0,y0,x1,y1))).resize((max(1,round(w)),max(1,round(h))))
                image.paste(color(c),(round(x),round(y),round(x)+glyph.width,round(y)+glyph.height),glyph)
        elif op in (18,19):
            x,y,w,h,_=floats[at:at+5]
            ident=words[at+5]
            at+=6
            if ident in pictures:
                image.alpha_composite(pictures[ident].resize((round(w),round(h)),Image.Resampling.LANCZOS),(round(x),round(y)))
            else:
                draw.rectangle((round(x),round(y),round(x+w),round(y+h)),fill='#242a35')
        else:
            raise ValueError('Unknown draw operation '+str(op))
    image.convert('RGB').save(out/(record['name']+'.png'))
dest=ROOT/'docs/images'
dest.mkdir(parents=True,exist_ok=True)
for source,name in [('connection','dashboard'),('display','display'),('updates','updates')]:
    (dest/(name+'.png')).write_bytes((out/(source+'.png')).read_bytes())
print('Updated host dashboard previews')

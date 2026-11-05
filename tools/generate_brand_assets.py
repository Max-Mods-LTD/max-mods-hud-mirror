#!/usr/bin/env python3
"""Pack the official brand artwork and a licensed font for the car UI."""
from pathlib import Path
import base64,json,zlib,shutil
from PIL import Image,ImageFont,ImageDraw
root=Path(__file__).resolve().parents[1]
out=root/'car/assets';out.mkdir(parents=True,exist_ok=True)
def data(raw):return base64.b64encode(zlib.compress(raw,9)).decode()
im=Image.open(root/'assets/max-mods-logo.png').convert('RGBA');im.thumbnail((320,55),Image.Resampling.LANCZOS)
fonts={}
for size in (16,20,24,32,40):
 f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',size)
 glyphs={}
 for n in range(32,127):
  ch=chr(n);box=f.getbbox(ch);w=max(1,box[2]);h=size+10
  glyph=Image.new('L',(w,h));ImageDraw.Draw(glyph).text((0,0),ch,font=f,fill=255)
  glyphs[ch]={'w':w,'h':h,'advance':round(f.getlength(ch),2),'data':data(glyph.tobytes())}
 fonts[str(size)]=glyphs
(out/'brand.json').write_text(json.dumps({'logo':{'w':im.width,'h':im.height,'data':data(im.tobytes())},'fonts':fonts},separators=(',',':'))+'\n')
phone=root/'android/app/src/main/assets';phone.mkdir(parents=True,exist_ok=True)
shutil.copy(root/'assets/max-mods-logo.png',phone/'max-mods-logo.png')
license=root/'assets/DejaVu-LICENSE.txt'
license.write_text('\n'.join(line.rstrip() for line in Path('/usr/share/doc/fonts-dejavu-core/copyright').read_text().splitlines())+'\n')
print('Generated brand assets')

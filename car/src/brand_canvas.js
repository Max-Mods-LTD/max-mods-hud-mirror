// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const brand=JSON.parse(fs.readFileSync(path.join(__dirname,'..','assets','brand.json'),'utf8'));
const cache=new Map();
function unpack(item){if(!cache.has(item))cache.set(item,zlib.inflateSync(Buffer.from(item.data,'base64')));return cache.get(item);}
function color(hex){let h=hex.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
class BrandCanvas {
 constructor(){this.w=1024;this.h=480;this.data=Buffer.alloc(this.w*this.h*4);}
 rect(x,y,w,h,c){const a=color(c);x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);
  for(let yy=Math.max(0,y);yy<Math.min(this.h,y+h);yy++)for(let xx=Math.max(0,x);xx<Math.min(this.w,x+w);xx++){
   const p=(yy*this.w+xx)*4;this.data[p]=a[0];this.data[p+1]=a[1];this.data[p+2]=a[2];this.data[p+3]=255;
  }return this;
 }
 blend(x,y,r,g,b,a){if(x<0||y<0||x>=this.w||y>=this.h)return;const p=(y*this.w+x)*4,q=255-a;
  this.data[p]=(r*a+this.data[p]*q+127)/255;this.data[p+1]=(g*a+this.data[p+1]*q+127)/255;this.data[p+2]=(b*a+this.data[p+2]*q+127)/255;this.data[p+3]=255;
 }
 text(value,x,y,size,c,maxWidth){const glyphs=brand.fonts[String(size)],rgb=color(c||'#ffffff');let xx=x;
  for(const ch of String(value).replace(/[^\x20-\x7e]/g,' ')){
   const g=glyphs[ch];if(maxWidth&&xx+g.advance>x+maxWidth)break;const d=unpack(g),left=Math.round(xx);
   for(let yy=0;yy<g.h;yy++)for(let dx=0;dx<g.w;dx++){const a=d[yy*g.w+dx];if(a)this.blend(left+dx,y+yy,rgb[0],rgb[1],rgb[2],a);}
   xx+=g.advance;
  }return this;
 }
 logo(x,y){const l=brand.logo,d=unpack(l);for(let yy=0;yy<l.h;yy++)for(let xx=0;xx<l.w;xx++){const p=(yy*l.w+xx)*4;this.blend(x+xx,y+yy,d[p],d[p+1],d[p+2],d[p+3]);}return this;}
}
module.exports={BrandCanvas};

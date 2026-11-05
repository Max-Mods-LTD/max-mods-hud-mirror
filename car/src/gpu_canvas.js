// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// mgu-render native draw operations. Font/logo uploads happen once, never a
// full-screen software bitmap for a button or a status-label change.
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const brand=JSON.parse(fs.readFileSync(path.join(__dirname,'..','assets','brand.json'),'utf8'));
const atlasMap=new Map(),fontMap=new Map(),imageById=new Map();
function pack(hex){return (parseInt(hex.replace('#',''),16)*256+255)>>>0;}
function font(size){
 if(fontMap.has(size))return fontMap.get(size);
 const src=brand.fonts[String(size)]||brand.fonts['32'],side=1024,rows=[];let x=0,y=0,rowH=0;
 const alpha=Buffer.alloc(side*512),glyphs={};
 Object.keys(src).forEach(ch=>{const g=src[ch];if(x+g.w>side){x=0;y+=rowH+2;rowH=0;}const data=zlib.inflateSync(Buffer.from(g.data,'base64'));
  for(let r=0;r<g.h;r++)data.copy(alpha,(y+r)*side+x,r*g.w,(r+1)*g.w);
  glyphs[ch]={x,y,w:g.w,h:g.h,advance:g.advance};x+=g.w+2;rowH=Math.max(rowH,g.h);
 });
 const id=0x4d4d0000+size,atlas={atlasW:side,atlasH:y+rowH,alpha:alpha.slice(0,side*(y+rowH))};atlasMap.set(id,atlas);const f={id,glyphs};fontMap.set(size,f);return f;
}
const logo={imageId:200,w:brand.logo.w,h:brand.logo.h,data:zlib.inflateSync(Buffer.from(brand.logo.data,'base64'))};imageById.set(200,logo);
class GpuCanvas{
 constructor(w,h){this.w=w||1280;this.h=h||480;this.buffer=new ArrayBuffer(256*1024);this.u=new Uint32Array(this.buffer);this.f=new Float32Array(this.buffer);this.n=0;this.atlases=new Set();this.images=new Set();}
 rect(x,y,w,h,c){let i=this.n;this.u[i++]=2;this.f[i++]=x;this.f[i++]=y;this.f[i++]=w;this.f[i++]=h;this.u[i++]=pack(c);this.n=i;return this;}
 text(value,x,y,size,c,maxWidth){const f=font(size),glyphs=[];let pen=x;
  for(const ch of String(value).replace(/[^\x20-\x7e]/g,' ')){const g=f.glyphs[ch]||f.glyphs['?'];if(maxWidth&&pen+g.advance>x+maxWidth)break;glyphs.push({g,pen});pen+=g.advance;}
  if(!glyphs.length)return this;this.atlases.add(f.id);let i=this.n;this.u[i++]=11;this.u[i++]=f.id;this.u[i++]=pack(c||'#ffffff');this.u[i++]=glyphs.length;
  glyphs.forEach(v=>{const g=v.g;this.f[i++]=v.pen;this.f[i++]=y;this.f[i++]=g.w;this.f[i++]=g.h;this.f[i++]=g.x;this.f[i++]=g.y;this.f[i++]=g.x+g.w;this.f[i++]=g.y+g.h;});this.n=i;return this;
 }
 lines(value,x,y,size,c,width,maxLines){
  const f=font(size),measure=s=>Array.from(s).reduce((n,ch)=>n+(f.glyphs[ch]||f.glyphs['?']).advance,0),lines=[];let line='';
  String(value).split(/\s+/).forEach(word=>{const next=line?line+' '+word:word;if(line&&measure(next)>width){lines.push(line);line=word;}else line=next;});if(line)lines.push(line);
  lines.slice(0,maxLines||3).forEach((s,i)=>this.text(s,x,y+i*(size+9),size,c,width));return this;
 }
 image(id,x,y,w,h){this.images.add(id);let i=this.n;this.u[i++]=18;this.f[i++]=x;this.f[i++]=y;this.f[i++]=w;this.f[i++]=h;this.f[i++]=0;this.u[i++]=id;this.n=i;return this;}
 logo(x,y,w,h){return this.image(200,x,y,w||210,h||90);}
 video(id,x,y,w,h){let i=this.n;this.u[i++]=19;this.f[i++]=x;this.f[i++]=y;this.f[i++]=w;this.f[i++]=h;this.f[i++]=0;this.u[i++]=id;this.n=i;return this;}
 words(){return this.u.subarray(0,this.n);}
}
module.exports={GpuCanvas,kit:{atlasById:id=>atlasMap.get(id),imageById,pack},pack};

// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const EventEmitter=require('events'),fs=require('fs'),crypto=require('crypto');
class IdriveRenderer extends EventEmitter{
 constructor(host,options){super();this.host=host;this.gpu=host.gpu;this.options=options||{};this.closed=false;this.ref=1;this.id=201;this.visible=false;}
 connect(){
  try{if(this.host.setLayout)this.host.setLayout(this.options.layout||'compact');}catch(e){this.emit('refused','video',0,e.message);return;}
  const start=()=>{if(this.closed)return;this.gpu=this.host.gpu;if(!this.host.info||!this.host.info.video){this.emit('refused','video',0,'Update/start the iDrive GPU renderer first');return;}
   this.backend='id7';this.targets='idrive:'+Math.round(this.host.width)+'x'+this.host.height;
   this.lost=()=>{if(!this.closed)this.emit('disconnected');};if(this.host.on)this.host.on('disconnected',this.lost);this.emit('ready');};
  if(this.host.ensureReady)this.host.ensureReady().then(start,e=>{if(!this.closed)this.emit('refused','video',0,e.message);});else start();
 }
 setLayout(layout){const size=this.host.setLayout?this.host.setLayout(layout):{width:this.host.width,height:this.host.height};this.options.layout=layout;return size;}
 image(opts){this.rect={x:opts.x,y:opts.y,w:opts.w,h:opts.h};this.kind='image';this.w=opts.iw;this.h=opts.ih;this.gpu.pixmap(this.id,this.w,this.h,'rgba','linear');return this.ref;}
 video(opts){
  this.rect=this.host.viewport?this.host.viewport():{x:opts.x,y:opts.y,w:opts.w,h:opts.h};this.kind='video';this.inputW=opts.vw;this.inputH=opts.vh;this.inputBytes=this.inputW*this.inputH*3/2;
  this.openFile(this.inputW,this.inputH);return this.ref;
 }
 openFile(w,h){
  const oldFile=this.file,oldFd=this.fd,bytes=w*h*3/2,file=(this.options.directory||'/dev/shm')+'/mgu-video-maxmods-'+crypto.randomBytes(6).toString('hex');let fd;
  const header=Buffer.alloc(64);[0x4656474d,1,w,h,0,0,3,0,1].forEach((v,i)=>header.writeUInt32LE(v,i*4));
  try{fd=fs.openSync(file,'wx',0o600);fs.ftruncateSync(fd,64+bytes*3);fs.writeSync(fd,header,0,64,0);}catch(e){if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(file);}catch(_){}throw e;}
  this.w=w;this.h=h;this.bytes=bytes;this.slot=0;this.sequence=0;this.file=file;this.fd=fd;this.header=header;this.frameBuffer=Buffer.alloc(bytes);this.bindPending=true;
  if(oldFd!==undefined)fs.closeSync(oldFd);if(oldFile)try{fs.unlinkSync(oldFile);}catch(_){}
 }
 pixels(ref,rect,pixels){if(!this.closed)this.gpu.pixels(this.id,[{x:0,y:0,w:this.w,h:this.h}],pixels);}
 frame(ref,atlas,id,content){
  if(this.closed||this.fd===undefined||atlas.length!==this.inputBytes)return false;
  const c=content||{x:0,y:0,w:this.inputW,h:this.inputH};
  if(['x','y','w','h'].some(k=>!Number.isInteger(c[k])||c[k]<0||c[k]%2)||c.w<2||c.h<2||c.x+c.w>this.inputW||c.y+c.h>this.inputH)return false;
  if(c.w!==this.w||c.h!==this.h)this.openFile(c.w,c.h);
  const srcY=this.inputW*this.inputH,outY=this.w*this.h,half=this.w/2;
  for(let y=0;y<this.h;y++){const at=(c.y+y)*this.inputW+c.x;atlas.copy(this.frameBuffer,y*this.w,at,at+this.w);}
  for(let y=0;y<this.h/2;y++){
   const at=srcY+(c.y/2+y)*this.inputW+c.x/2;
   atlas.copy(this.frameBuffer,outY+y*half,at,at+half);
   atlas.copy(this.frameBuffer,outY+outY/4+y*half,at+this.inputW/2,at+this.inputW/2+half);
  }
  const slot=(this.slot+1)%3;fs.writeSync(this.fd,this.frameBuffer,0,this.bytes,64+slot*this.bytes);this.header.writeUInt32LE(slot,20);fs.writeSync(this.fd,this.header,20,4,20);this.header.writeUInt32LE(++this.sequence>>>0,16);fs.writeSync(this.fd,this.header,16,4,16);this.slot=slot;
  // Bind a complete first frame. On rotation only the frame's declared
  // encoder padding is removed; old/stale bounds are never reused.
  if(this.bindPending){this.gpu.video(this.id,this.file);this.bindPending=false;}return true;
 }
 set(ref,opts){if(this.closed)return;let changed=false;const rect=this.kind==='video'&&this.host.viewport?this.host.viewport():opts;
  ['x','y','w','h'].forEach(k=>{if(rect[k]!==undefined&&this.rect[k]!==rect[k]){this.rect[k]=rect[k];changed=true;}});
  if(opts.visible!==undefined&&opts.visible!==this.visible){this.visible=opts.visible;changed=true;}
  if(changed)this.host.setSurface(this.visible?{kind:this.kind,id:this.id,rect:Object.assign({},this.rect),visible:true}:null);if(changed&&this.visible)this.emit('target','idrive','shown','','');
 }
 close(){if(this.closed)return;this.closed=true;if(this.lost&&this.host.removeListener)this.host.removeListener('disconnected',this.lost);this.host.setSurface(null);if(this.kind==='video')this.gpu.video(this.id,null);if(this.fd!==undefined){fs.closeSync(this.fd);this.fd=undefined;}if(this.file)try{fs.unlinkSync(this.file);}catch(_){}if(this.host.release)this.host.release();}
}
module.exports={IdriveRenderer};

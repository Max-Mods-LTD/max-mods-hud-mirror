// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const EventEmitter=require('events'),fs=require('fs'),crypto=require('crypto');
class IdriveRenderer extends EventEmitter{
 constructor(dashboard,options){super();this.dashboard=dashboard;this.gpu=dashboard.gpu;this.options=options||{};this.closed=false;this.ref=1;this.id=201;this.visible=false;}
 connect(){if(!this.dashboard.info||!this.dashboard.info.video){this.emit('refused','video',0,'Update/start the iDrive GPU renderer first');return;}this.backend='id7';this.targets='idrive:'+Math.round(this.dashboard.width)+'x'+this.dashboard.height;this.emit('ready');}
 image(opts){this.rect={x:opts.x,y:opts.y,w:opts.w,h:opts.h};this.kind='image';this.w=opts.iw;this.h=opts.ih;this.gpu.pixmap(this.id,this.w,this.h,'rgba','linear');return this.ref;}
 video(opts){this.rect={x:opts.x,y:opts.y,w:opts.w,h:opts.h};this.kind='video';this.w=opts.vw;this.h=opts.vh;this.bytes=this.w*this.h*3/2;this.slot=0;this.sequence=0;
  this.file=(this.options.directory||'/dev/shm')+'/mgu-video-maxmods-'+crypto.randomBytes(6).toString('hex');this.fd=fs.openSync(this.file,'wx',0o600);fs.ftruncateSync(this.fd,64+this.bytes*3);
  this.header=Buffer.alloc(64);[0x4656474d,1,this.w,this.h,0,0,3,0,1].forEach((v,i)=>this.header.writeUInt32LE(v,i*4));fs.writeSync(this.fd,this.header,0,64,0);this.frameBuffer=Buffer.alloc(this.bytes);this.gpu.video(this.id,this.file);return this.ref;
 }
 pixels(ref,rect,pixels){if(!this.closed)this.gpu.pixels(this.id,[{x:0,y:0,w:this.w,h:this.h}],pixels);}
 frame(ref,atlas,id){if(this.closed||this.fd===undefined||atlas.length!==this.bytes)return false;
  const ysize=this.w*this.h,half=this.w/2;atlas.copy(this.frameBuffer,0,0,ysize);
  for(let r=0;r<this.h/2;r++){const row=ysize+r*this.w;atlas.copy(this.frameBuffer,ysize+r*half,row,row+half);atlas.copy(this.frameBuffer,ysize+ysize/4+r*half,row+half,row+this.w);}
  const slot=(this.slot+1)%3;fs.writeSync(this.fd,this.frameBuffer,0,this.bytes,64+slot*this.bytes);this.header.writeUInt32LE(slot,20);fs.writeSync(this.fd,this.header,20,4,20);this.header.writeUInt32LE(++this.sequence>>>0,16);fs.writeSync(this.fd,this.header,16,4,16);this.slot=slot;return true;
 }
 set(ref,opts){if(this.closed)return;let changed=false;['x','y','w','h'].forEach(k=>{if(opts[k]!==undefined&&this.rect[k]!==opts[k]){this.rect[k]=opts[k];changed=true;}});
  if(opts.visible!==undefined&&opts.visible!==this.visible){this.visible=opts.visible;changed=true;}
  if(changed)this.dashboard.setSurface(this.visible?{kind:this.kind,id:this.id,rect:Object.assign({},this.rect),visible:true}:null);if(changed&&this.visible)this.emit('target','idrive','shown','','');}
 close(){if(this.closed)return;this.closed=true;this.dashboard.setSurface(null);if(this.kind==='video')this.gpu.video(this.id,null);if(this.fd!==undefined){fs.closeSync(this.fd);this.fd=undefined;}if(this.file)try{fs.unlinkSync(this.file);}catch(_){} }
}
module.exports={IdriveRenderer};

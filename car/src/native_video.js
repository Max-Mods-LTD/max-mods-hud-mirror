// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Video-only embed or foreground-protected full-screen layer. Menus, fonts, focus, selection and Back belong to BMW RHMI.
const EventEmitter=require('events');
const {RenderClient,videoOp,imageOp}=require('./mgu_render_client.js');
class NativeVideo extends EventEmitter{
 constructor(back,changed,log){super();this.back=back;this.changed=changed;this.log=log;this.layout='compact';this.width=1440;this.height=480;this.visible=false;this.surface=null;this.gpu=null;this.info=null;}
 ensureReady(){
  if(this.info&&this.gpu)return Promise.resolve();if(this.preparing)return this.preparing;
  if(!RenderClient.available())return Promise.reject(new Error('Update/start the iDrive GPU renderer first'));
  const gpu=this.gpu=new RenderClient('maxmods_hud_mirror',this.log,{mode:this.layout==='full'?'layer':'embed'});
  this.preparing=new Promise((resolve,reject)=>{
   const finish=(error)=>{clearTimeout(this.deadline);this.deadline=null;this.finishReady=null;if(error)reject(error);else resolve();};this.finishReady=finish;
   this.deadline=setTimeout(()=>finish(new Error('iDrive video renderer timed out')),3000);
   gpu.on('ready',(screen,info)=>{
    if(this.gpu!==gpu)return;if(!info||!info.video||info.modes.indexOf(this.layout==='full'?'layer':'embed')<0){if(this.finishReady)this.finishReady(new Error('iDrive GPU video is unavailable'));return;}
    this.info=info;this.screen=screen;
    try{this.applyLayout(this.layout);}catch(e){this.info=null;if(this.finishReady)this.finishReady(e);return;}
    gpu.fps(60);gpu.grab(false);
    if(this.finishReady)this.finishReady();this.show(this.visible);
   });
   gpu.on('touch',phase=>{if(phase==='up'&&this.visible)this.back();});
   const lost=()=>{if(this.gpu!==gpu)return;const active=!!this.info;this.info=null;if(this.finishReady)this.finishReady(new Error('iDrive video renderer disconnected'));if(active)this.emit('disconnected');};
   gpu.on('close',lost);gpu.on('closed',lost);gpu.on('renderer-error',lost);gpu.connect();
  });
  // Keep a settled promise only while this connection owns its video resources.
  return this.preparing;
 }
 applyLayout(layout){
  const full=layout==='full',info=this.info;if(!info){this.layout=layout;return;}
  if(full&&(info.modes.indexOf('layer')<0||!info.frontGate))throw new Error('True full screen needs the renderer foreground-protected layer mode');
  const box=full?{x:0,y:0,w:this.screen.w,h:this.screen.h}:info.embedBox;
  if(!box||box.w<=0||box.h<=0)throw new Error('iDrive video area unavailable');
  const scale=box.h/480;this.layout=layout;this.height=480;this.width=box.w/scale;
  this.gpu.mode(full?'layer':'embed');this.gpu.place({x:box.x,y:box.y,w:box.w,h:box.h,scale,ox:0,oy:0});
 }
 setLayout(layout){this.applyLayout(layout);if(this.gpu)this.gpu.claim(this.visible?[{x:0,y:0,w:this.width,h:this.height}]:[]);return {width:Math.round(this.width),height:this.height};}
 viewport(){return this.layout==='full'?{x:0,y:0,w:this.width,h:this.height}:{x:this.width*.05,y:this.height*.02,w:this.width*.9,h:this.height*.7};}

 show(on){this.visible=!!on;if(!this.gpu)return;this.gpu.grab(false);this.gpu.claim(this.visible?[{x:0,y:0,w:this.width,h:this.height}]:[]);this.gpu.show(this.visible);clearInterval(this.timer);if(this.visible){this.sendFrame();this.timer=setInterval(()=>this.sendFrame(),750);}}
 setSurface(surface){this.surface=surface;this.sendFrame();if(this.changed)this.changed();}
 sendFrame(){
  if(!this.visible||!this.info||!this.gpu)return;const s=this.surface,words=new Uint32Array(s?13:6),f=new Float32Array(words.buffer);
  words[0]=2;f[3]=this.width;f[4]=this.height;words[5]=0x000000ff;
  if(s){const r=s.rect||{x:0,y:0,w:this.width,h:this.height};words.set((s.kind==='video'?videoOp:imageOp)(s.id,r.x,r.y,r.w,r.h),6);}
  this.gpu.frameWords(words);
 }
 release(){
  clearInterval(this.timer);clearTimeout(this.deadline);const gpu=this.gpu;this.gpu=null;this.info=null;this.preparing=null;this.surface=null;
  if(this.finishReady){const finish=this.finishReady;this.finishReady=null;finish(new Error('iDrive video closed'));}
  if(gpu){gpu.grab(false);gpu.show(false);gpu.close();}
 }
 close(){this.visible=false;this.release();}
}
module.exports={NativeVideo};

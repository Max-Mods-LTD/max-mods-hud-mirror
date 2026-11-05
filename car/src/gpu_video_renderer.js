// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const EventEmitter=require('events'),net=require('net'),fs=require('fs');
class GpuVideoRenderer extends EventEmitter{
 constructor(target,layout,pairing){super();this.target=target;this.layout=layout;this.pairing=pairing;this.closed=false;this.visible=false;this.h264=true;this.targetWidth=target==='hud'?800:1088;this.lastCapture=0;}
 static available(){try{return fs.statSync('/run/maxmods-video/control.sock').isSocket()&&fs.existsSync('/var/opt/waze-on-cluster/current/waze-on-cluster');}catch(_){return false;}}
 connect(){this.backend='id7';this.targets=this.target+':'+this.targetWidth+'x480';this.open();}
 video(opts){this.options=opts;return 1;}
 frame(ref,payload,id){
  if(this.closed||!this.writer)return false;
  const pending=this.writer.writableLength===undefined?(this.writer.bufferSize||this.writer._writableState&&this.writer._writableState.length||0):this.writer.writableLength;
  if(pending>512*1024){this.emit('refused','frame',1,'GPU writer is behind the phone; switching to JPEG');return false;}
  if(!this.firstFrameAt)this.firstFrameAt=Date.now();this.writer.write(payload);return true;
 }
 open(){
  if(this.opening||this.closed)return;this.opening=true;let text='';this.socket=net.connect('/run/maxmods-video/control.sock');
  this.deadline=setTimeout(()=>{if(!this.closed)this.emit('refused','video',1,'GPU helper timed out; switching to JPEG');},3500);
  this.socket.on('error',e=>{if(!this.closed)this.emit('refused','video',1,e.code||e.message);});
  this.socket.on('connect',()=>this.socket.write(JSON.stringify({op:'open',target:this.target,layout:this.layout,width:this.pairing.width,height:this.pairing.height,fps:this.pairing.fps})+'\n'));
  this.socket.on('data',b=>{
   text+=b.toString('utf8');if(text.length>16384){if(!this.closed)this.emit('refused','video',1,'Invalid GPU helper reply');return;}
   let at;while((at=text.indexOf('\n'))>=0){const line=text.slice(0,at);text=text.slice(at+1);let r;
    try{r=JSON.parse(line);}catch(_){if(!this.closed)this.emit('refused','video',1,'Invalid GPU helper reply');return;}
    if(r.closed){if(this.release)this.release();else if(!this.closed)this.emit('disconnected');continue;}
    if(this.closed)continue;
    if(r.status){const s=r.status;if(s.state==='error'||s.target!==this.target){this.emit('refused','video',1,s.reason||'GPU decoder selected the wrong display');return;}
     this.showing=s.state==='showing';if(this.showing)this.unshownAt=0;else if(!this.unshownAt)this.unshownAt=Date.now();this.emit('target',this.target,this.showing?'shown':s.state,'',s.reason||'');continue;}
    if(!r.ok){this.emit('refused','video',1,r.error||'GPU decoder unavailable');return;}
    if(this.inputFile||!/^\/run\/maxmods-video\/session-[A-Za-z0-9]+\/input\.h264$/.test(r.fifo||'')){this.emit('refused','video',1,'Invalid GPU FIFO');return;}
    this.inputFile=r.fifo;this.readyAt=Date.now();this.openWriter(r.fifo);
   }
  });
  this.socket.on('close',()=>{if(this.closed){if(this.release)this.release();}else this.emit('disconnected');});
 }
 openWriter(file){
  if(this.closed)return;let fd;
  try{
   // Blocking open(O_WRONLY) can strand a libuv worker when a decoder dies
   // before opening its reader. A nonblocking pipe stream keeps startup and
   // backpressure cancellable, including on the car's Node 8 runtime.
   fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_NONBLOCK|(fs.constants.O_NOFOLLOW||0));
   if(!fs.fstatSync(fd).isFIFO())throw new Error('GPU input is not a FIFO');
   this.writer=new net.Socket({fd,readable:false,writable:true});fd=undefined;
   this.writer.on('error',e=>{if(!this.closed)this.emit('refused','frame',1,e.message);});
   clearTimeout(this.deadline);this.readyAt=Date.now();
   this.timer=setInterval(()=>{
    const now=Date.now();
    if(this.firstFrameAt&&!this.showing&&now-(this.unshownAt||this.firstFrameAt)>5000){this.emit('refused','video',1,'No GPU picture; switching to JPEG');return;}
    if(this.lastCapture&&now-this.lastCapture<800&&this.socket)this.socket.write('{"op":"alive"}\n');
    else if(now-this.readyAt>1400)this.emit('refused','video',1,'Phone capture paused; switching to JPEG');
   },250);this.emit('ready');
  }catch(e){
   if(fd!==undefined)try{fs.closeSync(fd);}catch(_){}
   if(e.code==='ENXIO'&&Date.now()-this.readyAt<1800)this.fifoRetry=setTimeout(()=>this.openWriter(file),40);
   else if(!this.closed)this.emit('refused','video',1,'GPU input unavailable: '+e.message);
  }
 }
 captureAlive(){this.lastCapture=Date.now();}
 set(ref,opts){
  if(opts.visible===false){this.visible=false;if(!this.closed&&this.presented)this.emit('refused','video',1,'Phone capture paused; switching to JPEG');}
  else if(opts.visible===true){this.visible=true;this.presented=true;}
 }
 close(){
  if(this.closed)return this.released;this.closed=true;clearInterval(this.timer);clearTimeout(this.deadline);clearTimeout(this.fifoRetry);if(this.writer)this.writer.destroy();
  this.released=new Promise(resolve=>{
   let timer,done=false;this.release=()=>{if(done)return;done=true;clearTimeout(timer);if(this.socket)this.socket.destroy();resolve();};
   if(!this.socket){this.release();return;}
   if(this.socket.destroyed){timer=setTimeout(this.release,350);return;}
   timer=setTimeout(this.release,1200);this.socket.write('{"op":"close"}\n');
  });return this.released;
 }
}
module.exports={GpuVideoRenderer};

// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {RenderClient}=require('./mgu_render_client.js');
const {GpuCanvas,kit}=require('./gpu_canvas.js');
const qr=require('./qrcode.js'),release=require('./release_notes.js');
const C={bg:'#0c0d10',panel:'#1b1d23',muted:'#b5bac5',line:'#353943',red:'#c8121b',green:'#55c38e'};
class Dashboard{
 constructor(app,log){
  this.app=app;this.tab=0;this.focus=0;this.visible=false;this.items=[];this.lastCcu=null;this.front=null;this.proxyDriven=false;this.lastKey='';this.width=1440;this.height=480;this.surface=null;this.controls=false;this.lastSent=0;
  this.gpu=new RenderClient('maxmods_hud_mirror',log,{mode:'embed',kit});
  this.gpu.on('ready',(screen,info)=>{
   if(!info||info.modes.indexOf('embed')<0)return;this.info=info;const b=info.embedBox,scale=b.h/this.height;this.width=b.w/scale;
   this.gpu.mode('embed');this.gpu.place({x:b.x,y:b.y,w:b.w,h:b.h,scale,ox:0,oy:0});this.gpu.fps(60);this.lastKey='';this.show(this.visible);this.render(true);
  });
  this.gpu.on('touch',(phase,x,y)=>{if(!this.visible||phase!=='up')return;if(this.surface&&!this.controls){this.controls=true;this.render(true);return;}
   const i=this.items.findIndex(b=>x>=b.x&&y>=b.y&&x<b.x+b.w&&y<b.y+b.h);if(i>=0){this.focus=i;this.activate();}});
  this.gpu.on('ccu',e=>{if(!this.visible)return;const old=this.lastCcu;this.lastCcu=e;if(old)this.dial(old.knob,e.knob,(e.press===1||e.press===2)&&e.press!==old.press&&e.seq!==old.seq);});
  this.timer=setInterval(()=>{if(this.visible&&Date.now()-this.lastSent>1000)this.sendFrame();},500);
 }
 connect(){this.gpu.connect();}
 show(on){this.visible=!!on;this.gpu.show(this.visible);this.gpu.grab(this.visible&&!!(this.info&&this.info.controller));if(!on){this.lastCcu=null;this.front=null;}else this.render(true);}
 frontCcu(s){
  const old=this.front,op=s&&s.frontRotaryEncoderOperation,push=s&&s.frontRotaryEncoderPushButton,seq=s&&s.frontSequenceNumberOperatingElement;
  const pressed=['DREHGEBER_KURZ_GEDRUECKT','DREHGEBER_LANG_GEDRUECKT',1,2].indexOf(push)>=0;
  this.front={knob:typeof op==='number'&&op!==65535?op:old?old.knob:65535,pressed,seq};
  if(old&&this.visible&&!(this.info&&this.info.controller)&&!this.proxyDriven)this.dial(old.knob,this.front.knob,pressed&&(!old.pressed||seq!==old.seq));
 }
 dial(from,to,pushed){if(!this.visible)return;const d=((to-from+0x18000)%0x10000)-0x8000;
  if(this.surface&&!this.controls&&(pushed||d&&Math.abs(d)<=12)){this.controls=true;this.render(true);return;}
  if(to!==65535&&from!==65535&&Math.abs(d)<=12&&d){this.focus=Math.max(0,Math.min(this.items.length-1,this.focus+d));this.render(true);}if(pushed)this.activate();
 }
 proxyFocus(index,on){if(on&&this.visible){this.focus=index;this.render(true);}}
 proxyPress(index){this.proxyDriven=true;this.focus=index;this.activate();}
 activate(){if(this.surface&&!this.controls){this.controls=true;this.render(true);return;}const item=this.items[this.focus];if(item)this.app.press('action-'+item.id,()=>item.fn());this.render(true);}
 setSurface(surface){if(!surface||!this.surface||surface.id!==this.surface.id)this.controls=false;this.surface=surface;this.render(true);}
 button(c,id,label,x,y,w,fn,selected){const index=this.items.length,focus=index===this.focus;this.items.push({id,label,x,y,w,h:62,fn});
  c.rect(x,y,w,62,focus?'#ffffff':selected?C.red:C.panel).text(label,x+18,y+10,28,focus?'#101115':'#ffffff',w-32);
 }
 frame(){
  const a=this.app,m=a.mirror,w=this.width,h=this.height,c=new GpuCanvas(w,h);this.items=[];c.rect(0,0,w,h,C.bg);
  if(this.surface&&this.surface.visible){const s=this.surface,b=s.rect||{x:0,y:0,w,h};if(s.kind==='video')c.video(s.id,b.x,b.y,b.w,b.h);else c.image(s.id,b.x,b.y,b.w,b.h);
   if(this.controls){const y=h-78;c.rect(0,y,w,78,C.bg);this.button(c,'stop','Stop mirroring',24,y+8,310,()=>a.stopMirror(),true);this.button(c,'hidecontrols','Hide controls',352,y+8,280,()=>{this.controls=false;this.render(true);});this.button(c,'force','Force close',w-285,y+8,260,()=>a.forceClose());}return c;
  }
  const nav=250,x=282,right=w-30,body=right-x;
  c.rect(0,0,nav,h,'#14151a').rect(nav,0,1,h,C.line).logo(16,17,218,94);
  c.text('iDrive Apps',23,118,26,C.muted).text('v'+release.version,23,h-42,22,C.muted);
  ['Connection','Display','Updates'].forEach((t,i)=>this.button(c,'tab'+i,t,14,172+i*76,222,()=>{this.tab=i;this.focus=i;},this.tab===i));
  c.text('HUD Mirror',x,18,40,'#ffffff');const blocked=a.guard.reason();c.text(blocked?'Park required':'Park confirmed',right-270,28,24,blocked?'#f0b57c':C.green,270);
  this.button(c,'force','Force close',right-238,h-70,238,()=>a.forceClose());
  if(this.tab===0){
   if(a.qr.url){
    c.text('Scan to connect',x,94,36,'#ffffff');const code=qr(0,'M');code.addData(a.qr.url);code.make();const count=code.getModuleCount(),cell=Math.max(2,Math.floor(274/(count+8))),side=(count+8)*cell;
    c.rect(x,164,side,side,'#ffffff');for(let r=0;r<count;r++)for(let col=0;col<count;col++)if(code.isDark(r,col))c.rect(x+(col+4)*cell,164+(r+4)*cell,cell,cell,'#000000');
    const tx=x+side+34,tw=right-tx;c.text('1. Start sharing on the phone',tx,168,28,'#ffffff',tw).text('2. Tap Scan car QR',tx,214,28,'#ffffff',tw).text('Mirroring starts after pairing.',tx,270,24,C.green,tw);
    const bw=(tw-16)/2;this.button(c,'cancelqr','Cancel',tx,332,bw,()=>a.qr.close());this.button(c,'manual','Pair manually',tx+bw+16,332,bw,()=>a.pairPhone());
   }else{
    c.text(m.starting?'Connecting to your phone...':m.running?'Mirroring is active':'Connect once. Start in one place.',x,95,36,'#ffffff',body);
    c.lines(m.status,x,145,24,C.muted,body,2);c.rect(x,217,body,84,C.panel).rect(x,217,5,84,C.red);
    c.text(m.pairing?'PHONE PAIRED':'PHONE NOT PAIRED',x+23,224,22,C.muted).text(m.pairing?'Start on the phone to mirror automatically':'Pair with QR or enter the phone code',x+23,254,28,'#ffffff',body-46);
    const gap=16,bw=(body-2*gap)/3;this.button(c,'start',m.starting?'Cancel start':m.running?'Stop mirror':'Start mirror',x,327,bw,()=>m.running||m.starting?a.stopMirror():a.startMirror(false),true);
    this.button(c,'qr','Pair with QR',x+bw+gap,327,bw,()=>a.pairQr());this.button(c,'manual','Pair manually',x+2*(bw+gap),327,bw,()=>a.pairPhone());
    c.text('Sound uses your existing BMW Bluetooth / Android Auto route.',x,410,24,C.muted,body-260);
   }
  }else if(this.tab===1){
   c.text('Display destination',x,95,36,'#ffffff');c.rect(x,156,body,104,C.panel).text('ONE SCREEN AT A TIME',x+22,168,22,C.muted);
   this.button(c,'picker',(m.target==='map'?'Instrument cluster':m.target==='idrive'?'iDrive screen':'Head-up display')+'  >',x+16,198,body-32,()=>a.chooseDisplay());
   this.button(c,'layout',(m.layout==='compact'?'Picture: Compact':'Picture: Full screen')+'  >',x,282,body,()=>a.chooseLayout());
   this.button(c,'settings','Video and background options  >',x,357,body-260,()=>a.chooseSettings());
   this.button(c,'test','Test display',right-260,92,260,()=>a.startMirror(true));
  }else{
   c.text("What's new in "+release.version,x,95,36,'#ffffff');const lines=release.lines[a._releaseIndex];
   c.rect(x,166,body,164,C.panel).text('CHANGE '+(a._releaseIndex+1)+' OF '+release.lines.length,x+22,178,22,C.red);
   c.lines(lines.join(' '),x+22,210,28,'#ffffff',body-44,3);
   this.button(c,'previous','Previous',x,335,250,()=>a.releaseNote(-1));this.button(c,'next','Next change',x+270,335,275,()=>a.releaseNote(1),true);
  }
  return c;
 }
 render(force){if(!this.visible||!this.info)return;const a=this.app,key=JSON.stringify([this.tab,this.focus,a.mirror.status,a.mirror.running,a.mirror.starting,!!a.mirror.pairing,a.mirror.layout,a.mirror.target,a.background,a.guard.reason(),a.qr.url,a._releaseIndex,this.surface&&this.surface.visible,this.controls]);
  if(!force&&key===this.lastKey)return;this.lastKey=key;this.recording=this.frame();this.gpu.claim(this.surface&&!this.controls?[{x:0,y:0,w:this.width,h:this.height}]:this.items.map(b=>({x:b.x,y:b.y,w:b.w,h:b.h})));
  if(a.syncFocusProxies)a.syncFocusProxies(this.items,this.surface&&!this.controls);this.sendFrame();
 }
 sendFrame(){if(this.info&&this.visible&&this.recording){this.gpu.frame(this.recording);this.lastSent=Date.now();}}
 close(){clearInterval(this.timer);this.gpu.grab(false);this.gpu.show(false);this.gpu.close();}
}
module.exports={Dashboard};

// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {RenderClient,imageOp}=require('./mgu_render_client.js');
const {BrandCanvas}=require('./brand_canvas.js');
const qr=require('./qrcode.js');
const release=require('./release_notes.js');
const C={bg:'#0c0d10',panel:'#181a20',muted:'#999da8',line:'#2c2f38',red:'#c8121b',green:'#8bccab'};
class Dashboard {
 constructor(app,log){
  this.app=app;this.tab=0;this.focus=0;this.visible=false;this.items=[];this.lastCcu=null;this.lastKey='';
  this.gpu=new RenderClient('maxmods_hud_mirror',log,{mode:'embed'});
  this.gpu.on('ready',(screen,info)=>{
   if(!info||!info.pixmap||info.modes.indexOf('embed')<0)return;
   this.info=info;const b=info.embedBox,scale=Math.min(b.w/1024,b.h/480);
   this.gpu.mode('embed');this.gpu.place({x:b.x,y:b.y,w:b.w,h:b.h,scale,ox:(b.w-1024*scale)/2,oy:(b.h-480*scale)/2});
   this.gpu.pixmap(1,1024,480,'rgba','linear');this.gpu.fps(4);this.lastKey='';this.show(this.visible);this.render(true);
  });
  this.gpu.on('touch',(phase,x,y)=>{if(!this.visible||phase!=='up')return;const i=this.items.findIndex(b=>x>=b.x&&y>=b.y&&x<b.x+b.w&&y<b.y+b.h);if(i>=0){this.focus=i;this.activate();}});
  this.gpu.on('ccu',(e)=>{
   if(!this.visible)return;const old=this.lastCcu;this.lastCcu=e;if(!old)return;
   const d=((e.knob-old.knob+0x18000)%0x10000)-0x8000;
   if(e.knob!==65535&&old.knob!==65535&&Math.abs(d)<=12&&d){this.focus=Math.max(0,Math.min(this.items.length-1,this.focus+d));this.render(true);}
   if((e.press===1||e.press===2)&&e.press!==old.press&&e.seq!==old.seq)this.activate();
  });
  this.gpu.on('tick',()=>{if(this.visible)this.sendFrame();});
  this.timer=setInterval(()=>{if(this.visible){this.render();this.sendFrame();}},1000);
 }
 connect(){this.gpu.connect();}
 show(on){this.visible=!!on;this.gpu.show(this.visible);this.gpu.grab(this.visible&&!!(this.info&&this.info.controller));if(!on)this.lastCcu=null;else this.render(true);}
 activate(){const item=this.items[this.focus];if(item)this.app.press('drawn'+item.id,()=>item.fn());this.render(true);}
 button(c,id,label,x,y,w,fn,primary){
  const i=this.items.length,focus=i===this.focus;this.items.push({id,x,y,w,h:51,fn});
  c.rect(x,y,w,51,focus?'#ffffff':primary?C.red:C.panel).text(label,x+17,y+9,20,focus?'#101115':'#ffffff',w-30);
 }
 frame(){
  const a=this.app,m=a.mirror,c=new BrandCanvas();this.items=[];
  c.rect(0,0,1024,480,C.bg).logo(221,18).text('HUD MIRROR',224,67,16,C.muted);
  c.rect(0,0,192,480,'#111216').rect(191,0,1,480,C.line);
  ['Connection','Display','Updates'].forEach((t,i)=>this.button(c,'tab'+i,t,12,118+i*65,168,()=>{this.tab=i;this.focus=i;},this.tab===i));
  c.text('MAX MODS',20,29,20,'#ffffff').text('iDrive Apps',20,59,16,C.muted).text('v'+release.version,20,438,16,C.muted);
  const blocked=a.guard.reason();c.text(blocked?'Park required':'Park confirmed',790,31,16,blocked?'#e4ba8f':C.green,210);
  if(this.tab===0){
   if(a.qr.url){
    c.text('Connect your phone',224,111,32,'#ffffff');
    const q=qr(0,'M');q.addData(a.qr.url);q.make();const count=q.getModuleCount(),cell=Math.floor(260/(count+8)),side=(count+8)*cell,x=233,y=172;
    c.rect(x,y,side,side,'#ffffff');for(let r=0;r<count;r++)for(let col=0;col<count;col++)if(q.isDark(r,col))c.rect(x+(col+4)*cell,y+(r+4)*cell,cell,cell,'#000000');
    c.text('1  Start sharing on your phone',540,180,20,'#ffffff',460).text('2  Tap Scan car QR',540,219,20,'#ffffff',460)
     .text('Same BMW Wi-Fi. Code expires in 2 minutes.',540,265,16,C.muted,450).text('QR times out? Install Max Mods Connect in the Store.',540,294,16,C.muted,450);
    this.button(c,'cancelqr','Cancel',540,348,180,()=>a.qr.close());this.button(c,'manual','Enter manually',735,348,250,()=>a.pairPhone());
   }else{
    c.text(m.running?'Your phone. Your display.':'Ready when you are.',224,112,32,'#ffffff');
    c.text(m.status,224,164,20,C.muted,770);
    c.rect(224,215,760,92,C.panel).rect(224,215,4,92,C.red);
    c.text(m.pairing?'PHONE CONNECTED':'CONNECT YOUR PHONE',247,230,16,C.muted)
     .text(m.pairing?'Paired over BMW Wi-Fi':'Start sharing, then scan the car QR',247,257,24,'#ffffff',720);
    this.button(c,'start',m.running?'Stop mirror':'Start mirror',224,333,272,()=>m.running?m.stop():m.start(false),true);
    this.button(c,'qr','Pair with QR',514,333,228,()=>a.pairQr());
    this.button(c,'manual','Pair manually',760,333,224,()=>a.pairPhone());
    c.text('Sound stays on BMW Bluetooth or Android Auto.',224,414,16,C.muted,765);
   }
  }else if(this.tab===1){
   c.text('Make it yours.',224,112,32,'#ffffff');
   this.button(c,'target',m.target==='hud'?'Display: Head-up display':'Display: Instrument cluster',224,179,760,()=>m.toggleTarget());
   this.button(c,'layout',m.layout==='compact'?'Size: Compact - space below for BMW':'Size: Full screen',224,243,760,()=>m.toggleLayout());
   this.button(c,'background','Keep mirroring on other pages: '+(a.background?'On':'Off'),224,307,760,()=>a.toggleBackground());
   this.button(c,'test','Test selected display',224,371,760,()=>m.start(true));
   c.text('Whole phone picture fits. Vehicle must remain stationary in P.',224,441,16,C.muted,770);
  }else{
   c.text("What's new",224,112,32,'#ffffff').text('Car '+release.version+' / Android '+release.phoneVersion,224,163,20,C.muted);
   const lines=release.lines[a._releaseIndex];c.rect(224,214,760,125,C.panel);
   c.text(String(a._releaseIndex+1).padStart(2,'0')+' / '+release.lines.length,244,226,16,'#de5e64');
   lines.forEach((t,i)=>c.text(t,244,260+i*31,20,'#ffffff',716));
   this.button(c,'prev','Previous',224,363,250,()=>a.releaseNote(-1));this.button(c,'next','Next change',491,363,250,()=>a.releaseNote(1),true);
   c.text('Received fps measures the link. Projector fps needs a car check.',224,441,16,C.muted,770);
  }
  return c;
 }
 render(force){if(!this.visible||!this.info)return;const a=this.app,key=JSON.stringify([this.tab,this.focus,a.mirror.status,a.mirror.running,!!a.mirror.pairing,a.mirror.layout,a.mirror.target,a.background,a.guard.reason(),a.qr.url,a._releaseIndex]);
  if(!force&&key===this.lastKey)return;this.lastKey=key;const c=this.frame();this.gpu.claim(this.items.map(b=>({x:b.x,y:b.y,w:b.w,h:b.h})));this.gpu.pixels(1,[{x:0,y:0,w:1024,h:480}],c.data);this.sendFrame();
 }
 sendFrame(){if(this.info&&this.visible){const op=imageOp(1,0,0,1024,480,0),words=new Uint32Array(op.length+2);words[0]=1;words[1]=0x0c0d10ff;words.set(op,2);this.gpu.frameWords(words);}}
 close(){clearInterval(this.timer);this.gpu.grab(false);this.gpu.show(false);this.gpu.close();}
}
module.exports={Dashboard};

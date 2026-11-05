// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path'),EventEmitter=require('events');
const {GpuCanvas,kit}=require('../car/src/gpu_canvas.js');
class Gpu extends EventEmitter{
 place(p){this.placement=p;}mode(){}fps(){}show(){}grab(){}connect(){}close(){}claim(v){this.claims=v;}frame(r){this.last=r;this.sent=(this.sent||0)+1;}
}
const context={module:{exports:{}},require:n=>n==='./mgu_render_client.js'?{RenderClient:Gpu}:require(path.resolve(__dirname,'../car/src',n)),setInterval,clearInterval};
vm.runInNewContext(fs.readFileSync(require.resolve('../car/src/dashboard.js'),'utf8'),context);const {Dashboard}=context.module.exports;
const actions=[],app={mirror:{status:'Receiving 58 fps (GPU)',running:false,pairing:{host:'10.232.70.219'},layout:'compact',target:'hud'},guard:{reason:()=>''},qr:{url:null,close(){}},_releaseIndex:0,background:true,
 press:(id,fn)=>fn(),syncFocusProxies(){},chooseDisplay:()=>actions.push('display'),chooseLayout(){},chooseSettings(){},startMirror:test=>actions.push(test?'test':'start'),stopMirror(){},forceClose(){},pairQr(){},pairPhone(){},releaseNote(){}};
const d=new Dashboard(app,{}),previews=[];
function inspect(name){
 d.render(true);const c=d.recording,u=c.words(),f=new Float32Array(u.buffer,u.byteOffset,u.length);assert(u.byteLength<100*1024,'UI unexpectedly sends a screen-sized payload');
 d.items.forEach(b=>assert(b.x>=0&&b.y>=0&&b.x+b.w<=d.width+1&&b.y+b.h<=480,name+' has an off-screen control: '+b.id));assert(d.items.length<=12);
 for(let i=0;i<u.length;){const op=u[i++];if(op===2){assert(f[i+2]>0&&f[i+3]>0);i+=5;}else if(op===11){const a=kit.atlasById(u[i]),n=u[i+2];assert(a&&a.alpha.length===a.atlasW*a.atlasH);i+=3;
  for(let g=0;g<n;g++,i+=8){assert(f[i]>=0&&f[i+1]>=0&&f[i]+f[i+2]<=d.width+1&&f[i+1]+f[i+3]<=481,'text escaped the display');assert(f[i+4]>=0&&f[i+6]<=a.atlasW&&f[i+7]<=a.atlasH);}
 }else if(op===18||op===19){i+=6;}else throw Error('Unknown GPU draw op '+op);assert(i<=u.length);}
 previews.push({name,w:d.width,h:480,words:Buffer.from(u.buffer,u.byteOffset,u.byteLength).toString('base64'),atlases:Array.from(c.atlases,id=>{const a=kit.atlasById(id);return {id,w:a.atlasW,h:a.atlasH,alpha:a.alpha.toString('base64')};}),images:Array.from(c.images,id=>{const a=kit.imageById.get(id);return a&&{id,w:a.w,h:a.h,rgba:a.data.toString('base64')};}).filter(Boolean)});
}
try{
 d.show(true);d.gpu.emit('ready',{}, {modes:['embed'],embedBox:{x:70,y:60,w:1680,h:560},controller:false,video:true});
 assert.strictEqual(d.width,1440);assert.strictEqual(d.gpu.placement.w,1680);assert.strictEqual(d.gpu.placement.scale,560/480);
 for(let tab=0;tab<3;tab++){d.tab=tab;inspect(['connection','display','updates'][tab]);}
 d.tab=0;d.frontCcu({frontRotaryEncoderOperation:0,frontRotaryEncoderPushButton:0,frontSequenceNumberOperatingElement:1});
 d.frontCcu({frontRotaryEncoderOperation:1,frontRotaryEncoderPushButton:0,frontSequenceNumberOperatingElement:2});assert.strictEqual(d.focus,1);
 d.frontCcu({frontRotaryEncoderOperation:1,frontRotaryEncoderPushButton:1,frontSequenceNumberOperatingElement:3});assert.strictEqual(d.tab,1);
 d.proxyPress(d.items.findIndex(b=>b.id==='test'));assert(actions.includes('test'));d.proxyFocus(0,true);assert.strictEqual(d.focus,0);
 d.gpu.emit('ready',{}, {modes:['embed'],embedBox:{x:0,y:0,w:1024,h:480},controller:false,video:true});d.tab=0;inspect('connection-narrow');
 app.qr.url='maxmods://pair?v=2&host=10.232.70.1&hosts=10.232.70.1,192.168.1.1,172.16.1.1,10.0.0.1&port=8477&key='+'a'.repeat(48);inspect('qr-narrow');app.qr.url=null;
 d.tab=2;inspect('updates-narrow');d.tab=1;inspect('display-narrow');
 const logo=kit.imageById.get(200);let clear=0;for(let i=3;i<logo.data.length;i+=4)if(logo.data[i]===0)clear++;assert(clear>logo.w*logo.h*.2,'Logo is not transparent');
 d.setSurface({kind:'video',id:201,visible:true,rect:{x:20,y:20,w:900,h:400}});d.controls=true;d.setSurface({kind:'video',id:201,visible:true,rect:{x:20,y:20,w:900,h:400}});assert(d.controls,'Video updates hid the controls');inspect('video-controls');
 if(process.argv.includes('--preview')){fs.mkdirSync(path.resolve(__dirname,'../build/ui-preview'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../build/ui-preview/recordings.json'),JSON.stringify(previews));}
 console.log('PASS GPU UI command bounds, actual iDrive area scaling, transparent logo, readable-size resources, rotary/native focus and persistent video controls');
}finally{d.close();}

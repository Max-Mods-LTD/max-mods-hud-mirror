// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('assert'),vm=require('vm'),fs=require('fs'),EventEmitter=require('events');
const {videoOp,imageOp}=require('../car/src/mgu_render_client');
let created=0,autoReady=true;
class Gpu extends EventEmitter{
 constructor(){super();created++;this.frames=[];this.grabs=[];}
 static available(){return true;}connect(){if(autoReady)setImmediate(()=>this.emit('ready',{}, {video:true,modes:['embed'],embedBox:{x:70,y:60,w:1680,h:560}}));}
 place(p){this.placement=p;}mode(){}fps(){}grab(v){this.grabs.push(v);}claim(v){this.claims=v;}show(v){this.visible=v;}frameWords(v){this.frames.push(Array.from(v));}close(){this.closed=true;this.emit('close');}
}
const context={module:{exports:{}},require:n=>n==='events'?EventEmitter:{RenderClient:Gpu,videoOp,imageOp},setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,40)),clearTimeout,setInterval,clearInterval};
vm.runInNewContext(fs.readFileSync(require.resolve('../car/src/native_video'),'utf8'),context);const {NativeVideo}=context.module.exports;
(async()=>{
 let backs=0;const h=new NativeVideo(()=>backs++,()=>{},{});h.show(false);assert.strictEqual(created,0,'Native HUD/cluster menus must not open a GPU connection');
 await h.ensureReady();assert.strictEqual(h.width,1440);assert.strictEqual(h.gpu.placement.scale,560/480);assert.strictEqual(h.gpu.visible,false);
 h.setSurface({kind:'video',id:201,rect:{x:10,y:20,w:900,h:400}});h.show(true);const gpu=h.gpu,frame=gpu.frames[gpu.frames.length-1];assert.strictEqual(frame.length,13);assert.strictEqual(frame[0],2);assert.strictEqual(frame[6],19);assert.strictEqual(frame[12],201);assert(gpu.grabs.every(v=>v===false),'Video stole the native BMW controller');
 gpu.emit('touch','up',10,20);assert.strictEqual(backs,1);h.show(false);assert.strictEqual(gpu.visible,false);assert.strictEqual(gpu.claims.length,0);
 let lost=0;h.on('disconnected',()=>lost++);gpu.emit('renderer-error','video unavailable');gpu.emit('close');assert.strictEqual(lost,1);assert.strictEqual(h.info,null);
 h.release();assert(gpu.closed&&!h.gpu);autoReady=false;await assert.rejects(h.ensureReady(),/timed out/);h.release();h.close();
 console.log('PASS lazy video-only GPU connection, actual embed sizing, bounded draw words, native controller ownership, tap-to-Back, hide/release and startup timeout');
})().catch(e=>{console.error(e);process.exitCode=1;});

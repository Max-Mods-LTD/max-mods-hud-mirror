// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('assert'),vm=require('vm'),fs=require('fs'),EventEmitter=require('events');
let now=1000,socket,writer,interval;
class Socket extends EventEmitter{constructor(){super();this.writes=[];this.destroyed=false;}write(b){this.writes.push(b);return true;}destroy(){if(!this.destroyed){this.destroyed=true;this.emit('close');}}}
class Writer extends EventEmitter{constructor(){super();this.writableLength=0;this.payloads=[];}write(b){this.payloads.push(b);return true;}destroy(){this.destroyed=true;}}
const modules={events:EventEmitter,net:{Socket:class{constructor(){writer=new Writer();return writer;}},connect:()=>{socket=new Socket();setImmediate(()=>socket.emit('connect'));return socket;}},fs:{constants:{O_WRONLY:1,O_NONBLOCK:2,O_NOFOLLOW:4},openSync:()=>42,fstatSync:()=>({isFIFO:()=>true}),closeSync(){},statSync:()=>({isSocket:()=>true}),existsSync:()=>true}};
const box={module:{exports:{}},require:n=>modules[n],Date:{now:()=>now},setInterval:fn=>{interval=fn;return 1;},clearInterval(){interval=null;},setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync(require.resolve('../car/src/gpu_video_renderer.js'),'utf8'),box);const {GpuVideoRenderer}=box.module.exports;
const turn=()=>new Promise(r=>setImmediate(r)),send=v=>socket.emit('data',Buffer.from(JSON.stringify(v)+'\n'));
(async()=>{
 const r=new GpuVideoRenderer('hud','compact',{width:768,height:432,fps:30});let ready=0,refused=0;
 r.on('ready',()=>ready++);r.on('refused',()=>refused++);assert(GpuVideoRenderer.available());r.connect();await turn();assert.strictEqual(JSON.parse(socket.writes[0]).target,'hud');
 const reply=JSON.stringify({ok:true,fifo:'/run/maxmods-video/session-abc123/input.h264'})+'\n'+JSON.stringify({status:{state:'showing',target:'hud'}})+'\n';
 socket.emit('data',Buffer.from(reply.slice(0,20)));assert.strictEqual(ready,0);socket.emit('data',Buffer.from(reply.slice(20)));await turn();assert.strictEqual(ready,1);
 interval();assert.strictEqual(socket.writes.length,1,'A local timer fabricated capture liveness');
 r.captureAlive();r.frame(1,Buffer.from([0,0,0,1,0x65]),1);r.set(1,{visible:true});interval();assert(socket.writes.some(b=>JSON.parse(b).op==='alive'));assert.strictEqual(writer.payloads.length,1);
 now+=900;interval();assert.strictEqual(refused,0);now+=600;interval();assert.strictEqual(refused,1,'Paused capture did not revoke the decoder');
 const closing=r.close();assert(writer.destroyed);assert.strictEqual(JSON.parse(socket.writes[socket.writes.length-1]).op,'close');let released=false;closing.then(()=>released=true);await turn();assert(!released,'New output can start before decoder exit acknowledgement');
 send({closed:true});await closing;assert(released&&socket.destroyed);send({status:{state:'error',target:'map'}});assert.strictEqual(refused,1);
 const wrong=new GpuVideoRenderer('hud','full',{width:576,height:324,fps:60});let mismatch=false;wrong.on('refused',()=>mismatch=true);wrong.connect();await turn();send({status:{state:'showing',target:'map'}});assert(mismatch);const end=wrong.close();send({closed:true});await end;
 console.log('PASS fragmented GPU handshake/status, genuine capture-only lease, bounded AVC writes, exit acknowledgement and wrong-display refusal');
})().catch(e=>{console.error(e);process.exitCode=1;});

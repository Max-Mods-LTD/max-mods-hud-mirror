// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),net=require('net');
const {GpuVideoRenderer}=require('../car/src/gpu_video_renderer.js');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maxmods-fifo-')),file=path.join(dir,'input.h264');
cp.execFileSync('mkfifo',[file]);const r=new GpuVideoRenderer('hud','compact',{width:768,height:432,fps:30});
let reader,fail,ready=0,bytes=0;const chunks=[],payload=Buffer.alloc(128*1024,0x65);
r.on('refused',(op,ref,reason)=>fail=reason);r.readyAt=Date.now();
r.on('ready',()=>{ready++;for(let i=0;i<3;i++)assert(r.frame(1,payload,i+1));});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 r.openWriter(file);assert(!r.writer&&ready===0,'No-reader FIFO open blocked or claimed readiness');
 await delay(60);assert(!r.writer&&!fail);
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK);reader=new net.Socket({fd,readable:true,writable:false});reader.on('error',e=>fail=e.message);reader.on('data',b=>{bytes+=b.length;chunks.push(b);});
 for(let i=0;i<300&&bytes<3*payload.length&&!fail;i++)await delay(5);
 assert(!fail,fail);assert.strictEqual(ready,1);assert.strictEqual(bytes,3*payload.length);assert(Buffer.concat(chunks).equals(Buffer.concat([payload,payload,payload])));
 await r.close();reader.destroy();assert(!r.fifoRetry||r.closed);console.log('PASS actual FIFO delayed-reader startup without blocking, ordered large writes and cancellable pipe cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;}).then(async()=>{await r.close();if(reader)reader.destroy();fs.rmSync(dir,{recursive:true,force:true});});

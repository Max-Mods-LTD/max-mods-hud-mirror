// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),net=require('net'),os=require('os'),EventEmitter=require('events');
const {config,rect,serve}=require('../tools/Video/engine.js');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'maxmods-video-')),request={op:'open',target:'hud',layout:'compact',width:576,height:324,fps:60};
const text=config(request,base);assert(text.includes('\navb_stream=\n')&&text.includes('\nalt_screen_port=0\n')&&text.includes('\nhide_bmw_guidance=0\n'));
assert(!text.includes('guide_hold=1')&&!text.includes('patch'));assert(text.includes('tex_size=576x324')&&text.includes('target_fps=60'));
for(const bad of [{target:'panel'},{target:'idrive'},{width:1920},{fps:120},{layout:'crop'},{op:'open; reboot'}])assert.throws(()=>config(Object.assign({},request,bad),base));
for(const target of ['hud','map'])for(const layout of ['compact','full']){const [x,y,w,h]=rect(target,layout,768,432).split(',').map(Number);assert(x>=0&&y>=0&&x+w<=(target==='hud'?800:1088)&&y+h<=480);assert(Math.abs(w/h-16/9)<0.01);if(layout==='compact')assert(y+h<480*.75);}
let live=0,maxLive=0,spawned=0,exited=0;const ports=new Map();
function spawn(native,args,opts){
 assert.strictEqual(native,process.execPath);assert.deepStrictEqual(args.slice(0,1),['-c']);assert(!opts.env.LISTEN_PID);
 const file=args[1],dir=path.dirname(file),cfg=fs.readFileSync(file,'utf8');assert(cfg.includes('fifo_path='+dir+'/input.h264\n'));assert.strictEqual(fs.statSync(file).mode&0o777,0o600);
 const child=new EventEmitter();child.pid=++spawned;child.exitCode=null;child.signalCode=null;live++;maxLive=Math.max(maxLive,live);
 fs.writeFileSync(path.join(dir,'input.h264'),'');fs.writeFileSync(path.join(dir,'probe.txt'),'not a real decoder');
 const nativeServer=net.createServer(s=>s.on('data',b=>{assert.strictEqual(JSON.parse(b).cmd,'start');s.write('{"ev":"status","state":"showing","target":"hud","reason":""}\n');}));
 nativeServer.listen(0,'127.0.0.1',()=>{ports.set(path.join(dir,'native.sock'),nativeServer.address().port);fs.writeFileSync(path.join(dir,'native.sock'),'host TCP stand-in for Unix socket');});
 let stopping=false;child.kill=signal=>{if(stopping)return true;stopping=true;setTimeout(()=>{nativeServer.close();child.signalCode=signal;live--;exited++;child.emit('exit',null,signal);},25);return true;};return child;
}
const abandoned=path.join(base,'session-old123');fs.mkdirSync(abandoned);fs.writeFileSync(path.join(abandoned,'video.conf'),'abandoned configuration');fs.writeFileSync(path.join(abandoned,'probe.txt'),'abandoned probe');
const server=serve({base,native:process.execPath,spawn,connect:file=>net.connect(ports.get(file),'127.0.0.1'),testing:true,listen:{host:'127.0.0.1',port:0},initialLeaseMs:300,leaseMs:120});assert(!fs.existsSync(abandoned),'Crash leftovers survived restart');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function connect(req){const socket=net.connect(server.address().port,'127.0.0.1'),messages=[];let data='';socket.on('error',()=>{});socket.on('data',b=>{data+=b;let p;while((p=data.indexOf('\n'))>=0){messages.push(JSON.parse(data.slice(0,p)));data=data.slice(p+1);}});socket.once('connect',()=>socket.write(JSON.stringify(req)+'\n'));return {socket,messages};}
async function until(fn){for(let i=0;i<150;i++){if(fn())return;await wait(5);}throw Error('Video helper condition timed out');}
(async()=>{
 await new Promise(r=>server.once('listening',r));
 const bad=connect(Object.assign({},request,{target:'panel'}));await until(()=>bad.messages.some(m=>m.ok===false));assert.strictEqual(spawned,0);
 const first=connect(request);await until(()=>first.messages.some(m=>m.ok));const firstDir=path.dirname(first.messages.find(m=>m.ok).fifo);
 const second=connect(Object.assign({},request,{target:'map'}));await until(()=>second.messages.some(m=>m.ok));assert.strictEqual(exited,1);assert(!fs.existsSync(firstDir));assert.strictEqual(maxLive,1);
 second.socket.write('{"op":"close"}\n');await until(()=>second.messages.some(m=>m.closed));assert.strictEqual(live,0);assert.strictEqual(exited,2);
 const abrupt=connect(request);await until(()=>abrupt.messages.some(m=>m.ok));abrupt.socket.destroy();
 const next=connect(request);await until(()=>next.messages.some(m=>m.ok));assert.strictEqual(exited,3);assert.strictEqual(maxLive,1);
 next.socket.write('{"op":"alive"}\n');await until(()=>next.messages.some(m=>m.closed));assert.strictEqual(live,0);assert.strictEqual(fs.readdirSync(base).length,0);
 first.socket.destroy();second.socket.destroy();next.socket.destroy();bad.socket.destroy();
 console.log('PASS bounded helper configuration, one decoder at a time, exit acknowledgement, disconnect/lease cleanup and no firmware/service changes');
})().catch(e=>{console.error(e);process.exitCode=1;}).then(async()=>{await server.stopSessions();server.close();fs.rmSync(base,{recursive:true,force:true});});

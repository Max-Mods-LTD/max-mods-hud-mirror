// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const {IdriveRenderer}=require('../car/src/idrive_renderer.js'),{SavedPhone,SavedSettings}=require('../car/src/saved_phone.js');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maxmods-idrive-')),surfaces=[],videos=[];
const dashboard={width:1440,height:480,info:{video:true},gpu:{pixmap(){},pixels(){},video:(id,p)=>videos.push(p)},setSurface:s=>surfaces.push(s)};
try{
 const r=new IdriveRenderer(dashboard,{directory:dir});let ready=false;r.on('ready',()=>ready=true);r.connect();assert(ready&&r.targets==='idrive:1440x480');
 r.video({x:10,y:20,w:900,h:400,vw:4,vh:4});const atlas=Buffer.from([...Array(16).keys(),1,2,101,102,3,4,103,104]);
 assert(r.frame(1,atlas,1));r.set(1,{visible:true});r.frame(1,atlas,2);r.set(1,{visible:true});assert.strictEqual(surfaces.length,1,'Each video frame rebuilt the UI');
 const b=fs.readFileSync(r.file);assert.strictEqual(b.readUInt32LE(0),0x4656474d);assert.strictEqual(b.readUInt32LE(4),1);assert.strictEqual(b.readUInt32LE(8),4);assert.strictEqual(b.readUInt32LE(12),4);assert.strictEqual(b.readUInt32LE(16),2);assert.strictEqual(b.readUInt32LE(20),2);assert.strictEqual(b.readUInt32LE(24),3);
 assert(b.slice(64+48,64+48+24).equals(Buffer.from([...Array(16).keys(),1,2,3,4,101,102,103,104])),'I420 chroma planes are not contiguous');
 r.set(1,{x:50,w:800});assert.strictEqual(surfaces[1].rect.x,50);const file=r.file;r.close();assert(!fs.existsSync(file));assert.strictEqual(videos[videos.length-1],null);assert.strictEqual(surfaces[surfaces.length-1],null);
 const savedFile=path.join(dir,'phone.json'),saved=new SavedPhone(savedFile),pairing={host:'10.232.70.219',resume:'a'.repeat(32),token:'b'.repeat(32)};
 assert(saved.save(pairing));assert.strictEqual(fs.statSync(savedFile).mode&0o777,0o600);assert(!fs.readFileSync(savedFile,'utf8').includes(pairing.token));assert.deepStrictEqual(new SavedPhone(savedFile).value,{host:pairing.host,resume:pairing.resume});saved.forget();assert(!fs.existsSync(savedFile));
 const settingsFile=path.join(dir,'settings.json'),settings=new SavedSettings(settingsFile);settings.save({target:'idrive',layout:'full',background:false,hardware:false});assert.strictEqual(new SavedSettings(settingsFile).value.target,'idrive');assert.strictEqual(fs.statSync(settingsFile).mode&0o777,0o600);
 // A labelled 8x8 YUV atlas proves crop offsets in all three planes. The
 // complete supplied phone rectangle, including its last edge, must survive.
 const modern=Object.assign({},dashboard,{viewport:()=>({x:0,y:0,w:1280,h:480})});
 const cropped=new IdriveRenderer(modern,{directory:dir});cropped.connect();cropped.video({vw:8,vh:8,x:40,y:30,w:900,h:400});
 const input=Buffer.from(Array.from({length:96},(_,n)=>n));
 assert(cropped.frame(1,input,1,{x:2,y:2,w:4,h:4}));const firstFile=cropped.file;
 const plane=fs.readFileSync(firstFile).slice(64+24,64+48);
 assert(plane.equals(Buffer.from([18,19,20,21,26,27,28,29,34,35,36,37,42,43,44,45,73,74,81,82,77,78,85,86])),'Padding removal cropped phone pixels or mixed chroma');
 assert.strictEqual(fs.statSync(firstFile).mode&0o777,0o600);cropped.set(1,{visible:true});assert.deepStrictEqual(surfaces[surfaces.length-1].rect,{x:0,y:0,w:1280,h:480},'Full-screen video was fitted inside the old app rectangle');
 assert(cropped.frame(1,input,2,{x:2,y:2,w:4,h:4}));assert.strictEqual(cropped.file,firstFile,'Stable orientation reallocated the frame file');
 assert(cropped.frame(1,input,3,{x:0,y:2,w:8,h:4}));assert(!fs.existsSync(firstFile));const rotated=cropped.file;const rotatedHeader=fs.readFileSync(rotated);assert.strictEqual(rotatedHeader.readUInt32LE(8),8);assert.strictEqual(rotatedHeader.readUInt32LE(12),4);
 assert(cropped.frame(1,input,4));assert(!fs.existsSync(rotated));assert.strictEqual(cropped.w,8);assert.strictEqual(cropped.h,8,'Missing frame metadata reused stale rotation bounds');
 for(const bounds of [{x:1,y:0,w:4,h:4},{x:6,y:0,w:4,h:4},{x:0,y:0,w:0,h:4},{x:-2,y:0,w:4,h:4}])assert.strictEqual(cropped.frame(1,input,5,bounds),false);
 cropped.close();assert.strictEqual(fs.readdirSync(dir).filter(n=>n.indexOf('mgu-video-')===0).length,0);
 console.log('PASS iDrive I420 header/planes/slot publication, layout updates without per-frame UI rebuild, cleanup and private remembered pairing/display choices');
 console.log('PASS full-screen viewport, exact Y/U/V phone bounds, rotation rebind, legacy-frame fallback and private RAM-file cleanup');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
// Stopping while the video-only host is starting must not resurrect output.
(async()=>{
 const EventEmitter=require('events');let deliver,ready=0,releases=0;
 const host=new EventEmitter();Object.assign(host,{width:1440,height:480,info:{video:true},gpu:{},ensureReady:()=>new Promise(r=>deliver=r),setSurface(){},release(){releases++;}});
 const r=new IdriveRenderer(host);r.on('ready',()=>ready++);r.connect();r.close();deliver();await new Promise(r=>setImmediate(r));assert.strictEqual(ready,0);assert.strictEqual(releases,1);
 const active=new EventEmitter();Object.assign(active,{width:1440,height:480,info:{video:true},gpu:{},ensureReady:()=>Promise.resolve(),setSurface(){},release(){}});
 const current=new IdriveRenderer(active);let lost=0;current.on('disconnected',()=>lost++);current.connect();await new Promise(r=>setImmediate(r));active.emit('disconnected');assert.strictEqual(lost,1);current.close();assert.strictEqual(active.listenerCount('disconnected'),0);
 console.log('PASS asynchronous iDrive startup cancellation and renderer-loss cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});

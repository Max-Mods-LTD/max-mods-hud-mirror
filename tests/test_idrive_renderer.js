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
 console.log('PASS iDrive I420 header/planes/slot publication, layout updates without per-frame UI rebuild, cleanup and private remembered pairing/display choices');
}finally{fs.rmSync(dir,{recursive:true,force:true});}

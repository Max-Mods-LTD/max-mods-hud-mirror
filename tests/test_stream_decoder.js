// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const {StreamDecoder,BYTES,MAX_WIRE_BYTES}=require('../car/src/stream_decoder.js');
const {JpegWorker}=require('../car/src/jpeg_worker.js');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function record(kind,id,payload){payload=payload||Buffer.alloc(0);const h=Buffer.alloc(13);h.writeUInt32LE(payload.length,0);h[4]=kind;h.writeUInt32LE(id>>>0,5);h.writeUInt32LE(Math.floor(id/0x100000000),9);return Buffer.concat([h,payload]);}
async function until(fn){for(let i=0;i<400;i++){if(fn())return;await delay(5);}throw new Error('Decode timed out');}
(async()=>{
 const piecewise=new JpegWorker(4,4),body=Buffer.from([...Array(24).keys()]),head=Buffer.alloc(4);head.writeUInt32LE(24);
 let assembled,chunkError;piecewise.pending={resolve:p=>assembled=p,reject:e=>chunkError=e};
 const wire=Buffer.concat([head,body]),concat=Buffer.concat;let repeatedCopies=0;
 try{Buffer.concat=function(){repeatedCopies++;return concat.apply(Buffer,arguments);};for(let i=0;i<wire.length;i++)piecewise.data(wire.slice(i,i+1));}finally{Buffer.concat=concat;}
 assert(assembled&&assembled.equals(body)&&!chunkError);assert.strictEqual(repeatedCopies,0,'Fragmented native output recopied the accumulated frame');piecewise.close();
 const invalid=new JpegWorker(4,4);invalid.pending={resolve:()=>{throw Error('Invalid output delivered');},reject:e=>chunkError=e};const oversized=Buffer.alloc(4);oversized.writeUInt32LE(25);invalid.data(oversized);assert(invalid.closed&&chunkError);
 console.log('PASS byte-fragmented native output copies into one bounded buffer; malformed size fails closed');
 const jpeg=fs.readFileSync(path.join(__dirname,'fixtures/frame-768x432.jpg'));
 const worker=new JpegWorker(768,432);const pixels=await worker.decode(jpeg);
 assert.strictEqual(pixels.length,BYTES);assert(pixels[0]>220&&pixels[767]>220);
 const begin=Date.now();for(let i=0;i<60;i++)await worker.decode(jpeg);const ms=Date.now()-begin;worker.close();
 console.log('PASS bounded native JPEG color/atlas decode; 60 frames decoded in '+ms+' ms on host');
 for(const bad of [Buffer.from('broken jpeg'),jpeg.slice(0,70),(()=>{const b=Buffer.from(jpeg);for(let i=0;i<b.length-10;i++)if(b[i]===255&&b[i+1]===192){b.writeUInt16BE(800,i+7);break;}return b;})()]){
  const d=new JpegWorker(768,432);await assert.rejects(d.decode(bad));assert(d.closed);
 }
 const seen=[],states=[],errors=[];const d=new StreamDecoder({frame:(p,id)=>{assert(p.equals(pixels));seen.push(id);},state:s=>states.push(s),error:e=>errors.push(e)});
 const first=record(1,1,jpeg);for(let i=0;i<first.length;i++)d.push(first.slice(i,i+1));await until(()=>seen.length===1);
 d.push(record(2,1));await delay(10);assert.deepStrictEqual(seen,[1]);
 for(let id=2;id<=200;id++)d.push(record(1,id,jpeg));await until(()=>seen[seen.length-1]===200);
 assert(seen.length<=4,'old frames accumulated');assert.strictEqual(errors.length,0);assert(states.every(s=>s==='active'));d.close();
 console.log('PASS fragmented JPEG records, still-screen heartbeats and one latest waiting frame');
 const late=[],pending=[];const hidden=new StreamDecoder({frame:(p,id)=>late.push(id),state:()=>{},error:e=>{throw e;}},{decode:()=>new Promise(resolve=>pending.push(resolve))});
 hidden.push(record(1,1,jpeg));hidden.push(record(4,1));pending.shift()(pixels);await delay(5);assert.deepStrictEqual(late,[]);
 hidden.push(record(2,1));await delay(5);assert.deepStrictEqual(late,[]);
 hidden.push(record(1,2,jpeg));pending.shift()(pixels);await until(()=>late.length===1);assert.deepStrictEqual(late,[2]);hidden.close();
 console.log('PASS hiding content cancels an in-flight picture and requires a new capture');
 const avcSeen=[],avcStates=[];let requested=0;
 const avc=new StreamDecoder({frame:(p,id)=>avcSeen.push(id),state:s=>avcStates.push(s),gap:()=>requested++,error:e=>{throw e;}},{format:'h264-annexb'});
 const idr=Buffer.from([0,0,0,1,0x67,1,0,0,0,1,0x65,2]),delta=Buffer.from([0,0,1,0x41,3]);
 assert.strictEqual(avc.worker,null,'AVC must not start a JPEG decoder');avc.push(record(1,1,delta));assert.strictEqual(requested,1);assert.deepStrictEqual(avcSeen,[]);
 avc.push(record(1,2,idr));for(let n=3;n<=70;n++)avc.push(record(1,n,delta));assert.strictEqual(avcSeen.length,69,'AVC reference pictures were dropped');
 avc.push(record(1,72,delta));assert.strictEqual(avcSeen.length,69,'Sequence gap must wait for an IDR');avc.push(record(1,73,idr));assert.strictEqual(avcSeen[69],73);
 avc.push(record(4,73));avc.push(record(1,74,delta));assert.strictEqual(avcSeen.length,70,'Hidden content must invalidate decoder references');avc.push(record(1,75,idr));assert.strictEqual(avcSeen[70],75);avc.close();
 console.log('PASS ordered AVC references, missing-frame keyframe requests, hidden-content reset and no JPEG worker in GPU mode');
 for(const bad of [record(0,0),record(1,0,jpeg),record(2,1,Buffer.from('x')),(()=>{const h=Buffer.alloc(13);h.writeUInt32LE(MAX_WIRE_BYTES+1);h[4]=1;return h;})()]){
  let refused;const x=new StreamDecoder({frame:()=>{throw new Error('bad frame delivered');},state:()=>{},error:e=>{refused=e;}});x.push(bad);assert(refused&&x.closed);
 }
 let stopped;const end=new StreamDecoder({frame:()=>{},state:()=>{},error:e=>{stopped=e;}});end.push(record(5,0));assert(/capture stopped/.test(stopped.message));
 // Exercise legacy Store archives that strip the executable bit.
 const binary=path.resolve(__dirname,'../car/assets/jpeg-decoder'),data=path.resolve(__dirname,'../data');const existed=fs.existsSync(data);if(!existed)fs.mkdirSync(data);
 const saved=fs.statSync(binary).mode&0o777;let fallback;
 try{fs.chmodSync(binary,0o644);fallback=new JpegWorker(768,432);assert((await fallback.decode(jpeg)).equals(pixels));assert(fallback.work&&fs.statSync(path.join(fallback.work,'decode')).mode&0o100);fallback.close();await delay(30);assert(!fallback.work);}
 finally{fs.chmodSync(binary,saved);if(fallback)fallback.close();if(!existed)fs.rmdirSync(data);}
 console.log('PASS malformed JPEG/bounds fail closed and non-executable Store archives use a private app-data decoder');
})().catch(e=>{console.error(e);process.exitCode=1;});

// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Real Java HTTP server / Node decoder; synthetic NALs, no hardware decoding.
const assert=require('assert'),cp=require('child_process'),path=require('path');
const {PhoneClient}=require('../car/src/phone_client.js');
const root=path.resolve(__dirname,'..'),p=new PhoneClient();
const child=cp.spawn('java',['-cp',path.join(root,'build/phone-tests'),'PhoneServerHarness','avc'],{cwd:root,stdio:['pipe','pipe','inherit']});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let input='',started=false;
const pending=new Map();
async function until(fn){for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw new Error('AVC integration timed out');}
async function command(name){let done=false;pending.set('OK '+name,()=>{done=true;});child.stdin.write(name+'\n');await until(()=>done);}
const deadline=setTimeout(()=>{child.kill();console.error('AVC integration deadline');process.exitCode=1;},15000);
child.stdout.on('data',chunk=>{input+=chunk;for(let n;(n=input.indexOf('\n'))>=0;){const line=input.slice(0,n).trim();input=input.slice(n+1);if(!started){started=true;run(line).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{p.close();child.stdin.end('quit\n');});}else if(pending.has(line)){pending.get(line)();pending.delete(line);}}});
child.on('error',e=>{clearTimeout(deadline);console.error(e);process.exitCode=1;});
child.on('exit',code=>{clearTimeout(deadline);if(code)process.exitCode=1;});
async function run(pin){
 const paired=await p.request('127.0.0.1','/v4/pair',null,pin,2048);assert.strictEqual(paired.status,200);
 const token=p.readInfo('127.0.0.1',paired);assert.strictEqual(token.format,'h264-annexb');
 assert.strictEqual((await p.prepare(token,'h264')).format,'h264-annexb');
 // Create >300 ms of references before attaching the actual HTTP consumer.
 await command('avcburst');
 const frames=[],states=[],errors=[];
 p.stream(token,{frame:(bytes,id)=>frames.push({id,bytes}),state:s=>states.push(s),error:e=>errors.push(e)});
 await until(()=>frames.length>0);
 assert.strictEqual(frames[0].id,12,'Stale references were replayed instead of requesting a fresh IDR');
 assert(frames[0].bytes.includes(0x65),'Recovery did not wait for the requested keyframe');
 await command('delta');await until(()=>frames.length===2);assert.strictEqual(frames[1].id,13);
 assert.deepStrictEqual(errors,[]);
 await command('hide');await until(()=>states[states.length-1]==='hidden');
 await command('show');await until(()=>states[states.length-1]==='waiting');
 await delay(300); // Respect the production decoder's 250 ms keyframe-request budget.
 await command('delta');await until(()=>frames.length===3);
 assert.strictEqual(frames[2].id,15,'Hidden reference reset did not require another IDR');
 assert(frames[2].bytes.includes(0x65));
 await command('stop');await until(()=>errors.length>0);assert(/capture stopped/.test(errors[0].message));
 console.log('PASS Java HTTP AVC backlog discard, car-requested IDR, ordered deltas, hidden-reference recovery and terminal stop');
}

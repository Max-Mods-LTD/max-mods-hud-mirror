// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('assert'),net=require('net');
const {localRule,cleanup,serve}=require('../tools/Connect/bridge.js');
const interfaces={wlan0:[{family:'IPv4',internal:false,address:'10.232.70.1',netmask:'255.255.255.0'}]};
const rule=localRule('10.232.70.1',interfaces);assert(rule.includes('10.232.70.0/24'));assert(rule.includes('"wlan0"'));assert(rule.includes('8477'));assert(!rule.includes('flush'));
for(const host of ['8.8.8.8','127.0.0.1','10.232.70.2','10.232.70.1; flush ruleset','999.1.1.1'])assert.throws(()=>localRule(host,interfaces));
let deletes=[];cleanup(args=>{if(args[0]==='-a')return 'tcp dport 80 accept comment "OtherApp" # handle 3\ntcp dport 8477 accept comment "MaxModsQR" # handle 7\n';deletes.push(args);return '';});assert.strictEqual(deletes.length,1);assert.strictEqual(deletes[0].slice(-1)[0],'7');
let open=false,inserted=0,removed=0,failDelete=false;
function run(args){if(args[0]==='-a')return open?'tcp dport 8477 accept comment "MaxModsQR" # handle 11\n':'';if(args[0]==='insert'){assert.deepStrictEqual(args,rule);open=true;inserted++;}if(args[0]==='delete'){if(failDelete){failDelete=false;throw new Error('temporary nft failure');}open=false;removed++;}return '';}
const server=serve({run,interfaces:()=>interfaces,listen:{host:'127.0.0.1',port:0},testing:true,leaseMs:80});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function lease(host){return new Promise((resolve,reject)=>{const s=net.connect(server.address().port,'127.0.0.1',()=>s.write(JSON.stringify({op:'pair',host})+'\n'));s.on('error',reject);s.once('data',data=>resolve({socket:s,ok:JSON.parse(data).ok}));});}
(async()=>{
 await new Promise(r=>server.once('listening',r));
 const bad=await lease('8.8.8.8');assert(!bad.ok&&!open);bad.socket.destroy();
 let good=await lease('10.232.70.1');assert(good.ok&&open);good.socket.destroy();await wait(20);assert(!open);
 good=await lease('10.232.70.1');assert(good.ok&&open);await wait(130);assert(!open);good.socket.destroy();
 good=await lease('10.232.70.1');assert(good.ok&&open);failDelete=true;good.socket.destroy();await wait(60);assert(!open,'Transient cleanup failure left the network rule open');
 assert.strictEqual(inserted,3);assert.strictEqual(removed,3);
 console.log('PASS QR bridge restricts interface/subnet/destination/port, rejects command injection and removes its rules on close/expiry');
})().catch(e=>{console.error(e);process.exitCode=1;}).then(()=>server.close());

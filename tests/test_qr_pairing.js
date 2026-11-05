// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('assert'),http=require('http'),net=require('net'),fs=require('fs'),os=require('os'),path=require('path');
const {QrPairing}=require('../car/src/qr_pairing.js');
let allowed=true,calls=0;const mirror={guard:{allowed:()=>allowed,reason:()=> 'Park required'},pairing:null,pair(text){calls++;assert.strictEqual(text,'10.1.2.3/12345678');this.pairing={host:'10.1.2.3'};return Promise.resolve();}};
const qr=new QrPairing(mirror,{host:'127.0.0.1',port:0,allowLoopback:true,phoneHost:'10.1.2.3',skipBridge:true});
function send(url,key,body,extra){const p=new URL(url);return new Promise((resolve,reject)=>{const req=http.request({host:p.searchParams.get('host'),port:p.searchParams.get('port'),path:'/pair',method:'POST',headers:Object.assign({'X-MaxMods-Pair':key,'Content-Length':Buffer.byteLength(body)},extra||{})},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(body);});}
(async()=>{
 let url=await qr.start(),key=new URL(url).searchParams.get('key');assert(/^[a-f0-9]{48}$/.test(key));
 assert.strictEqual(await send(url,'0'.repeat(48),'12345678'),403);assert.strictEqual(calls,0);
 assert.strictEqual(await send(url,key,'12345678',{Origin:'http://example.com'}),403);
 assert.strictEqual(await send(url,key,'1234567'),403);
 allowed=false;assert.strictEqual(await send(url,key,'12345678'),403);assert.strictEqual(calls,0);allowed=true;
 assert.strictEqual(await send(url,key,'12345678'),200);assert.strictEqual(calls,1);
 assert.strictEqual(await send(url,key,'12345678'),403);assert.strictEqual(calls,1);qr.close();
 url=await qr.start();key=new URL(url).searchParams.get('key');qr.expires=Date.now()-1;assert.strictEqual(await send(url,key,'12345678'),403);qr.close();
 url=await qr.start();for(let i=0;i<13;i++)await send(url,'f'.repeat(48),'12345678');assert.strictEqual(await send(url,new URL(url).searchParams.get('key'),'12345678'),403);qr.close();
 allowed=false;await assert.rejects(qr.start(),/Park/);
 console.log('PASS QR nonce, same-LAN pairing, one-time use, expiry, origin/length/attempt bounds and Park checks');
 allowed=true;
 const hosts=['127.0.0.1','10.232.70.1','192.168.1.1','172.16.1.1'];let helperSocket,lease;
 const helper=net.createServer(s=>{helperSocket=s;s.once('data',b=>{lease=JSON.parse(b);setTimeout(()=>s.write('{"ok":true}\n'),1350);});});helper.listen(0,'127.0.0.1');await new Promise(r=>helper.once('listening',r));const sock={host:'127.0.0.1',port:helper.address().port};
 const cold=new QrPairing(mirror,{hosts,port:0,allowLoopback:true,bridgePath:sock});
 try{const at=Date.now(),link=await cold.start();assert(Date.now()-at>=1300);assert.strictEqual(new URL(link).searchParams.get('hosts'),hosts.join(','));assert.strictEqual(new URL(link).searchParams.get('v'),'2');assert.deepStrictEqual(lease.hosts,hosts);}
 finally{cold.close();if(helperSocket)helperSocket.destroy();await new Promise(r=>helper.close(r));}
 const missing=new QrPairing(mirror,{host:'127.0.0.1',port:0,allowLoopback:true,bridgePath:sock});await assert.rejects(missing.start(),/helper unavailable/);assert(!missing.url&&!missing.server);missing.close();
 console.log('PASS multiple QR addresses, cold helper startup beyond the old timeout and no unusable QR when the helper fails');
})().catch(e=>{qr.close();console.error(e);process.exitCode=1;});

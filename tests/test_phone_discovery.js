// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('assert'),dgram=require('dgram'),crypto=require('crypto');
const {PhoneClient}=require('../car/src/phone_client'),{PhoneDiscovery,privateAddress}=require('../car/src/phone_discovery');
const local={interfaces:[{address:'127.0.0.1',target:'127.0.0.1'}],loopback:true,timeout:400};
(async()=>{
 for(const host of ['10.0.0.1','172.16.0.2','192.168.3.4'])assert(privateAddress(host));
 for(const host of ['127.0.0.1','8.8.8.8','172.32.0.1','192.168.0.300','host.local'])assert(!privateAddress(host));
 const server=dgram.createSocket('udp4');await new Promise((resolve,reject)=>{server.once('error',reject);server.bind(8476,'127.0.0.1',resolve);});
 let respond=false;
 server.on('message',(data,peer)=>{
  const nonce=data.toString().slice(7),proof=crypto.createHmac('sha256','001234').update('MMHUD1:'+nonce).digest('hex');
  for(const reply of ['MMHUD1 '+nonce+' '+'f'.repeat(64)+' -','MMHUD1 '+'0'.repeat(32)+' '+proof+' -'].concat(respond?['MMHUD1 '+nonce+' '+proof+' -']:[]))server.send(Buffer.from(reply),peer.port,peer.address);
 });
 try{
  await assert.rejects(new PhoneDiscovery(local).find('001234','pair'),/not found/);respond=true;assert.strictEqual(await new PhoneDiscovery(local).find('001234','pair'),'127.0.0.1');
  const cancellation=new PhoneDiscovery(local),pending=cancellation.find('001234','pair');cancellation.close();await assert.rejects(pending,/cancelled/);
 }finally{await new Promise(resolve=>server.close(resolve));}
 console.log('PASS forged/replayed discovery replies are ignored; matching code succeeds and immediate cancellation closes sockets');
 const client=new PhoneClient(),requests=[],device={host:'10.23.1.8',resume:'a'.repeat(32)},info={token:'b'.repeat(32),resume:device.resume,protocol:4,width:768,height:432,fps:30,format:'jpeg'};
 client.discover=async(key,kind)=>{assert.strictEqual(key,kind==='resume'?device.resume:'001234');return '10.23.1.9';};
 client.request=async(host,route,token,body)=>{requests.push({host,route,body});if(host===device.host)throw Error('Old Wi-Fi address');return {status:200,body:Buffer.from(JSON.stringify(info))};};
 const paired=await client.pair('001 234');assert.strictEqual(paired.host,'10.23.1.9');assert.strictEqual(requests[0].body,'001234');
 const resumed=await client.resume(device);assert.strictEqual(resumed.host,'10.23.1.9');assert.strictEqual(requests[2].body,device.resume);
 client.discover=()=>{throw Error('Manual pairing should not use discovery');};assert.strictEqual((await client.pair('10.23.1.9/001234')).host,'10.23.1.9');client.close();
 console.log('PASS six-digit pairing, remembered-key address recovery and manual fallback retain authenticated HTTP pairing');
})().catch(e=>{console.error(e);process.exitCode=1;});

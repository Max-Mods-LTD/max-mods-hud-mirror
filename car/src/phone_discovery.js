// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const dgram=require('dgram'),os=require('os'),crypto=require('crypto');
const PORT=8476;
function privateAddress(address){const n=String(address).split('.').map(Number);return n.length===4&&n.every(v=>Number.isInteger(v)&&v>=0&&v<=255)&&(n[0]===10||n[0]===172&&n[1]>=16&&n[1]<=31||n[0]===192&&n[1]===168);}
function interfaces(){
 const list=[],all=os.networkInterfaces();
 Object.keys(all).forEach(name=>(all[name]||[]).forEach(n=>{
  if(n.internal||n.family!=='IPv4'&&n.family!==4||!privateAddress(n.address)||!n.netmask)return;
  const ip=n.address.split('.').map(Number),mask=n.netmask.split('.').map(Number);
  if(mask.length!==4||mask.some(v=>!Number.isInteger(v)||v<0||v>255))return;
  const target=ip.map((v,i)=>v|(255^mask[i])).join('.');
  if(target!==n.address&&!list.some(v=>v.address===n.address))list.push({address:n.address,target});
 }));return list.slice(0,8);
}
class PhoneDiscovery{
 constructor(options){this.options=options||{};this.sockets=[];this.timers=[];this.done=false;}
 find(key,kind){
  return new Promise((resolve,reject)=>{
   const nonce=crypto.randomBytes(16).toString('hex'),expected=crypto.createHmac('sha256',key).update('MMHUD1:'+nonce).digest('hex'),found=new Set();
   const finish=(error)=>{if(this.done)return;this.done=true;this.cancel=null;this.timers.forEach(clearTimeout);this.sockets.forEach(s=>{try{s.close();}catch(_){}});if(error)reject(error);else if(found.size!==1)reject(new Error(found.size?'Two phones have this code. Restart sharing on one phone.':'Phone not found. Check BMW Wi-Fi, or use Settings > Manual pairing.'));else resolve(Array.from(found)[0]);};
   this.cancel=()=>finish(new Error('Phone discovery cancelled'));
   const routes=this.options.interfaces||interfaces();
   if(!routes.length){finish(new Error('BMW Wi-Fi discovery unavailable. Use Settings > Manual pairing.'));return;}
   this.timers.push(setTimeout(()=>finish(),this.options.timeout||1800));
   routes.forEach(route=>{
    const socket=dgram.createSocket('udp4');this.sockets.push(socket);socket.on('error',()=>{});
    socket.on('message',(bytes,peer)=>{
     if(this.done||bytes.length>240||peer.port!==PORT||!privateAddress(peer.address)&&!(this.options.loopback&&peer.address==='127.0.0.1'))return;
     const fields=bytes.toString('utf8').split(' ');
     if(fields.length!==4||fields[0]!=='MMHUD1'||fields[1]!==nonce||fields[kind==='resume'?3:2]!==expected)return;
     if(!found.size)this.timers.push(setTimeout(()=>finish(),180));found.add(peer.address);
    });
    socket.bind(0,route.address,()=>{
     if(this.done){try{socket.close();}catch(_){}return;}try{socket.setBroadcast(true);}catch(_){return;}
     const query=Buffer.from('MMHUD1 '+nonce,'ascii'),send=()=>{if(this.done)return;socket.send(query,0,query.length,PORT,route.target,()=>{});};
     send();this.timers.push(setTimeout(send,400),setTimeout(send,900));
    });
   });
  });
 }
 close(){if(this.cancel)this.cancel();}
}
module.exports={PhoneDiscovery,privateAddress,interfaces};

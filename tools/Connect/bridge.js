// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// The only privilege exposed: a two-minute TCP 8477 lease on this car's
// selected local interface, restricted to peers in that interface's subnet.
// No phone data, pairing keys, screenshots or video pass through this helper.
const fs=require('fs'),net=require('net'),os=require('os'),cp=require('child_process');
const TAG='MaxModsQR';
function ipNumber(ip){if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))throw new Error('Invalid address');const a=ip.split('.').map(Number);if(a.some(v=>v>255))throw new Error('Invalid address');return a.reduce((n,v)=>(n*256+v)>>>0,0);}
function ipText(n){return [n>>>24,n>>>16&255,n>>>8&255,n&255].join('.');}
function localRule(host,interfaces){
 const n=ipNumber(host),a=host.split('.').map(Number);
 if(!(a[0]===10||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&a[1]===168))throw new Error('Private Wi-Fi address required');
 for(const name of Object.keys(interfaces))for(const v of interfaces[name]){
  if(v.internal||v.family!=='IPv4'||v.address!==host)continue;
  if(!/^[A-Za-z0-9_.:-]{1,32}$/.test(name))throw new Error('Invalid local interface');
  const mask=ipNumber(v.netmask);let prefix=0,zero=false;
  for(let bit=31;bit>=0;bit--){const on=(mask>>>bit)&1;if(!on)zero=true;else if(zero)throw new Error('Invalid network mask');else prefix++;}
  if(prefix<8||prefix>30)throw new Error('Unsupported local network');
  return ['insert','rule','ip','filter','input','iifname',JSON.stringify(name),'ip','saddr',ipText(n&mask)+'/'+prefix,'ip','daddr',host,'tcp','dport','8477','counter','accept','comment','"'+TAG+'"'];
 }
 throw new Error('The QR address is not a local interface');
}
function nft(args){const r=cp.spawnSync('nft',args,{encoding:'utf8',timeout:2500,maxBuffer:512*1024});if(r.error||r.status!==0)throw new Error('QR firewall operation unavailable');return r.stdout;}
function cleanup(run){const text=run(['-a','list','chain','ip','filter','input']);const re=/comment "MaxModsQR"[^\n]*# handle (\d+)/g;let m;while((m=re.exec(text)))run(['delete','rule','ip','filter','input','handle',m[1]]);}
function serve(options){
 const o=options||{},run=o.run||nft,interfaces=o.interfaces||os.networkInterfaces;
 cleanup(run);let owner=null,timer=null,retry=null;
 function revoke(){try{cleanup(run);clearTimeout(retry);retry=null;return true;}catch(_){if(!retry)retry=setTimeout(()=>{retry=null;revoke();},o.testing?20:1000);return false;}}
 function release(socket){if(socket&&owner!==socket)return true;clearTimeout(timer);const old=owner;owner=null;const ok=revoke();if(old&&!old.destroyed)old.destroy();return ok;}
 const server=net.createServer(socket=>{
  let data='',used=false;socket.setTimeout(5000,()=>socket.destroy());socket.on('error',()=>{});
  socket.on('data',chunk=>{
   data+=chunk.toString('utf8');if(data.length>512||used){socket.destroy();return;}if(data.indexOf('\n')<0)return;used=true;
   try{
    const req=JSON.parse(data.trim());if(req.op!=='pair')throw new Error('Pairing lease required');
    const rule=localRule(req.host,interfaces());if(!release())throw new Error('Previous QR lease is still being removed');run(rule);owner=socket;socket.setTimeout(0);
    timer=setTimeout(()=>release(socket),o.testing?(o.leaseMs||120000):120000);socket.write('{"ok":true}\n');
   }catch(_){socket.end('{"ok":false}\n');}
  });
  socket.on('close',()=>release(socket));
 });
 server.maxConnections=4;server.listen(o.listen||{fd:3});
 const end=()=>{release();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),500).unref();};
 if(!o.testing){process.on('SIGTERM',end);process.on('SIGINT',end);}server.on('error',()=>{release();if(!o.testing)process.exitCode=1;server.close();});
 return server;
}
if(require.main===module){try{
 const op=process.argv[2];
 if(op==='activate'){fs.writeFileSync('/var/opt/maxmods-connect/node-path',process.execPath+'\n',{mode:0o644});console.log('{"status":"QR pairing bridge ready. A network opening lasts only while a car QR is shown, at most two minutes."}');}
 else if(op==='deactivate'){cleanup(nft);cp.spawnSync('systemctl',['stop','maxmods-connect.service','maxmods-connect.socket'],{timeout:10000});cleanup(nft);console.log('{"status":"QR pairing bridge and its temporary network rules removed."}');}
 else if(op==='cleanup')cleanup(nft);else if(op==='serve')serve();else throw new Error('Invalid bridge action');
}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={localRule,cleanup,serve};

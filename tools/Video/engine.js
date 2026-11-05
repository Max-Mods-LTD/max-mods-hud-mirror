// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Each lease owns a separate instance of the installed GPL Waze decoder.
// Existing Waze, CarPlay and Android Auto services/configuration are untouched.
const fs=require('fs'),net=require('net'),path=require('path'),cp=require('child_process');
const NATIVE='/var/opt/waze-on-cluster/current/waze-on-cluster';
function rect(target,layout,width,height){
 const tw=target==='hud'?800:1088,th=480;
 const area=layout==='full'?{x:0,y:0,w:tw,h:th}:{x:tw*.05,y:th*.02,w:tw*.9,h:th*.7};
 const scale=Math.min(area.w/width,area.h/height),w=Math.round(width*scale),h=Math.round(height*scale);
 return [Math.round(area.x+(area.w-w)/2),Math.round(area.y+(area.h-h)/2),w,h].join(',');
}
function config(req,dir){
 if(!req||req.op!=='open'||!['hud','map'].includes(req.target)||!['compact','full'].includes(req.layout)||
  !((req.width===768&&req.height===432&&req.fps===30)||(req.width===576&&req.height===324&&req.fps===60)))throw new Error('Unsupported video session');
 return ['local_conf=','socket_path='+dir+'/native.sock','socket_group=tm_oap_app','socket_mode=0660',
  'fifo_path='+dir+'/input.h264','carplay_group=tm_oap_app','avb_stream=','udp_port=0','alt_screen_port=0',
  'tex_size='+req.width+'x'+req.height,'src_crop=','map_rect='+rect(req.target,req.layout,req.width,req.height),
  'target='+req.target,'target_fps='+req.fps,'tex_level_bits=0','pan_blocks=1','dirty_threshold=0',
  'dirty_settle_ms=250','stall_ms=1000','idle_ms=1500','freeze_ms=0','blank_ms=1000',
  'hide_bmw_guidance=0','state_file=','log_file=','render_socket=/dev/shm/cluster-render/render.sock'].join('\n')+'\n';
}
function serve(options){
 const o=options||{},base=o.base||'/run/maxmods-video',native=o.native||NATIVE,spawn=o.spawn||cp.spawn;
 // Socket activation owns control.sock. Preserve that directory across service
 // restarts, and clean only our abandoned per-session RAM files after a crash.
 for(const name of fs.readdirSync(base))if(/^session-[A-Za-z0-9]+$/.test(name)){
  const dir=path.join(base,name);try{if(!fs.lstatSync(dir).isDirectory())continue;for(const file of ['native.sock','input.h264','video.conf','status.json','probe.txt','status.json.tmp'])try{fs.unlinkSync(path.join(dir,file));}catch(_){}fs.rmdirSync(dir);}catch(_){}
 }
 const sessions=new Set();let owner=null,queue=Promise.resolve();
 function reply(s,value){if(!s.socket.destroyed&&!s.socket.writableEnded)s.socket.write(JSON.stringify(value)+'\n');}
 function stop(s){
  if(!s)return Promise.resolve();if(s.stopped)return s.stopped;
  s.stopping=true;clearTimeout(s.lease);clearTimeout(s.retry);if(s.control)s.control.destroy();
  s.stopped=new Promise(resolve=>{
   let cleaned=false,kill;
   const clean=()=>{
    if(cleaned)return;cleaned=true;clearTimeout(kill);
    if(s.dir){for(const n of ['native.sock','input.h264','video.conf','status.json','probe.txt','status.json.tmp'])try{fs.unlinkSync(path.join(s.dir,n));}catch(_){}try{fs.rmdirSync(s.dir);}catch(_){}}
    if(owner===s)owner=null;sessions.delete(s);reply(s,{closed:true});s.socket.end();resolve();
   };
   if(!s.child||!s.child.pid||s.child.exitCode!==null||s.child.signalCode!==null){clean();return;}
   s.child.once('exit',clean);s.child.once('error',clean);
   try{s.child.kill('SIGTERM');}catch(_){clean();return;}
   kill=setTimeout(()=>{try{s.child.kill('SIGKILL');}catch(_){}},200);if(kill.unref)kill.unref();
  });return s.stopped;
 }
 function fail(s,message){reply(s,{ok:false,error:message});return stop(s);}
 function launch(s,req){
  const text=config(req,'SESSION');fs.accessSync(native,fs.constants.X_OK);
  return (queue=queue.catch(()=>{}).then(async()=>{
   if(owner&&owner!==s)await stop(owner);if(s.stopping||s.socket.destroyed)return;owner=s;
   s.dir=fs.mkdtempSync(base+'/session-');fs.chmodSync(s.dir,0o755);
   const file=path.join(s.dir,'video.conf');fs.writeFileSync(file,text.replace(/SESSION/g,s.dir),{mode:0o600});
   const env=Object.assign({},process.env);delete env.LISTEN_PID;delete env.LISTEN_FDS;delete env.LISTEN_FDNAMES;
   s.child=spawn(native,['-c',file],{stdio:['ignore','ignore','ignore'],env});
   s.child.on('error',()=>{if(!s.stopping)fail(s,'Installed Waze GPU decoder could not start');});
   s.child.on('exit',()=>{if(!s.stopping)fail(s,'Waze GPU decoder stopped; switching to JPEG');});
   let tries=0;
   const connect=()=>{
    if(s.stopping||s.socket.destroyed)return;
    if(++tries>50){fail(s,'GPU decoder did not become ready');return;}
    if(!fs.existsSync(path.join(s.dir,'native.sock'))||!fs.existsSync(path.join(s.dir,'input.h264'))){s.retry=setTimeout(connect,50);return;}
    const control=s.control=(o.connect||net.connect)(path.join(s.dir,'native.sock'));let ready=false,buffer='';
    control.on('error',()=>{control.destroy();if(ready)fail(s,'GPU decoder connection lost');else if(!s.stopping)s.retry=setTimeout(connect,50);});
    control.on('connect',()=>{
     if(s.stopping){control.destroy();return;}ready=true;control.write(JSON.stringify({cmd:'start',target:req.target})+'\n');
     reply(s,{ok:true,fifo:path.join(s.dir,'input.h264')});s.lease=setTimeout(()=>stop(s),o.initialLeaseMs||1500);
    });
    control.on('close',()=>{if(ready&&!s.stopping)fail(s,'GPU decoder connection lost');});
    control.on('data',b=>{
     buffer+=b.toString('utf8');if(buffer.length>16384){fail(s,'Invalid decoder status');return;}
     let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const v=JSON.parse(line);if(v.ev==='status')reply(s,{status:{state:v.state,target:v.target,reason:String(v.reason||'').slice(0,240)}});}catch(_){}}
    });
   };connect();
  })).catch(e=>fail(s,e.code==='ENOENT'?'Working Waze GPU decoder is not installed; JPEG is available':e.message));
 }
 const server=net.createServer(socket=>{
  const s={socket,dir:null};sessions.add(s);let body='',opened=false;
  socket.setTimeout(7000,()=>socket.destroy());socket.on('error',()=>{});socket.on('close',()=>stop(s));
  socket.on('data',b=>{
   body+=b.toString('utf8');if(body.length>2048){socket.destroy();return;}
   let at;while((at=body.indexOf('\n'))>=0){const line=body.slice(0,at);body=body.slice(at+1);
    try{const req=JSON.parse(line);
     if(req.op==='close'){stop(s);continue;}
     if(req.op==='alive'&&opened&&!s.stopping){clearTimeout(s.lease);s.lease=setTimeout(()=>stop(s),o.leaseMs||1100);continue;}
     if(opened||s.stopping)throw new Error('Video session is already open');opened=true;socket.setTimeout(0);launch(s,req);
    }catch(e){fail(s,e.message);}
   }
  });
 });
 server.maxConnections=4;server.listen(o.listen||{fd:3});
 if(!o.testing)process.on('SIGTERM',()=>Promise.all(Array.from(sessions,stop)).then(()=>server.close(()=>process.exit(0))));
 server.stopSessions=()=>Promise.all(Array.from(sessions,stop));return server;
}
if(require.main===module){try{
 if(process.argv[2]==='activate'){fs.writeFileSync('/var/opt/maxmods-video/node-path',process.execPath+'\n',{mode:0o644});console.log('{"status":"Separate Waze GPU decoder adapter ready; no firmware patches applied."}');}
 else serve();
}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={config,rect,serve};

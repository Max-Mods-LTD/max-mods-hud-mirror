// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// An optional Store tool. Changes only cluster-render's supported fps option.
// It never changes scene IDs, target ownership, stock content or the byte cap.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const BEGIN='# BEGIN MaxModsDisplay60', END='# END MaxModsDisplay60';
const BLOCK=BEGIN+'\nfps=60\n'+END+'\n';
function hash(b){return crypto.createHash('sha256').update(b).digest('hex');}
function read(file){
    try{const st=fs.lstatSync(file);if(!st.isFile()||st.size>1024*1024)throw new Error('Expected a small regular configuration file');return {bytes:fs.readFileSync(file),mode:st.mode&0o777,uid:st.uid,gid:st.gid};}
    catch(e){if(e.code==='ENOENT')return null;throw e;}
}
function atomic(file,bytes,meta){
    const tmp=file+'.maxmods-'+crypto.randomBytes(6).toString('hex');
    try{fs.writeFileSync(tmp,bytes,{flag:'wx',mode:meta?meta.mode:0o644});if(meta)fs.chownSync(tmp,meta.uid,meta.gid);fs.renameSync(tmp,file);}
    finally{try{fs.unlinkSync(tmp);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
function removeBlock(text){
    const start=text.indexOf(BEGIN),end=text.indexOf(END);
    if(start<0&&end<0)return text;
    if(start<0||end<start||text.indexOf(BEGIN,start+1)>=0||text.indexOf(END,end+1)>=0)throw new Error('Display60 configuration marker is ambiguous');
    const part=text.slice(start,end+END.length);
    if(part!==BLOCK.trim())throw new Error('Display60 block was edited; preserve it for manual review');
    return text.slice(0,start)+text.slice(end+END.length).replace(/^\n/,'');
}
function configure(root,enable,restart){
    const base=path.join(root,'var/opt/cluster-render'),file=path.join(base,'cluster-render.local.conf');
    const stateDir=path.join(root,'var/opt/maxmods-display60'),statePath=path.join(stateDir,'profile-state.json');
    if(!fs.statSync(base).isDirectory())throw new Error('Install Cluster renderer first');
    if(!fs.existsSync(stateDir))fs.mkdirSync(stateDir,0o755);
    const before=read(file),saved=read(statePath);
    let state=saved?JSON.parse(saved.bytes.toString('utf8')):null;
    const old=before?before.bytes.toString('utf8'):'';
    let clean=removeBlock(old),next;
    if(enable){
        if(!state){state={original:before?before.bytes.toString('base64'):null};}
        else if(state.installedHash!==hash(Buffer.from(old)))state.original=Buffer.from(clean).toString('base64');
        if(clean&&clean.slice(-1)!=='\n')clean+='\n';
        next=clean+BLOCK;
        state.installedHash=hash(Buffer.from(next));
        atomic(statePath,Buffer.from(JSON.stringify(state)+'\n'),saved||{mode:0o600,uid:process.getuid(),gid:process.getgid()});
    }else{
        if(!state) return {status:'No Display60 profile to remove'};
        // Restore byte-for-byte when untouched; preserve all later edits otherwise.
        next=state.installedHash===hash(Buffer.from(old))?(state.original===null?null:Buffer.from(state.original,'base64').toString('utf8')):clean;
    }
    try{
        if(next===null){if(before)fs.unlinkSync(file);}else atomic(file,Buffer.from(next),before);
        restart();
    }catch(e){
        if(before)atomic(file,before.bytes,before);else {try{fs.unlinkSync(file);}catch(_) {}}
        if(saved)atomic(statePath,saved.bytes,saved);else {try{fs.unlinkSync(statePath);}catch(_) {}}
        try{restart();}catch(_){}
        throw new Error('Renderer settings restored after restart failed: '+e.message);
    }
    if(!enable)fs.unlinkSync(statePath);
    return {status:enable?'Renderer clock requests 60 fps. Use Smooth on the phone; hardware rate requires a car test.':'Previous renderer frame-rate settings restored.'};
}
function restart(){const r=cp.spawnSync('systemctl',['restart','cluster-render.service'],{encoding:'utf8',timeout:20000});if(r.error||r.status!==0)throw new Error('Cluster renderer restart failed');}
if(require.main===module){try{const op=process.argv[2];if(op!=='enable'&&op!=='disable')throw new Error('Use enable or disable');process.stdout.write(JSON.stringify(configure('/',op==='enable',restart))+'\n');}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}}
module.exports={configure,removeBlock,BLOCK};

// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {configure,BLOCK}=require('../tools/Display60/profile.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'maxmods-profile-'));
const dir=path.join(root,'var/opt/cluster-render');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'cluster-render.local.conf');let restarts=0;
const restart=()=>{restarts++;};
try{
 const original='hud_take_over_stock=0\nfps=30';fs.writeFileSync(file,original);
 configure(root,true,restart);assert(fs.readFileSync(file,'utf8').endsWith(BLOCK));assert(fs.readFileSync(file,'utf8').includes('hud_take_over_stock=0'));
 configure(root,true,restart);assert.strictEqual(fs.readFileSync(file,'utf8').split('BEGIN').length,2);
 configure(root,false,restart);assert.strictEqual(fs.readFileSync(file,'utf8'),original);
 fs.unlinkSync(file);configure(root,true,restart);configure(root,false,restart);assert(!fs.existsSync(file));
 fs.writeFileSync(file,original+'\n');configure(root,true,restart);fs.appendFileSync(file,'fade_ms=100\n');configure(root,false,restart);assert.strictEqual(fs.readFileSync(file,'utf8'),original+'\nfade_ms=100\n');
 configure(root,true,restart);fs.appendFileSync(file,'slow_flush_ms=120\n');configure(root,true,restart);configure(root,false,restart);assert(fs.readFileSync(file,'utf8').includes('slow_flush_ms=120'),'Reinstall lost a later edit');
 const before=fs.readFileSync(file);assert.throws(()=>configure(root,true,()=>{throw new Error('failure');}),/restored/);assert(fs.readFileSync(file).equals(before));
 fs.unlinkSync(file);fs.symlinkSync('/etc/passwd',file);assert.throws(()=>configure(root,true,restart),/regular/);
 console.log('PASS Display60 activation, idempotence, exact restore, preserving later edits, restart rollback and symlink refusal ('+restarts+' simulated restarts)');
}finally{fs.rmSync(root,{recursive:true,force:true});}

// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Exercise the real Store reader/packer/planner, not an imitation of its schema.
// MGU_STORE_CHECKOUT points to a checkout of robertnisipeanu/mgu-store.
const assert=require('assert'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),upstream=path.resolve(process.env.MGU_STORE_CHECKOUT||path.join(root,'..','upstream-mgu-store'));
const runtime=path.join(upstream,'native/mgu-updater/js');
if(!fs.existsSync(path.join(runtime,'sources.js')))throw Error('Set MGU_STORE_CHECKOUT to a robertnisipeanu/mgu-store checkout to run the Store integration check');
const sources=require(path.join(runtime,'sources.js')),{Updater}=require(path.join(runtime,'updater.js')),tar=require(path.join(runtime,'tar.js'));
const reader=sources.reader({type:'file',path:root},{maxRepoBytes:8<<20,maxBuildBytes:8<<20});
const stock={'cluster-render':'0.3.7','mgu-render':'0.2.0','mgu-deploy':'0.7.11'};
function plannerFor(components,oldConnect){
 const planner=Object.create(Updater.prototype),installed=Object.assign({'maxmods_hud_mirror':'0.4.0'},stock,oldConnect?{'maxmods-connect':'0.1.0'}:{});
 const rows=new Map(components.map(entry=>[entry.id,{entry,source:'maxmods'}]));
 Object.assign(planner,{unit:{hmi:'ID7'},providers:{},src:new Map([['maxmods',{}]]),
  installedOf:id=>installed[id]?{version:installed[id]}:null,resolved:()=>rows,defs:()=>[{id:'maxmods'}]});
 return planner;
}
(async()=>{
 const catalog=await reader.catalog();
 assert.deepStrictEqual(catalog.skipped,[],'The Store silently omitted source components: '+catalog.skipped.join('; '));
 assert.deepStrictEqual(catalog.components.map(c=>c.id).sort(),['maxmods-connect','maxmods-display60','maxmods-video','maxmods_hud_mirror'].sort());
 const app=catalog.components.find(c=>c.id==='maxmods_hud_mirror');
 assert.strictEqual(app.version,JSON.parse(fs.readFileSync(path.join(root,'release_notes.json'))).releases[0].version);
 for(const oldConnect of [false,true]){
  const planner=plannerFor(catalog.components,oldConnect),plan=planner.installPlan({entry:app,source:'maxmods'},[]);
  assert.deepStrictEqual(plan.map(s=>s.id),['maxmods-connect','maxmods-video','maxmods_hud_mirror'],'Helpers must install/update before the app');
 }
 for(const entry of catalog.components){
  const files=await reader.files(null,()=>{},entry.path);
  const packed=sources.packComponent(entry,sources.subtree(files,entry.path));
  const members=await tar.untgz(packed,8<<20),byName=new Map(members.map(f=>[f.name,f]));
  if(entry.kind==='tool'){
   const manifest=JSON.parse(byName.get('component.json').data);
   assert.strictEqual(manifest.id,entry.id);assert.strictEqual(manifest.version,entry.version);assert(!('build' in manifest));
   for(const f of manifest.files){const data=byName.get('files/'+f.path);assert(data);assert.strictEqual(crypto.createHash('sha256').update(data.data).digest('hex'),f.sha256);assert.strictEqual(data.mode,parseInt(f.mode,8));}
   for(const u of manifest.units)assert(byName.has('units/'+u.name));
  }else assert(byName.has('mgu-app.json'));
 }
 // Reproduce the precise old regression so this check cannot pass while
 // testing a different catalog-reader path.
 const broken=JSON.parse(fs.readFileSync(path.join(root,'mgu-repo.json'),'utf8'));
 broken.components.filter(c=>c.kind==='tool').forEach(c=>c.build='unit');
 const before=await sources.repoCatalog(rel=>rel==='mgu-repo.json'?Promise.resolve(Buffer.from(JSON.stringify(broken))):fs.promises.readFile(path.join(root,rel)),null,null);
 assert.strictEqual(before.components.length,1);assert.strictEqual(before.skipped.length,3);assert(before.skipped.every(s=>/a tool in a repo tree needs no build step/.test(s)));
 const missing=plannerFor(before.components,false);assert.throws(()=>missing.installPlan({entry:before.components[0],source:'maxmods'},[]),/needs maxmods-connect 0.2.0 or newer, which no source has/);
 console.log('PASS real Store source listing: all four components visible with no skipped tools');
 console.log('PASS real dependency planner: Connect and GPU Video install/update before HUD Mirror');
 console.log('PASS real Store packing: app/helpers, units, file checksums and permissions');
 console.log('PASS reproduced the reported missing-Connect failure with the old metadata');
})().catch(e=>{console.error(e);process.exitCode=1;});

// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('assert'),vm=require('vm'),fs=require('fs'),EventEmitter=require('events');
const {ParkGuard}=require('../car/src/park_guard.js');const {MirrorController}=require('../car/src/mirror_controller.js');
class Online extends EventEmitter{constructor(){super();this.reports=[];}registerActive(){this.reports.push('active');return Promise.resolve();}registerHmiVisible(){this.reports.push('visible');return Promise.resolve();}unregisterHmiVisible(){this.reports.push('hidden');return Promise.resolve();}initialized(){return Promise.resolve();}destroyBundles(){return Promise.resolve();}}
class Qr extends EventEmitter{close(){this.closed=true;this.url=null;}start(){return Promise.resolve();}}
class Dash{show(v){this.visible=v;}render(){}connect(){}close(){}}
class Signals{constructor(g,changed){this.errors=[];this.changed=changed;}start(){}close(){return Promise.resolve();}}
const modules={'oap-sdk/src/core/OnlineApp.js':Online,'oap-sdk/src/logging/logging':{getSDKLogger:()=>({error(){},warn(){}})},'./park_guard.js':{ParkGuard},'./mirror_controller.js':{MirrorController},'./vehicle_signals.js':{VehicleSignals:Signals},'./qr_pairing.js':{QrPairing:Qr},'./dashboard.js':{Dashboard:Dash},'./mgu_render_client.js':{RenderClient:{available:()=>true}},'./release_notes.js':require('../car/src/release_notes.js'),'./speller.js':{spell:()=>Promise.resolve(null)}};
const source=fs.readFileSync(require.resolve('../car/src/app.js'),'utf8').split('\nconst app = new HudMirrorApp();')[0]+'\nmodule.exports=HudMirrorApp;';
const box={module:{exports:{}},require:n=>{if(!(n in modules))throw new Error(n);return modules[n];},setTimeout,clearTimeout,setInterval,clearInterval,process:{exit(){}}};vm.runInNewContext(source,box);const App=box.module.exports;
(async()=>{
 const a=new App();a.mirror.running=true;a.hide();assert(a.mirror.running,'Leaving the page stopped a background mirror');assert(a.qr.closed&&!a.dashboard.visible);assert(a.reports.includes('active')&&a.reports.includes('hidden'));
 a.background=false;a.hide();assert(!a.mirror.running,'Disabling background failed to stop on page hide');
 a.background=true;a.mirror.running=true;a.guard.updateSpeed({speedVehicleCentreOfGravity:64});a.signals.changed();assert(!a.mirror.running,'A hidden app bypassed the live movement guard');a.mirror.close();
 const b=new App(),rows=new Map();let opened=null,mapped=null;
 function row(n){if(!rows.has(n)){const r=new EventEmitter();r.getId=()=>rows.size+10;r.setValue=()=>Promise.resolve();r.updateResources=()=>Promise.resolve();rows.set(n,r);}return rows.get(n);}
 b.rhmiApplication=new EventEmitter();b.rhmiApplication.getByName=row;b.rhmiApplication.mapEntryState=(uuid,state)=>{mapped=state;return Promise.resolve();};b.rhmiApplication.openState=n=>{opened=n;return Promise.resolve();};
 b.appDescription={application:{entryPoints:[{uuid:'test'}]}};b.getEntryPoints=()=>[{getDescription:()=>({uuid:'test',textId:'title',icon:'icon'}),init:()=>Promise.resolve(),entryPoint:{setText:()=>Promise.resolve(),setIcon:()=>Promise.resolve()},setAvailability:()=>Promise.resolve()}];
 await b.initUi();assert.strictEqual(mapped,row('ST_MaxModsDashboard'));assert(b.dashboard.visible);
 rows.get('mirrorStandard').emit('action');await Promise.resolve();assert.strictEqual(opened,'ST_MaxModsHudMirror');assert(!b.dashboard.visible);
 await b.shutdown();
 console.log('PASS background page changes, foreground-only mode, live hidden-page safety and native dashboard/fallback navigation');
})().catch(e=>{console.error(e);process.exitCode=1;});

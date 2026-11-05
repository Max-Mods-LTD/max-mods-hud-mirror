// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('assert'),vm=require('vm'),fs=require('fs'),EventEmitter=require('events');
const {ParkGuard}=require('../car/src/park_guard.js'),{MirrorController}=require('../car/src/mirror_controller.js');
let exits=0,resumeInfo=null,starts=0,ccu;
class Online extends EventEmitter{
 constructor(){super();this.reports=[];}registerActive(){this.reports.push('active');return Promise.resolve();}
 registerHmiVisible(){this.reports.push('visible');return Promise.resolve();}unregisterHmiVisible(){this.reports.push('hidden');return Promise.resolve();}
 initialized(){return Promise.resolve();}destroyBundles(){this.destroyed=true;return Promise.resolve();}
}
class Dash{
 constructor(){this.gpu={grab(){}};}show(v){this.visible=v;}render(){}connect(){}close(){this.closed=true;}
 frontCcu(v){this.ccu=v;}proxyPress(i){this.pressed=i;}proxyFocus(i,v){if(v)this.focused=i;}
}
class Signals{constructor(g,changed){this.errors=[];this.changed=changed;}start(){}close(){this.closed=true;return Promise.resolve();}}
class Phone{resume(){return Promise.resolve(resumeInfo);}close(){this.closed=true;}}
class Saved{constructor(){this.value=null;}save(p){this.value=p;}forget(){this.value=null;}}
class Settings{constructor(){this.value={target:'hud',layout:'compact',background:true,hardware:true};}save(v){this.value=v;}}
const proxy={init:()=>Promise.resolve(),waitUntilAvailable:()=>Promise.resolve(),statusRotaryEncoderState:{subscribe:f=>{ccu=f;return Promise.resolve();}},shutdown(){this.closed=true;return Promise.resolve();}};
const modules={
 'oap-sdk/src/core/OnlineApp.js':Online,'oap-sdk/src/logging/logging':{getSDKLogger:()=>({error(){},warn(){}})},
 'oap-sdk/src/someip/someipBuilders':{buildTypedProxy:n=>{assert(/FrontCCU$/.test(n));return Promise.resolve(proxy);}},
 './park_guard.js':{ParkGuard},'./mirror_controller.js':{MirrorController},'./phone_client.js':{PhoneClient:Phone},
 './vehicle_signals.js':{VehicleSignals:Signals,nativeTick:fn=>Promise.resolve().then(fn),withSignalTimeout:p=>p},
 './connection_guide.js':require('../car/src/connection_guide.js'),'./dashboard.js':{Dashboard:Dash},'./mgu_render_client.js':{RenderClient:{available:()=>true}},
 './idrive_renderer.js':{IdriveRenderer:class{}},'./gpu_video_renderer.js':{GpuVideoRenderer:{available:()=>false}},
 './saved_phone.js':{SavedPhone:Saved,SavedSettings:Settings},'./release_notes.js':require('../car/src/release_notes.js'),'./speller.js':{spell:()=>Promise.resolve(null)}
};
const source=fs.readFileSync(require.resolve('../car/src/app.js'),'utf8').split('\nconst app = new HudMirrorApp();')[0]+'\nmodule.exports=HudMirrorApp;';
const box={module:{exports:{}},require:n=>{if(!(n in modules))throw new Error(n);return modules[n];},setTimeout,clearTimeout,setInterval,clearInterval,process:{exit(){exits++;}}};
vm.runInNewContext(source,box);const App=box.module.exports;
const turn=()=>new Promise(r=>setImmediate(r));
const park=a=>{a.guard.updateSpeed({speedVehicleCentreOfGravity:0});a.guard.updateStage({statusActualStageDrive:'P'},'statusActualStageDrive');};
(async()=>{
 const a=new App();a.mirror.running=true;a.hide();assert(a.mirror.running);assert(!('qr' in a)&&!a.dashboard.visible);assert(a.reports.includes('active')&&a.reports.includes('hidden'));
 a.background=false;a.hide();assert(!a.mirror.running);a.background=true;a.mirror.running=true;a.guard.updateSpeed({speedVehicleCentreOfGravity:64});a.signals.changed();assert(!a.mirror.running);await a.shutdown();
 console.log('PASS background page changes retain the mirror while movement and foreground-only mode stop it');
 const b=new App(),rows=new Map();let opened=null,mapped=null,closed=null;
 function row(n){if(!rows.has(n)){const r=new EventEmitter(),id=rows.size+10;r.getId=()=>id;r.setValue=(i,k,v)=>{r.label=v;return Promise.resolve();};r.setProperty=(k,v)=>{r[k]=v;return Promise.resolve();};r.updateResources=()=>Promise.resolve();rows.set(n,r);}return rows.get(n);}
 b.rhmiApplication=new EventEmitter();Object.assign(b.rhmiApplication,{getByName:row,mapEntryState:(uuid,state)=>{mapped=state;return Promise.resolve();},openState:n=>{opened=n;return Promise.resolve();},closeState:n=>{closed=n;return Promise.resolve();}});
 b.appDescription={application:{entryPoints:[{uuid:'test'}]}};b.getEntryPoints=()=>[{getDescription:()=>({uuid:'test',textId:'title',icon:'icon'}),init:()=>Promise.resolve(),entryPoint:{setText:()=>Promise.resolve(),setIcon:()=>Promise.resolve()},setAvailability:()=>Promise.resolve()}];
 await b.initUi();await turn();assert.strictEqual(mapped,row('ST_MaxModsDashboard'));assert(b.dashboard.visible&&ccu);
 ccu({frontRotaryEncoderOperation:12});assert.strictEqual(b.dashboard.ccu.frontRotaryEncoderOperation,12);
 rows.get('dashboardAction4').emit('focus',{value:1});rows.get('dashboardAction4').emit('action');assert.strictEqual(b.dashboard.focused,4);assert.strictEqual(b.dashboard.pressed,4);
 await b.chooseDisplay();assert.strictEqual(opened,'ST_MaxModsDisplayPicker');assert(!b.dashboard.visible&&b._selecting);
 b.mirror.setTarget('map');await b.closePicker(opened);assert.strictEqual(closed,opened);assert(b.dashboard.visible&&!b._selecting);assert.strictEqual(b.settings.value.target,'map');
 await b.chooseDiagnostics();assert.strictEqual(opened,'ST_MaxModsDiagnostics');assert(/unknown/.test(rows.get('diagSpeed').label));assert(/missing/.test(rows.get('diagPark').label));
 b.retryConnection();assert(/Pair the phone first/.test(b.mirror.status));await b.closePicker(opened);
 await b.chooseGuide();assert.strictEqual(opened,'ST_MaxModsConnectionGuide');assert(/BMW Wi-Fi/.test(rows.get('guideLine1').label));b.guideStep(1);assert(/COM/.test(rows.get('guideLine1').label));b.guideStep(-1);assert.strictEqual(b._guideIndex,0);await b.closePicker(opened);
 await b.forceClose();assert(b._done&&b.dashboard.closed&&b.signals.closed&&proxy.closed&&b.destroyed);assert(exits>=2);
 console.log('PASS OEM display picker, native controller/focus buttons and Force close release only this app resources');
 const c=new App();park(c);c.mirror.start=()=>{starts++;c.mirror.running=true;return Promise.resolve();};
 const phone={host:'10.1.2.3',resume:'a'.repeat(32),token:'b'.repeat(32),width:768,height:432,fps:30,format:'jpeg'};
 c.mirror.pairing=phone;c.linked();assert.strictEqual(starts,1);assert.strictEqual(c.saved.value.resume,phone.resume);
 c.stopMirror();resumeInfo=phone;c.resumePhone();await turn();assert.strictEqual(starts,1,'Stop must not restart the same capture');
 resumeInfo=Object.assign({},phone,{token:'c'.repeat(32)});c.resumePhone();await turn();assert.strictEqual(starts,2,'New phone capture should need no second Start');
 c.stopMirror();c.guard.invalidate();resumeInfo=Object.assign({},phone,{token:'d'.repeat(32)});c.resumePhone();await turn();assert.strictEqual(starts,2);assert(c._pendingSession);
 park(c);c.maybeStart();assert.strictEqual(starts,3);await c.shutdown();
 console.log('PASS linked one-Start workflow, no auto-restart after Stop, and real Park required before pending auto-start');
})().catch(e=>{console.error(e);process.exitCode=1;});

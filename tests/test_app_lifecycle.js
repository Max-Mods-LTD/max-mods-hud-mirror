// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('assert'),vm=require('vm'),fs=require('fs'),EventEmitter=require('events');
const {ParkGuard}=require('../car/src/park_guard'),{MirrorController}=require('../car/src/mirror_controller'),{nativeTick}=require('../car/src/vehicle_signals');
let exits=0,resumeInfo=null,starts=0,videoConnections=0;
class Online extends EventEmitter{
 constructor(){super();this.reports=[];}registerActive(){this.reports.push('active');return Promise.resolve();}
 registerHmiVisible(){this.reports.push('visible');return Promise.resolve();}unregisterHmiVisible(){this.reports.push('hidden');return Promise.resolve();}
 initialized(){return Promise.resolve();}destroyBundles(){this.destroyed=true;return Promise.resolve();}
}
class Video extends EventEmitter{constructor(back,changed){super();this.back=back;this.changed=changed;}show(v){this.visible=v;}ensureReady(){videoConnections++;return Promise.resolve();}close(){this.closed=true;}}
class Signals{constructor(g,changed){this.errors=[];this.changed=changed;}start(){}close(){this.closed=true;return Promise.resolve();}}
class Phone{resume(){return Promise.resolve(resumeInfo);}stats(){return Promise.resolve({captureFps:60,wireFps:30,kbps:1200,targetFps:60,format:'jpeg'});}close(){this.closed=true;}}
class Saved{constructor(){this.value=null;}save(p){this.value=p;}forget(){this.value=null;}}
class Settings{constructor(){this.value={target:'hud',layout:'compact',background:true,hardware:true};}save(v){this.value=v;}}
const modules={
 'oap-sdk/src/core/OnlineApp.js':Online,'oap-sdk/src/logging/logging':{getSDKLogger:()=>({error(){},warn(){}})},
 './park_guard.js':{ParkGuard},'./mirror_controller.js':{MirrorController},'./phone_client.js':{PhoneClient:Phone},
 './vehicle_signals.js':{VehicleSignals:Signals,nativeTick:fn=>Promise.resolve().then(fn),withSignalTimeout:(p,ms)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Native HMI timed out')),ms>=5000?1000:35);p.then(v=>{clearTimeout(t);resolve(v);},e=>{clearTimeout(t);reject(e);});})},
 './connection_guide.js':require('../car/src/connection_guide.js'),'./native_video.js':{NativeVideo:Video},
 './idrive_renderer.js':{IdriveRenderer:class{}},'./gpu_video_renderer.js':{GpuVideoRenderer:{available:()=>false}},
 './saved_phone.js':{SavedPhone:Saved,SavedSettings:Settings},'./release_notes.js':require('../car/src/release_notes.js'),'./speller.js':{spell:()=>Promise.resolve(null)}
};
const source=fs.readFileSync(require.resolve('../car/src/app.js'),'utf8').split('\nconst app = new HudMirrorApp();')[0]+'\nmodule.exports=HudMirrorApp;';
const box={module:{exports:{}},require:n=>{if(!(n in modules))throw new Error(n);return modules[n];},setImmediate,setTimeout,clearTimeout,setInterval,clearInterval,process:{exit(){exits++;}}};
vm.runInNewContext(source,box);const App=box.module.exports,turn=()=>new Promise(r=>setImmediate(r));
const park=a=>{a.guard.updateSpeed({speedVehicleCentreOfGravity:0});a.guard.updateStage({statusActualStageDrive:'P'},'statusActualStageDrive');};
const manifest=require('../car/mgu-app.json');const ui=require('../car/'+manifest.tree+'/rhmiData/uiDescriptions/ID7/uiDescription.json');
function fixture(a){
 const rows=new Map(),loaded=[],opened=[],closed=[];let mapped;
 Object.keys(ui.containers).forEach(id=>{const s=ui.containers[id],page=new EventEmitter();page.getId=()=>Number(id);page.updateResources=()=>{loaded.push(s.name);return Promise.resolve();};rows.set(s.name,page);
  Object.keys(s.components).forEach(cid=>{const c=s.components[cid],r=new EventEmitter();r.getId=()=>Number(cid);r.setValue=(i,k,v)=>{r.label=v;return Promise.resolve();};r.setProperty=(k,v)=>{r[k]=v;return Promise.resolve();};rows.set(c.name,r);});});
 a.rhmiApplication=new EventEmitter();Object.assign(a.rhmiApplication,{getByName:n=>rows.get(n)||null,mapEntryState:(uuid,state)=>{assert.strictEqual(loaded.length,10,'Entry offered before native pages loaded');mapped=state;return Promise.resolve();},openState:n=>{opened.push(n);return Promise.resolve();},closeState:n=>{closed.push(n);return Promise.resolve();},openEntryState:()=>Promise.resolve()});
 a.appDescription={application:{entryPoints:[{uuid:'test'}]}};a.getEntryPoints=()=>[{getDescription:()=>({uuid:'test',textId:'title',icon:'icon'}),init:()=>Promise.resolve(),entryPoint:{setText:()=>Promise.resolve(),setIcon:()=>Promise.resolve()},setAvailability:()=>Promise.resolve()}];
 return {rows,loaded,opened,closed,mapped:()=>mapped};
}
(async()=>{
 const a=new App();a.mirror.running=true;a.hide();assert(a.mirror.running&&!a.video.visible);assert(a.reports.includes('active')&&a.reports.includes('hidden'));
 a.background=false;a.hide();assert(!a.mirror.running);a.background=true;a.mirror.running=true;a.guard.updateSpeed({speedVehicleCentreOfGravity:64});a.signals.changed();assert(!a.mirror.running);await a.shutdown();
 console.log('PASS background page changes retain output while movement and foreground-only mode stop it');
 const b=new App(),f=fixture(b);b._menuTimeout=35;park(b);await b.initUi();await turn();assert.strictEqual(f.mapped(),f.rows.get('ST_MaxModsHudMirror'));assert.strictEqual(videoConnections,0,'Native menus must not start an idle GPU renderer');
 await b.chooseSettings();assert.strictEqual(b._page,'ST_MaxModsSettingsHub');
 await b.press('settingsVideo',b._actions[48].fn);assert.strictEqual(b._page,'ST_MaxModsSettingsPicker');
 await b.press('settingsBack',b._actions[1526].fn);assert.strictEqual(b._page,'ST_MaxModsSettingsHub');
 await b.press('hubBack',b._actions[50].fn);assert.strictEqual(b._page,'ST_MaxModsHudMirror');
 await b.chooseDisplay();assert.strictEqual(b._page,'ST_MaxModsDisplaySettings');await b.openPage('ST_MaxModsDisplayPicker');
 await b.press('pickCluster',b._actions[1501].fn);assert.strictEqual(b.mirror.target,'map');assert.strictEqual(b._page,'ST_MaxModsDisplaySettings');assert.strictEqual(b.settings.value.target,'map');
 await b.chooseLayout();assert.strictEqual(b._page,'ST_MaxModsLayoutPicker');await b.press('pickFull',b._actions[1511].fn);assert.strictEqual(b.mirror.layout,'full');assert.strictEqual(f.loaded.length,10,'Click must not load resources behind a hidden surface');
 await b.chooseDiagnostics();assert(/0 km/.test(f.rows.get('diagSpeed').label));b.readPhoneStats();await turn();await b.closePage('ST_MaxModsDiagnostics');
 await b.chooseGuide();assert(/BMW Wi-Fi/.test(f.rows.get('guideLine1').label));b.guideStep(1);assert(/COM/.test(f.rows.get('guideLine1').label));b.guideStep(-1);await b.closePage('ST_MaxModsConnectionGuide');
 console.log('PASS real native UI schema, preloaded resources, BMW selection actions, saved choices and guide navigation');
 const open=b.rhmiApplication.openState;b.mirror.running=true;
 b.rhmiApplication.openState=n=>n==='ST_MaxModsLayoutPicker'?Promise.reject(new Error('Refused')):open(n);
 assert.strictEqual(await b.chooseLayout(),false);assert.strictEqual(b._page,'ST_MaxModsHudMirror');assert(!b._navigating&&!b.video.visible&&b.mirror.running,'Failed menu opening lost the native controls or stopped HUD video');
 b.rhmiApplication.openState=n=>n==='ST_MaxModsSettingsHub'?new Promise(()=>{}):open(n);
 b.mirror.note('Streaming');const hanging=b.chooseSettings();await turn();await nativeTick(()=>{});assert.strictEqual(b.mirror.status,'Streaming','A hung menu held the vehicle signal queue');
 assert.strictEqual(await hanging,false);assert(!b._navigating&&b._page==='ST_MaxModsHudMirror');
 b.rhmiApplication.openState=open;await b.chooseSettings();assert.strictEqual(b._page,'ST_MaxModsSettingsHub');
 b.rhmiApplication.closeState=()=>Promise.reject(new Error('Close refused'));await b.closePage(b._page);assert(!b._navigating&&b._page==='ST_MaxModsHudMirror');
 let late;b.rhmiApplication.openState=n=>n==='ST_MaxModsLayoutPicker'?new Promise(r=>{late=r;}):open(n);
 const first=b.chooseLayout();await turn();await b.chooseGuide();late();await first;assert.strictEqual(b._page,'ST_MaxModsConnectionGuide','Late navigation replaced the newer page');
 b.pageVisible('ST_MaxModsConnectionGuide',false);b.pageVisible('ST_MaxModsHudMirror',true);assert(b._visible&&b.mirror.running&&!b.video.visible);
 b.mirror.target='idrive';b.video.surface={id:201};await b.showVideo();assert.strictEqual(b._page,'ST_MaxModsVideo');
 b.video.surface=null;b.render();await turn();await turn();assert.strictEqual(b._page,'ST_MaxModsHudMirror','Lost/hidden picture left a blank video page');
 await b.forceClose();assert(b._done&&b.video.closed&&b.signals.closed&&b.destroyed&&exits>=2);
 console.log('PASS rejected/hung opening and failed Back recover, late navigation is ignored, native Back preserves output and reset closes owned resources');
 const c=new App();park(c);c.mirror.start=()=>{starts++;c.mirror.running=true;return Promise.resolve();};
 const phone={host:'10.1.2.3',resume:'a'.repeat(32),token:'b'.repeat(32),width:768,height:432,fps:30,format:'jpeg'};
 c.mirror.pairing=phone;c.linked();assert.strictEqual(starts,1);assert.strictEqual(c.saved.value.resume,phone.resume);
 c.stopMirror();resumeInfo=phone;c.resumePhone();await turn();assert.strictEqual(starts,1);
 resumeInfo=Object.assign({},phone,{token:'c'.repeat(32)});c.resumePhone();await turn();assert.strictEqual(starts,2);
 c.stopMirror();resumeInfo=Object.assign({},phone,{host:'10.1.2.9',token:'c'.repeat(32)});c.resumePhone();await turn();assert.strictEqual(c.saved.value.host,'10.1.2.9','Rediscovered address was not remembered');
 c.stopMirror();c.guard.invalidate();resumeInfo=Object.assign({},phone,{token:'d'.repeat(32)});c.resumePhone();await turn();assert.strictEqual(starts,2);assert(c._pendingSession);park(c);c.maybeStart();assert.strictEqual(starts,3);await c.shutdown();
 console.log('PASS linked one-Start, Stop suppression and genuine Park before pending start');
})().catch(e=>{console.error(e);process.exitCode=1;});

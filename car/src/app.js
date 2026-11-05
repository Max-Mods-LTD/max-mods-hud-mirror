// SPDX-License-Identifier: GPL-3.0-or-later
// Native RHMI controls follow the public Store and Waze app examples.
'use strict';
const OnlineApp=require('oap-sdk/src/core/OnlineApp.js'),logging=require('oap-sdk/src/logging/logging');
const {spell}=require('./speller.js'),{ParkGuard}=require('./park_guard.js');
const {VehicleSignals}=require('./vehicle_signals.js');
const {MirrorController}=require('./mirror_controller.js'),{PhoneClient}=require('./phone_client.js');
const {NativeVideo}=require('./native_video.js'),{IdriveRenderer}=require('./idrive_renderer.js'),{GpuVideoRenderer}=require('./gpu_video_renderer.js');
const {SavedPhone,SavedSettings}=require('./saved_phone.js'),release=require('./release_notes.js'),guide=require('./connection_guide.js');
const logger=logging.getSDKLogger(),STATE='ST_MaxModsHudMirror',VIDEO='ST_MaxModsVideo';
const PAGES=[STATE,VIDEO,'ST_MaxModsDisplayPicker','ST_MaxModsLayoutPicker','ST_MaxModsSettingsPicker','ST_MaxModsDiagnostics','ST_MaxModsConnectionGuide','ST_MaxModsDisplaySettings','ST_MaxModsUpdates'];
const NAMES=['mirrorStatus','mirrorPark','mirrorPhone','mirrorVersion','mirrorStart','mirrorStop','mirrorPair','mirrorView','mirrorTarget','mirrorSettings','mirrorGuide','mirrorDiagnostics','mirrorUpdates','mirrorTest','mirrorForceClose',
 'videoBack','videoStop','pickHud','pickCluster','pickIdrive','pickCompact','pickFull','pickAutoGpu','pickJpeg','pickBackground','pickProfile','pickForget','pickDiagnostics','settingsBack',
 'diagOutput','diagRate','diagPhone','diagCapture','diagPhoneRate','diagTraffic','diagSpeed','diagPark','diagIssue','diagIssue2','diagSignals','diagReconnect','diagBack',
 'guideTitle','guideLine1','guideLine2','guideLine3','guideLine4','guidePrevious','guideNext','guideBack','displayTarget','mirrorLayout','displayTest','displayBack',
 'mirrorWhatsNew','mirrorReleaseLine1','mirrorReleaseLine2','mirrorReleasePrevious','mirrorReleaseNext','updatesBack'];
const trueValue=v=>v===true||v===1||v==='1';
class HudMirrorApp extends OnlineApp{
 constructor(){
  super();this._ui={};this._written={};this._actions={};this._pressAt={};this._parents={};this._done=false;this._spelling=false;this._navigating=false;this._navEpoch=0;this._page=STATE;this._visible=false;this._releaseIndex=0;this._guideIndex=0;
  this.saved=new SavedPhone();this.settings=new SavedSettings();this.background=this.settings.value.background;
  this.guard=new ParkGuard();this.mirror=new MirrorController(this.guard,this.settings.value);this.mirror.hardware=this.settings.value.hardware;
  this.video=new NativeVideo(()=>this.closePage(VIDEO),()=>this.render(),logger);
  this.mirror.makeCentral=()=>{this._showVideoRequested=true;return new IdriveRenderer(this.video);};
  this.mirror.makeGpu=(target,layout,paired)=>new GpuVideoRenderer(target,layout,paired);this.mirror.canGpu=()=>GpuVideoRenderer.available();
  this.signals=new VehicleSignals(this.guard,()=>{this.mirror.checkPark();this.maybeStart();this.render();});
  this.mirror.on('change',()=>this.render());
  this.on('initialized',()=>this.initUi().catch(e=>{logger.error('HUD Mirror init: '+e.message);this.mirror.close();this.video.close();}));
  this.on('entryPointExecute',uuid=>{this._visible=true;this._showVideoRequested=false;this.video.show(false);this.reportVisibility(true);if(this.rhmiApplication)this.openEntry(uuid);});
  this.on('changeVisibility',d=>{if(d&&d.visible===false&&!this._spelling&&!this._navigating)this.hide();});
  this.on('shutdown',()=>this.shutdown());this.on('error',e=>logger.warn('HUD Mirror: '+e.message));
 }
 hmi(fn,ms){
  // HMI waits must not hold VehicleSignals' native queue: speed/Park checks
  // must keep running even if BMW never answers a menu request.
  return new Promise((resolve,reject)=>{let done=false;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(value);};
   const timer=setTimeout(()=>finish(new Error('BMW menu request timed out')),ms||this._menuTimeout||1800);
   setImmediate(()=>Promise.resolve().then(fn).then(v=>finish(null,v),e=>finish(e)));
  });
 }
 initUi(){
  if(!this.rhmiApplication)return this.initialized();const rhmi=this.rhmiApplication;
  PAGES.forEach(name=>{const page=rhmi.getByName(name);if(!page)throw new Error('Missing native page '+name);page.on('visible',ev=>this.pageVisible(name,trueValue(ev&&ev.visible)));});
  NAMES.forEach(n=>{this._ui[n]=rhmi.getByName(n);if(!this._ui[n])throw new Error('Missing UI control '+n);});
  const bind=(n,fn)=>this.bind(n,fn);
  bind('mirrorStart',()=>this.mirror.starting?this.stopMirror():this.startMirror(false));bind('mirrorStop',()=>this.stopMirror());bind('mirrorPair',()=>this.pairPhone());
  bind('mirrorView',()=>this.showVideo());bind('mirrorTarget',()=>this.chooseDisplay());bind('mirrorSettings',()=>this.chooseSettings());bind('mirrorGuide',()=>this.chooseGuide());
  bind('mirrorDiagnostics',()=>this.chooseDiagnostics());bind('mirrorUpdates',()=>this.openPage('ST_MaxModsUpdates'));bind('mirrorTest',()=>this.startMirror(true));bind('mirrorForceClose',()=>this.forceClose());
  bind('videoBack',()=>this.closePage(VIDEO));bind('videoStop',()=>this.stopMirror());
  bind('displayTarget',()=>this.openPage('ST_MaxModsDisplayPicker'));bind('mirrorLayout',()=>this.chooseLayout());bind('displayTest',()=>this.startMirror(true));bind('displayBack',()=>this.closePage('ST_MaxModsDisplaySettings'));
  const choices={ST_MaxModsDisplayPicker:[['pickHud',()=>this.mirror.setTarget('hud')],['pickCluster',()=>this.mirror.setTarget('map')],['pickIdrive',()=>this.mirror.setTarget('idrive')]],
   ST_MaxModsLayoutPicker:[['pickCompact',()=>{if(this.mirror.layout!=='compact')return this.mirror.toggleLayout();}],['pickFull',()=>{if(this.mirror.layout!=='full')return this.mirror.toggleLayout();}]]};
  Object.keys(choices).forEach(page=>choices[page].forEach(row=>bind(row[0],()=>Promise.resolve(row[1]()).then(()=>this.closePage(page)))));
  bind('pickAutoGpu',()=>this.mirror.setHardware(true));bind('pickJpeg',()=>this.mirror.setHardware(false));bind('pickBackground',()=>this.toggleBackground());
  bind('pickForget',()=>{this.stopMirror();this.mirror.pairing=null;this.saved.forget();this.render();});bind('pickDiagnostics',()=>this.chooseDiagnostics());bind('settingsBack',()=>this.closePage('ST_MaxModsSettingsPicker'));
  bind('diagReconnect',()=>this.retryConnection());bind('diagBack',()=>this.closePage('ST_MaxModsDiagnostics'));
  bind('guidePrevious',()=>this.guideStep(-1));bind('guideNext',()=>this.guideStep(1));bind('guideBack',()=>this.closePage('ST_MaxModsConnectionGuide'));
  bind('mirrorReleasePrevious',()=>this.releaseNote(-1));bind('mirrorReleaseNext',()=>this.releaseNote(1));bind('updatesBack',()=>this.closePage('ST_MaxModsUpdates'));
  rhmi.on('userEvent',ev=>{const action=ev&&ev.eventType==='ACTION'&&this._actions[Number(ev.sourceId)];if(action)this.press(action.name,action.fn);});
  rhmi.on('restoreHmi',()=>{this._written={};this.render();});
  // Load native pages before offering the entry point. Menu clicks never
  // hide a custom surface and then wait for lazy resource loading.
  return this.hmi(()=>Promise.all(PAGES.map(name=>rhmi.getByName(name).updateResources())),8000).then(()=>{
   this.render();const entries=this.appDescription&&this.appDescription.application.entryPoints||[],ep=this.getEntryPoints().find(e=>entries.some(d=>d.uuid===e.getDescription().uuid));if(!ep)throw new Error('No app entry point');const d=ep.getDescription();this._entryUuid=d.uuid;
   return this.hmi(()=>ep.init().then(()=>rhmi.mapEntryState(d.uuid,rhmi.getByName(STATE))).then(()=>ep.entryPoint.setText(d.textId)).then(()=>ep.entryPoint.setIcon(d.icon)).then(()=>ep.setAvailability('ENABLED')),5000);
  }).then(()=>{this.registerActive();return this.initialized();}).then(()=>{
   this._visible=true;this.reportVisibility(true);this.signals.start();
   this._refresh=setInterval(()=>{this.mirror.checkPark();this.maybeStart();const reason=this.guard.reason();if(reason!==this._lastGuard||this._visible&&this._page==='ST_MaxModsDiagnostics'&&Date.now()-(this._lastDiag||0)>=1000){this._lastGuard=reason;this._lastDiag=Date.now();this.render();this.readPhoneStats();}},200);
   this._autoTimer=setInterval(()=>this.resumePhone(),2000);this.resumePhone();this.render();const uuid=this.getLastExecutedEntryPointUuid&&this.getLastExecutedEntryPointUuid();if(uuid)return this.openEntry(uuid);
  });
 }
 pageVisible(name,on){
  if(this._done)return;
  if(on){clearTimeout(this._hide);this._page=name;this._visible=true;this.video.show(name===VIDEO);this.reportVisibility(true);this.render();}
  else if(this._page===name){this.video.show(false);if(!this._spelling&&!this._navigating){clearTimeout(this._hide);this._hide=setTimeout(()=>{if(this._page===name&&!this._navigating)this.hide();},500);}}
 }
 bind(name,fn){const c=this._ui[name];this._actions[Number(c.getId())]={name,fn};c.on('action',()=>this.press(name,fn));}
 press(name,fn){if(this._done||this._spelling||this._navigating||Date.now()-(this._pressAt[name]||0)<180)return;this._pressAt[name]=Date.now();try{return Promise.resolve(fn()).catch(e=>this.mirror.note(e.message));}catch(e){this.mirror.note(e.message);}}
 openEntry(uuid){const epoch=++this._navEpoch;this._navigating=true;this.video.show(false);return this.hmi(()=>this.rhmiApplication.openEntryState(uuid)).then(()=>{if(epoch===this._navEpoch){this._navigating=false;this._page=STATE;this.render();}},e=>this.recoverPage(epoch,e));}
 openPage(name){
  if(this._done)return Promise.resolve(false);const epoch=++this._navEpoch,previous=this._page;this._navigating=true;clearTimeout(this._hide);
  return this.hmi(()=>{if(!this.rhmiApplication.getByName(name))throw new Error('Native page unavailable');return this.rhmiApplication.openState(name);}).then(()=>{
   if(epoch!==this._navEpoch||this._done)return false;this._parents[name]=previous;this._page=name;this._navigating=false;this.video.show(name===VIDEO);this.render();return true;
  },e=>this.recoverPage(epoch,e));
 }
 closePage(name){
  if(this._done)return Promise.resolve(false);const epoch=++this._navEpoch,parent=this._parents[name]||STATE;this._navigating=true;clearTimeout(this._hide);this.video.show(false);
  return this.hmi(()=>this.rhmiApplication.closeState(name)).then(()=>{if(epoch!==this._navEpoch||this._done)return false;this._navigating=false;this._page=parent;this.video.show(parent===VIDEO);this.render();return true;},e=>this.recoverPage(epoch,e));
 }
 recoverPage(epoch,error){
  if(epoch!==this._navEpoch||this._done)return Promise.resolve(false);this._navEpoch++;this.video.show(false);this._showVideoRequested=false;this.mirror.note('Menu unavailable: '+error.message+'. Returning to main menu.');
  // A rejected or never-settled HMI request must release our navigation lock.
  const recovery=this._navEpoch;
  return this.hmi(()=>this.rhmiApplication.openState(STATE)).catch(()=>this.hmi(()=>this.rhmiApplication.openEntryState(this._entryUuid))).catch(e=>logger.warn('Native menu recovery: '+e.message)).then(()=>{
   if(recovery===this._navEpoch&&!this._done){this._navigating=false;this._page=STATE;this._written={};this.render();}return false;
  });
 }
 chooseDisplay(){return this.openPage('ST_MaxModsDisplaySettings');}
 chooseLayout(){return this.openPage('ST_MaxModsLayoutPicker');}
 chooseSettings(){return this.openPage('ST_MaxModsSettingsPicker');}
 chooseDiagnostics(){return this.openPage('ST_MaxModsDiagnostics');}
 chooseGuide(){return this.openPage('ST_MaxModsConnectionGuide');}
 showVideo(){this._showVideoRequested=false;if(!this.mirror.running||this.mirror.target!=='idrive'||!this.video.surface){this.mirror.note('Start mirroring to the iDrive screen first');return Promise.resolve(false);}return this.openPage(VIDEO);}
 guideStep(step){this._guideIndex=(this._guideIndex+step+guide.pages.length)%guide.pages.length;this.render();}
 linked(){const p=this.mirror.pairing;if(!p)return;this.saved.save(p);this._pendingSession=p.token;this._autoSession=p.token;this.mirror.gpuFailed=false;this.maybeStart();}
 maybeStart(){if(this._pendingSession&&this.mirror.pairing&&this._pendingSession===this.mirror.pairing.token&&this.guard.allowed()&&!this.mirror.running&&!this.mirror.starting){this._pendingSession=null;this.startMirror(false);}}
 resumePhone(){
  if(this._done||this._resumeBusy||this._spelling||this.mirror.running||this.mirror.starting||!this.saved.value)return;
  this._resumeBusy=true;const epoch=this.mirror.generation,p=this._resumeClient=new PhoneClient();
  p.resume(this.saved.value).then(info=>{if(this._done||epoch!==this.mirror.generation||this._spelling)return;this.mirror.pairing=info;if(info.token!==this._autoSession){this._autoSession=info.token;this._pendingSession=info.token;this.mirror.gpuFailed=false;this.maybeStart();this.render();}}).catch(()=>{}).then(()=>{p.close();if(this._resumeClient===p)this._resumeClient=null;this._resumeBusy=false;});
 }
 startMirror(test){if(!test&&!this.mirror.pairing){this.mirror.note('Start sharing on the linked phone, or pair it first');return;}if(!test){this._pendingSession=null;this._autoSession=this.mirror.pairing.token;}return this.mirror.start(test);}
 stopMirror(){this._pendingSession=null;this._showVideoRequested=false;if(this.mirror.pairing)this._autoSession=this.mirror.pairing.token;this.mirror.stop();}
 retryConnection(){this.stopMirror();this._autoSession=null;this.mirror.gpuFailed=false;if(!this.saved.value){this.mirror.note('Pair the phone first');return;}this.mirror.note('Checking linked phone. Start sharing on the phone if it is stopped.');this.resumePhone();}
 pairPhone(){this.stopMirror();this._spelling=true;this.video.show(false);return spell(this,'Phone address/code').then(text=>{this._spelling=false;if(!this._done&&text)return this.mirror.pair(text).then(()=>this.linked());},e=>{this._spelling=false;throw e;});}
 toggleBackground(){this.background=!this.background;this.render();}
 reportVisibility(visible){const name=visible?'registerHmiVisible':'unregisterHmiVisible';if(typeof this[name]==='function')Promise.resolve(this[name]()).catch(()=>{});if(this.background&&this.mirror.running&&typeof this.registerActive==='function')Promise.resolve(this.registerActive()).catch(()=>{});}
 write(name,value){const c=this._ui[name];if(!c||this._written[name]===value)return;this._written[name]=value;Promise.resolve(c.setValue(0,'Text',value,'Text')).catch(()=>{});}
 showControl(name,on){const c=this._ui[name],key=name+'.visible';if(c&&this._written[key]!==on&&typeof c.setProperty==='function'){this._written[key]=on;Promise.resolve(c.setProperty('Visible',on?1:0,'UInt')).catch(()=>{});}}
 releaseNote(step){this._releaseIndex=(this._releaseIndex+step+release.lines.length)%release.lines.length;this.render();}
 readPhoneStats(){
  if(!this._visible||this._statsBusy||!this.mirror.pairing||this._page!=='ST_MaxModsDiagnostics'||Date.now()-(this._statsAt||0)<2000)return;this._statsAt=Date.now();this._statsBusy=true;
  const p=this._statsClient=new PhoneClient(),token=this.mirror.pairing.token;
  p.stats(this.mirror.pairing).then(v=>{if(!this._done&&this.mirror.pairing&&this.mirror.pairing.token===token){this._phoneStats=v;this.render();}}).catch(()=>{this._phoneStats=null;}).then(()=>{p.close();this._statsBusy=false;if(this._statsClient===p)this._statsClient=null;});
 }
 render(){
  if(this._done)return;const m=this.mirror,target=m.target==='map'?'Instrument cluster':m.target==='idrive'?'iDrive screen':'Head-up display';
  this.settings.save({target:m.target,layout:m.layout,background:this.background,hardware:m.hardware});
  this.write('mirrorStatus',m.status.slice(0,95));this.write('mirrorPark',this.guard.reason()||'Stationary, Park confirmed');this.write('mirrorPhone',m.pairing?'Phone linked':'Start sharing on the phone, then Pair phone');
  this.write('mirrorStart',m.starting?'Cancel connection':'Start mirror');this.showControl('mirrorStart',!m.running);this.showControl('mirrorStop',m.running);this.showControl('mirrorView',m.running&&m.target==='idrive');
  this.write('displayTarget','Destination: '+target);this.write('mirrorLayout','Picture size: '+(m.layout==='full'?'Full display':'Compact'));
  this.write('pickHud',(m.target==='hud'?'Selected: ':'')+'Head-up display');this.write('pickCluster',(m.target==='map'?'Selected: ':'')+'Instrument cluster');this.write('pickIdrive',(m.target==='idrive'?'Selected: ':'')+'iDrive screen');
  this.write('pickCompact',(m.layout==='compact'?'Selected: ':'')+'Compact - reserve BMW information space');this.write('pickFull',(m.layout==='full'?'Selected: ':'')+'Full display - keep complete phone picture');
  this.write('pickAutoGpu',(m.hardware?'Selected: ':'')+'Automatic - hardware GPU video when available');this.write('pickJpeg',(!m.hardware?'Selected: ':'')+'JPEG compatibility mode');this.write('pickBackground','Keep mirroring on other pages: '+(this.background?'On':'Off'));
  this.write('pickProfile','Phone Display > Video quality: Smooth targets 60 fps');
  this.write('mirrorWhatsNew','Version '+release.version+' / change '+(this._releaseIndex+1)+' of '+release.lines.length);this.write('mirrorReleaseLine1',release.lines[this._releaseIndex][0]);this.write('mirrorReleaseLine2',release.lines[this._releaseIndex][1]||'');
  if(this._page==='ST_MaxModsDiagnostics'){
   const g=this.guard,age=t=>t===null?'missing':Math.max(0,(g.clock()-t)/1000).toFixed(1)+'s',issue=m.lastIssue||m.status,s=this._phoneStats;
   this.write('diagOutput','Output: '+target+' / '+(m.starting?'connecting':!m.running?'stopped':m.useGpu?'Hardware AVC':'JPEG'+(m.target==='idrive'?' / GPU surface':'')));
   this.write('diagRate','Car received: '+(m.receivedFps||0)+' fps / requested '+m.videoFps+' / '+m.videoWidth+'x'+m.videoHeight);
   this.write('diagPhone',m.pairing?'Phone: '+m.pairing.host:'Phone: not linked');this.write('diagCapture','Capture: '+m.captureState+' / retries: '+m.retryCount);
   this.write('diagPhoneRate',s?'Phone capture: '+s.captureFps+' fps / sent: '+s.wireFps+' fps':'Phone capture / sent: waiting for live statistics');
   this.write('diagTraffic',s?'Phone '+s.format+' / '+s.kbps+' kbit/s / target '+s.targetFps+' fps':'Update both apps for phone traffic statistics');
   this.write('diagSpeed','Speed: '+(g.speed===null?'unknown':g.speed+' km/h')+' / '+age(g.speedAt));this.write('diagPark','Selector: '+(g.stage||'unknown')+' / '+age(g.stageAt));
   this.write('diagIssue','Last issue: '+issue.slice(0,75));this.write('diagIssue2',issue.slice(75,160));this.write('diagSignals',(this.signals.errors.length?this.signals.errors[this.signals.errors.length-1]:'Native BMW controls / no signal setup errors').slice(0,95));
  }
  if(this._page==='ST_MaxModsConnectionGuide'){const page=guide.pages[this._guideIndex];this.write('guideTitle',page.title+' ('+(this._guideIndex+1)+'/'+guide.pages.length+')');for(let i=0;i<4;i++)this.write('guideLine'+(i+1),page.lines[i]||'');}
  if(!this._navigating&&!this._spelling&&this._visible){
   if(this._page===VIDEO&&(!m.running||!this.video.surface)){this._showVideoRequested=false;this.closePage(VIDEO);}
   else if(this._showVideoRequested&&m.running&&m.target==='idrive'&&this.video.surface){this._showVideoRequested=false;this.showVideo();}
  }
 }
 hide(){if(this._spelling||this._navigating)return;this._visible=false;this.video.show(false);this.reportVisibility(false);if(!this.background)this.stopMirror();}
 forceClose(){this.stopMirror();const deadline=setTimeout(()=>process.exit(0),1500);if(deadline.unref)deadline.unref();return this.shutdown();}
 shutdown(){if(this._done)return;this._done=true;this._navEpoch++;clearTimeout(this._hide);clearInterval(this._refresh);clearInterval(this._autoTimer);if(this._resumeClient)this._resumeClient.close();if(this._statsClient)this._statsClient.close();this.mirror.close();this.video.close();return this.signals.close().then(()=>this.destroyBundles()).catch(()=>{}).then(()=>process.exit(0));}
}
const app = new HudMirrorApp();
app.start().catch(e=>logger.error('HUD Mirror start: '+e.message));

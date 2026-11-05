// SPDX-License-Identifier: GPL-3.0-or-later
// RHMI lifecycle and controller fallback follow Robert Nisipeanu/IterioDev's Store.
'use strict';
const OnlineApp=require('oap-sdk/src/core/OnlineApp.js'),logging=require('oap-sdk/src/logging/logging');
const {spell}=require('./speller.js'),{ParkGuard}=require('./park_guard.js');
const {VehicleSignals,nativeTick,withSignalTimeout}=require('./vehicle_signals.js');
const {MirrorController}=require('./mirror_controller.js'),{PhoneClient}=require('./phone_client.js');
const {QrPairing}=require('./qr_pairing.js'),{Dashboard}=require('./dashboard.js');
const {RenderClient}=require('./mgu_render_client.js'),{IdriveRenderer}=require('./idrive_renderer.js'),{GpuVideoRenderer}=require('./gpu_video_renderer.js');
const {SavedPhone,SavedSettings}=require('./saved_phone.js'),release=require('./release_notes.js');
const logger=logging.getSDKLogger(),STATE='ST_MaxModsHudMirror';
const NAMES=['mirrorStatus','mirrorPark','mirrorPhone','mirrorTest','mirrorPair','mirrorStart','mirrorStop','mirrorLayout','mirrorTarget','mirrorBackground','mirrorQr','mirrorForceClose','mirrorDiagnostics','mirrorWhatsNew','mirrorReleaseLine1','mirrorReleaseLine2','mirrorReleasePrevious','mirrorReleaseNext'];
const trueValue=v=>v===true||v===1||v==='1';
class HudMirrorApp extends OnlineApp{
 constructor(){
  super();this._ui={};this._written={};this._actions={};this._focusActions={};this._pressAt={};this._done=false;this._spelling=false;this._selecting=false;this._visible=false;this._drawn=false;this._releaseIndex=0;this.saved=new SavedPhone();this.settings=new SavedSettings();this.background=this.settings.value.background;
  this.guard=new ParkGuard();this.mirror=new MirrorController(this.guard,this.settings.value);this.mirror.hardware=this.settings.value.hardware;this.qr=new QrPairing(this.mirror);this.dashboard=new Dashboard(this,logger);
  this.mirror.makeCentral=()=>new IdriveRenderer(this.dashboard);this.mirror.makeGpu=(target,layout,paired)=>new GpuVideoRenderer(target,layout,paired);this.mirror.canGpu=()=>GpuVideoRenderer.available();
  this.signals=new VehicleSignals(this.guard,()=>{this.mirror.checkPark();this.maybeStart();this.render();});
  this.mirror.on('change',()=>this.render());this.qr.on('change',()=>this.render());this.qr.on('paired',()=>this.linked());this.qr.on('expired',()=>this.mirror.note('QR expired. Show a new code.'));
  this.on('initialized',()=>this.initUi().catch(e=>{logger.error('HUD Mirror init: '+e.message);this.mirror.close();this.dashboard.close();}));
  this.on('entryPointExecute',uuid=>{this._visible=true;this.dashboard.show(this._drawn);this.reportVisibility(true);if(this.rhmiApplication)Promise.resolve(this.rhmiApplication.openEntryState(uuid)).catch(()=>{});});
  this.on('changeVisibility',d=>{if(d&&d.visible===false&&!this._spelling&&!this._selecting)this.hide();});
  this.on('shutdown',()=>this.shutdown());this.on('error',e=>logger.warn('HUD Mirror: '+e.message));
 }
 initUi(){
  if(!this.rhmiApplication)return this.initialized();const rhmi=this.rhmiApplication;this._state=rhmi.getByName(STATE);
  if(RenderClient.available()&&rhmi.getByName('ST_MaxModsDashboard')){this._state=rhmi.getByName('ST_MaxModsDashboard');this._drawn=true;}
  if(!this._state)throw new Error('Missing HUD Mirror page');
  NAMES.forEach(n=>{this._ui[n]=rhmi.getByName(n);if(!this._ui[n])throw new Error('Missing UI control '+n);});
  this.bind('mirrorTest',()=>this.startMirror(true));this.bind('mirrorPair',()=>this.pairPhone());this.bind('mirrorStart',()=>this.mirror.starting?this.stopMirror():this.startMirror(false));this.bind('mirrorStop',()=>this.stopMirror());
  this.bind('mirrorLayout',()=>this.chooseLayout());this.bind('mirrorTarget',()=>this.chooseDisplay());this.bind('mirrorBackground',()=>this.toggleBackground());this.bind('mirrorQr',()=>this.pairQr());this.bind('mirrorForceClose',()=>this.forceClose());
  this.bind('mirrorDiagnostics',()=>this.chooseDiagnostics());
  this.bind('mirrorReleasePrevious',()=>this.releaseNote(-1));this.bind('mirrorReleaseNext',()=>this.releaseNote(1));
  for(let i=0;i<12;i++){
   const name='dashboardAction'+i,c=this._ui[name]=rhmi.getByName(name);if(!c)continue;
   this.bind(name,()=>this.dashboard.proxyPress(i));const focus=value=>this.dashboard.proxyFocus(i,trueValue(value));this._focusActions[Number(c.getId())]=focus;c.on('focus',ev=>focus(ev&&ev.value));
  }
  const pickers={ST_MaxModsDisplayPicker:[['pickHud',()=>this.mirror.setTarget('hud')],['pickCluster',()=>this.mirror.setTarget('map')],['pickIdrive',()=>this.mirror.setTarget('idrive')]],
   ST_MaxModsLayoutPicker:[['pickCompact',()=>{if(this.mirror.layout!=='compact')this.mirror.toggleLayout();}],['pickFull',()=>{if(this.mirror.layout!=='full')this.mirror.toggleLayout();}]],
   ST_MaxModsSettingsPicker:[['pickAutoGpu',()=>this.mirror.setHardware(true)],['pickJpeg',()=>this.mirror.setHardware(false)],['pickBackground',()=>this.toggleBackground()],['pickForget',()=>{this.stopMirror();this.mirror.pairing=null;this.saved.forget();this.render();}]],ST_MaxModsDiagnostics:[]};
  Object.keys(pickers).forEach(state=>{
   const page=rhmi.getByName(state);if(!page)return;
   pickers[state].forEach(row=>{this._ui[row[0]]=rhmi.getByName(row[0]);if(this._ui[row[0]])this.bind(row[0],()=>{const r=row[1]();return Promise.resolve(r).then(()=>this.closePicker(state));});});
   page.on('visible',ev=>{if(ev&&!trueValue(ev.visible)&&this._picker===state){this._selecting=false;this._picker=null;this.dashboard.show(this._visible&&this._drawn);}});
  });
  ['pickDiagnostics','diagOutput','diagRate','diagPhone','diagCapture','diagSpeed','diagPark','diagIssue','diagIssue2','diagSignals','diagReconnect','diagBack'].forEach(n=>this._ui[n]=rhmi.getByName(n));
  this.bind('pickDiagnostics',()=>this.closePicker('ST_MaxModsSettingsPicker').then(()=>this.chooseDiagnostics()));
  this.bind('diagReconnect',()=>this.retryConnection());this.bind('diagBack',()=>this.closePicker('ST_MaxModsDiagnostics'));
  rhmi.on('userEvent',ev=>{const action=ev&&ev.eventType==='ACTION'&&this._actions[Number(ev.sourceId)];if(action)this.press(action.name,action.fn);const focus=ev&&ev.eventType==='FOCUS'&&this._focusActions[Number(ev.sourceId)];if(focus)focus((ev.parameterMap||{})[0]);});
  this._state.on('visible',ev=>{clearTimeout(this._hide);if(ev&&trueValue(ev.visible)){this._visible=true;this.dashboard.show(this._drawn&&!this._selecting);this.reportVisibility(true);}else if(!this._spelling&&!this._selecting)this._hide=setTimeout(()=>this.hide(),500);});
  this._state.on('focus',ev=>{if(ev&&!trueValue(ev.value===undefined?ev.focus:ev.value))this.dashboard.gpu.grab(false);else this.dashboard.show(this._visible&&this._drawn&&!this._selecting);});
  rhmi.on('restoreHmi',()=>{this._written={};this.dashboard.lastKey='';this.render();});
  return rhmi.getByName(STATE).updateResources().then(()=>this._state.updateResources()).then(()=>{
   const entries=this.appDescription&&this.appDescription.application.entryPoints||[],ep=this.getEntryPoints().find(e=>entries.some(d=>d.uuid===e.getDescription().uuid));if(!ep)throw new Error('No app entry point');const d=ep.getDescription();
   return ep.init().then(()=>rhmi.mapEntryState(d.uuid,this._state)).then(()=>ep.entryPoint.setText(d.textId)).then(()=>ep.entryPoint.setIcon(d.icon)).then(()=>ep.setAvailability('ENABLED'));
  }).then(()=>{this.registerActive();return this.initialized();}).then(()=>{
   this._visible=true;this.dashboard.connect();this.dashboard.show(this._drawn);this.reportVisibility(true);this.signals.start();this.setupController();
   this._refresh=setInterval(()=>{this.mirror.checkPark();this.maybeStart();const reason=this.guard.reason();if(reason!==this._lastGuard||this._picker==='ST_MaxModsDiagnostics'&&Date.now()-(this._lastDiag||0)>=1000){this._lastGuard=reason;this._lastDiag=Date.now();this.render();}},200);
   this._autoTimer=setInterval(()=>this.resumePhone(),2000);this.resumePhone();this.render();const uuid=this.getLastExecutedEntryPointUuid&&this.getLastExecutedEntryPointUuid();if(uuid)return rhmi.openEntryState(uuid);
  });
 }
 setupController(){
  const b=require('oap-sdk/src/someip/someipBuilders');let proxy;
  return nativeTick(()=>withSignalTimeout(b.buildTypedProxy('de.bmw.infotainment.controlelements.FrontCCU','1'),1500)).then(p=>{proxy=p;if(this._done)return p.shutdown();this._controller=p;return nativeTick(()=>withSignalTimeout(p.init(),1500));})
   .then(()=>this._done?undefined:nativeTick(()=>withSignalTimeout(proxy.waitUntilAvailable(),1500))).then(()=>this._done?undefined:nativeTick(()=>withSignalTimeout(proxy.statusRotaryEncoderState.subscribe(value=>{if(!this._done)this.dashboard.frontCcu(value);}),1500)))
   .catch(()=>{this._controllerError='Controller input unavailable; touchscreen and OEM menus remain available';});
 }
 syncFocusProxies(items,video){
  for(let i=0;i<12;i++){const name='dashboardAction'+i,c=this._ui[name];if(!c)continue;const on=video?i===0:i<items.length,label=video?'Show video controls':items[i]?items[i].label:'';this.write(name,label);
   const key=name+'.visible';if(this._written[key]!==on&&typeof c.setProperty==='function'){this._written[key]=on;Promise.resolve(c.setProperty('Visible',on?1:0,'UInt')).catch(()=>{});}}
 }
 bind(name,fn){const c=this._ui[name];this._actions[Number(c.getId())]={name,fn};c.on('action',()=>this.press(name,fn));}
 press(name,fn){if(this._done||this._spelling||Date.now()-(this._pressAt[name]||0)<180)return;this._pressAt[name]=Date.now();try{Promise.resolve(fn()).catch(e=>this.mirror.note(e.message));}catch(e){this.mirror.note(e.message);}}
 linked(){const p=this.mirror.pairing;if(!p)return;this.saved.save(p);this._pendingSession=p.token;this._autoSession=p.token;this.mirror.gpuFailed=false;this.maybeStart();}
 maybeStart(){if(this._pendingSession&&this.mirror.pairing&&this._pendingSession===this.mirror.pairing.token&&this.guard.allowed()&&!this.mirror.running&&!this.mirror.starting){this._pendingSession=null;this.startMirror(false);}}
 resumePhone(){
  if(this._done||this._resumeBusy||this._spelling||this.qr.url||this.mirror.running||this.mirror.starting||!this.saved.value)return;
  this._resumeBusy=true;const epoch=this.mirror.generation,p=this._resumeClient=new PhoneClient();
  p.resume(this.saved.value).then(info=>{if(this._done||epoch!==this.mirror.generation||this._spelling||this.qr.url)return;this.mirror.pairing=info;
   if(info.token!==this._autoSession){this._autoSession=info.token;this._pendingSession=info.token;this.mirror.gpuFailed=false;this.maybeStart();this.render();}
  }).catch(()=>{}).then(()=>{p.close();if(this._resumeClient===p)this._resumeClient=null;this._resumeBusy=false;});
 }
 startMirror(test){if(!test&&!this.mirror.pairing){this.mirror.note('Start sharing on the linked phone, or pair it first');return;}if(!test){this._pendingSession=null;this._autoSession=this.mirror.pairing.token;}return this.mirror.start(test);}
 stopMirror(){this._pendingSession=null;if(this.mirror.pairing)this._autoSession=this.mirror.pairing.token;this.mirror.stop();}
 retryConnection(){this.stopMirror();this._autoSession=null;this.mirror.gpuFailed=false;if(!this.saved.value){this.mirror.note('Pair the phone first');return;}this.mirror.note('Checking linked phone. Start sharing on the phone if it is stopped.');this.resumePhone();}
 pairPhone(){this.qr.close();this.stopMirror();this._spelling=true;this.dashboard.show(false);return spell(this,'Phone address/code').then(text=>{this._spelling=false;this.dashboard.show(this._visible&&this._drawn);if(!this._done&&text)return this.mirror.pair(text).then(()=>this.linked());},e=>{this._spelling=false;this.dashboard.show(this._visible&&this._drawn);throw e;});}
 pairQr(){if(!this._drawn){this.mirror.note('GPU dashboard unavailable. Use Pair phone.');return;}this.dashboard.tab=0;this.stopMirror();this.mirror.note('Preparing QR connection...');return this.qr.start().then(()=>this.mirror.note('Scan the QR. Mirroring starts automatically.'));}
 openPicker(state){this._selecting=true;this._picker=state;this.dashboard.show(false);this.render();const p=this.rhmiApplication.getByName(state);return p.updateResources().then(()=>{Object.keys(this._written).forEach(k=>{if(/^(pick|diag)/.test(k))delete this._written[k];});this.render();return this.rhmiApplication.openState(state);});}
 closePicker(state){return Promise.resolve(this.rhmiApplication.closeState(state)).then(()=>{this._selecting=false;this._picker=null;this.dashboard.show(this._visible&&this._drawn);this.render();});}
 chooseDisplay(){return this.openPicker('ST_MaxModsDisplayPicker');}
 chooseLayout(){return this.openPicker('ST_MaxModsLayoutPicker');}
 chooseSettings(){return this.openPicker('ST_MaxModsSettingsPicker');}
 chooseDiagnostics(){return this.openPicker('ST_MaxModsDiagnostics');}
 toggleBackground(){this.background=!this.background;this.render();}
 reportVisibility(visible){const name=visible?'registerHmiVisible':'unregisterHmiVisible';if(typeof this[name]==='function')Promise.resolve(this[name]()).catch(()=>{});if(this.background&&this.mirror.running&&typeof this.registerActive==='function')Promise.resolve(this.registerActive()).catch(()=>{});}
 write(name,value){const c=this._ui[name];if(!c||this._written[name]===value)return;this._written[name]=value;Promise.resolve(c.setValue(0,'Text',value,'Text')).catch(()=>{});}
 releaseNote(step){this._releaseIndex=(this._releaseIndex+step+release.lines.length)%release.lines.length;this.render();}
 render(){
  if(this._done)return;
  this.settings.save({target:this.mirror.target,layout:this.mirror.layout,background:this.background,hardware:this.mirror.hardware});
  if(!this._drawn||this._selecting){this.write('mirrorStatus',this.mirror.status.slice(0,95));this.write('mirrorPark',this.guard.reason()||'Stationary, Park confirmed');this.write('mirrorPhone',this.mirror.pairing?'Phone paired':'Start sharing on the phone');
   this.write('mirrorLayout','Picture: '+this.mirror.layout);this.write('mirrorTarget','Display: '+(this.mirror.target==='map'?'Instrument cluster':this.mirror.target==='idrive'?'iDrive screen':'HUD'));
   this.write('mirrorStart',this.mirror.starting?'Cancel connection':'Start mirror');
   this.write('mirrorWhatsNew',"What's new in "+release.version+' ('+(this._releaseIndex+1)+'/'+release.lines.length+')');this.write('mirrorReleaseLine1',release.lines[this._releaseIndex][0]);this.write('mirrorReleaseLine2',release.lines[this._releaseIndex][1]||'');
  }
  this.write('pickHud',(this.mirror.target==='hud'?'Selected: ':'')+'Head-up display');this.write('pickCluster',(this.mirror.target==='map'?'Selected: ':'')+'Instrument cluster');this.write('pickIdrive',(this.mirror.target==='idrive'?'Selected: ':'')+'iDrive screen');
  this.write('pickCompact',(this.mirror.layout==='compact'?'Selected: ':'')+'Compact - reserve BMW information space');this.write('pickFull',(this.mirror.layout==='full'?'Selected: ':'')+'Full display - keep complete phone picture');
  this.write('pickAutoGpu',(this.mirror.hardware?'Selected: ':'')+'Automatic - hardware GPU video when available');this.write('pickJpeg',(!this.mirror.hardware?'Selected: ':'')+'JPEG compatibility mode');this.write('pickBackground','Keep mirroring on other pages: '+(this.background?'On':'Off'));
  if(this._picker==='ST_MaxModsDiagnostics'){
   const m=this.mirror,g=this.guard,age=t=>t===null?'missing':Math.max(0,(g.clock()-t)/1000).toFixed(1)+'s',issue=m.lastIssue||m.status;
   this.write('diagOutput','Output: '+(m.target==='map'?'Cluster':m.target==='idrive'?'iDrive screen':'HUD')+' / '+(m.starting?'connecting':!m.running?'stopped':m.useGpu?'Hardware AVC':'JPEG'+(m.target==='idrive'?' / GPU surface':'')));
   this.write('diagRate','Link: '+(m.receivedFps||0)+' received fps / target '+m.videoFps+' / '+m.videoWidth+'x'+m.videoHeight);
   this.write('diagPhone',m.pairing?'Phone: '+m.pairing.host:'Phone: not linked');this.write('diagCapture','Capture: '+m.captureState+' / reconnect attempts: '+m.retryCount);
   this.write('diagSpeed','Speed: '+(g.speed===null?'unknown':g.speed+' km/h')+' / last live reading '+age(g.speedAt));this.write('diagPark','Selector: '+(g.stage||'unknown')+' / last live reading '+age(g.stageAt));
   this.write('diagIssue','Last issue: '+issue.slice(0,75));this.write('diagIssue2',issue.slice(75,160));
   this.write('diagSignals',(this.signals.errors.length?'Signals: '+this.signals.errors[this.signals.errors.length-1]:this._controllerError||'No signal/controller setup errors').slice(0,95));
  }
  if(!this._selecting)this.dashboard.render();
 }
 hide(){if(this._spelling||this._selecting)return;this._visible=false;this.dashboard.show(false);this.qr.close();this.reportVisibility(false);if(!this.background)this.stopMirror();}
 forceClose(){this.stopMirror();const deadline=setTimeout(()=>process.exit(0),1500);if(deadline.unref)deadline.unref();return this.shutdown();}
 shutdown(){if(this._done)return;this._done=true;clearTimeout(this._hide);clearInterval(this._refresh);clearInterval(this._autoTimer);if(this._resumeClient)this._resumeClient.close();this.qr.close();this.dashboard.close();this.mirror.close();
  const controller=this._controller?Promise.resolve().then(()=>this._controller.shutdown()).catch(()=>{}):Promise.resolve();return this.signals.close().then(()=>controller).then(()=>this.destroyBundles()).catch(()=>{}).then(()=>process.exit(0));}
}
const app = new HudMirrorApp();
app.start().catch(e=>logger.error('HUD Mirror start: '+e.message));

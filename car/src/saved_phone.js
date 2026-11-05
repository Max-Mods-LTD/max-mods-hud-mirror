// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('fs'),path=require('path');
const {parsePairing}=require('./phone_client.js');
class SavedPhone{
 constructor(file){this.file=file||path.resolve(__dirname,'..','..','data','trusted-phone.json');this.value=null;try{const p=JSON.parse(fs.readFileSync(this.file,'utf8'));parsePairing(p.host+'/12345678');if(/^[a-f0-9]{32}$/.test(p.resume))this.value={host:p.host,resume:p.resume};}catch(_){} }
 save(p){if(!p||!/^[a-f0-9]{32}$/.test(p.resume||''))return false;parsePairing(p.host+'/12345678');this.value={host:p.host,resume:p.resume};try{fs.writeFileSync(this.file,JSON.stringify(this.value)+'\n',{mode:0o600});fs.chmodSync(this.file,0o600);return true;}catch(_){return false;}}
 forget(){this.value=null;try{fs.unlinkSync(this.file);}catch(_){} }
}
class SavedSettings{
 constructor(file){this.file=file||path.resolve(__dirname,'..','..','data','display-settings.json');this.value={target:'hud',layout:'compact',background:true,hardware:true};
  try{const p=JSON.parse(fs.readFileSync(this.file,'utf8'));if(['hud','map','idrive'].indexOf(p.target)>=0)this.value.target=p.target;if(p.layout==='full')this.value.layout='full';['background','hardware'].forEach(k=>{if(typeof p[k]==='boolean')this.value[k]=p[k];});}catch(_){}
 }
 save(value){const next={target:value.target,layout:value.layout,background:value.background,hardware:value.hardware},text=JSON.stringify(next);
  if(text===JSON.stringify(this.value))return;this.value=next;
  try{fs.writeFileSync(this.file+'.tmp',text+'\n',{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}catch(_){}
 }
}
module.exports={SavedPhone,SavedSettings};

// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const http = require('http'), os = require('os'), crypto = require('crypto'), net = require('net');
const EventEmitter = require('events');
const { parsePairing } = require('./phone_client.js');
const PORT = 8477;
function privateAddress(ip) { try { return parsePairing(ip + '/12345678').host; } catch (_) { return null; } }
function addresses() {
    const out = [], interfaces = os.networkInterfaces();
    Object.keys(interfaces).sort((a,b) => Number(/wl|wif|ap/i.test(b)) - Number(/wl|wif|ap/i.test(a))).forEach((name) => {
        interfaces[name].forEach((v) => { if (!v.internal && v.family === 'IPv4' && privateAddress(v.address) && out.indexOf(v.address)<0) out.push(v.address); });
    }); return out;
}
class QrPairing extends EventEmitter {
    constructor(mirror, options) { super(); this.mirror=mirror; this.options=options||{}; this.server=null; this.url=null; this.sockets=new Set(); this.epoch=0; }
    start() {
        this.close();
        const host=this.options.host || addresses()[0];
        if (!host) return Promise.reject(new Error('No car Wi-Fi address. Use manual pairing.'));
        if (!this.mirror.guard.allowed()) return Promise.reject(new Error(this.mirror.guard.reason()));
        const key=crypto.randomBytes(24).toString('hex'), epoch=this.epoch;
        const port=this.options.port===undefined?PORT:this.options.port;
        this.used=false; this.attempts=0; this.expires=Date.now()+120000;
        return new Promise((resolve,reject) => {
            const server=this.server=http.createServer((req,res) => {
                req.on('error',()=>{}); res.on('error',()=>{});
                const reply=(status,msg)=>{res.writeHead(status,{'Content-Type':'text/plain','Cache-Control':'no-store','Connection':'close'});res.end(msg);};
                const peer=(req.socket.remoteAddress||'').replace(/^::ffff:/,'');
                if (++this.attempts>12 || this.used || Date.now()>this.expires || !this.mirror.guard.allowed() ||
                    !privateAddress(peer) && !this.options.allowLoopback) { reply(403,'Pairing unavailable');return; }
                const supplied=String(req.headers['x-maxmods-pair']||'');
                if (req.method!=='POST'||req.url!=='/pair'||req.headers.origin||req.headers['transfer-encoding']||
                    req.headers['content-length']!=='8'|| !/^[a-f0-9]{48}$/.test(supplied)||
                    !crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(key))) { reply(403,'Invalid pairing request');return; }
                let body=''; req.setTimeout(3000,()=>req.destroy());
                req.on('data',(b)=>{body+=b.toString('ascii');if(body.length>8)req.destroy();});
                req.on('end',()=>{
                    if (this.used || !/^\d{8}$/.test(body) || epoch!==this.epoch || !this.mirror.guard.allowed()) {reply(403,'Pairing expired');return;}
                    this.used=true;
                    const address=this.options.allowLoopback?this.options.phoneHost:peer;
                    this.mirror.pair(address+'/'+body).then(()=>{
                        if(epoch!==this.epoch){reply(410,'Pairing expired');return;}
                        if(!this.mirror.pairing){reply(502,'Phone pairing failed. Try a new QR code.');this.close();return;}
                        reply(200,'Paired');this.emit('paired');setTimeout(()=>{if(epoch===this.epoch)this.close();},100);
                    }).catch(()=>{reply(502,'Pairing failed');this.close();});
                });
            });
            server.timeout=3500;server.maxHeadersCount=12;
            server.on('connection',(s)=>{if(this.sockets.size>=4){s.destroy();return;}this.sockets.add(s);s.on('close',()=>this.sockets.delete(s));});
            server.on('error',(e)=>{this.close();reject(new Error('QR connection unavailable: '+e.message+'. Use manual pairing.'));});
            server.listen(port,host,()=>this.openBridge(host).then(()=>{
                if(epoch!==this.epoch){reject(new Error('QR pairing cancelled'));return;}
                this.url='maxmods://pair?v=1&host='+host+'&port='+server.address().port+'&key='+key;
                this.timer=setTimeout(()=>{this.close();this.emit('expired');},120000);
                this.emit('change');resolve(this.url);
            }));
        });
    }
    openBridge(host) {
        if(this.options.skipBridge)return Promise.resolve();
        return new Promise(resolve=>{
            let finished=false,data='';
            const socket=this.bridge=net.createConnection('/run/maxmods-connect/pair.sock');
            const done=ok=>{if(finished)return;finished=true;clearTimeout(deadline);this.bridgeAvailable=ok;if(!ok)socket.destroy();resolve();};
            const deadline=setTimeout(()=>done(false),1200);
            socket.on('connect',()=>socket.write(JSON.stringify({op:'pair',host})+'\n'));
            socket.on('error',()=>done(false));socket.on('close',()=>{
                if(finished&&this.bridgeAvailable&&this.bridge===socket&&this.url)this.close();
                else done(false);
            });
            socket.on('data',b=>{data+=b.toString('utf8');if(data.length>128){done(false);return;}if(data.indexOf('\n')>=0){try{done(JSON.parse(data.trim()).ok===true);}catch(_){done(false);}}});
        });
    }
    close() {this.epoch++;clearTimeout(this.timer);if(this.bridge)this.bridge.destroy();this.bridge=null;if(this.server)this.server.close();this.server=null;this.url=null;this.sockets.forEach(s=>s.destroy());this.sockets.clear();this.emit('change');}
}
module.exports={QrPairing,addresses,PORT};

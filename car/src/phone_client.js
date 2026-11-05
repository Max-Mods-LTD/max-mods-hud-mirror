// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const http = require('http');

const { StreamDecoder, WIDTH, HEIGHT, BYTES } = require('./stream_decoder.js');
const PORT = 8476;

function parsePairing(text) {
    const m = /^\s*(\d{1,3}(?:\.\d{1,3}){3})\s*\/\s*(\d{8})\s*$/.exec(String(text || ''));
    if (!m) throw new Error('Enter the phone address/code exactly as shown on the phone');
    const oct = m[1].split('.').map(Number);
    if (oct.some((v) => v < 0 || v > 255) || oct[3] === 0 || oct[3] === 255 ||
        !(oct[0] === 10 || (oct[0] === 172 && oct[1] >= 16 && oct[1] <= 31) || (oct[0] === 192 && oct[1] === 168))) {
        throw new Error('Use a private Wi-Fi address from the phone');
    }
    return { host: oct.join('.'), pin: m[2] };
}

class PhoneClient {
    constructor() { this.requests = new Set(); this.decoders = new Set(); this.closed = false; }
    request(host, route, token, body, limit) {
        return new Promise((resolve, reject) => {
            if (this.closed) { reject(new Error('Phone connection closed')); return; }
            const headers = { 'Connection': 'close', 'Cache-Control': 'no-store' };
            if (token) headers.Authorization = 'Bearer ' + token;
            if (body) { headers['Content-Length'] = Buffer.byteLength(body); headers['Content-Type'] = 'text/plain'; }
            let settled = false;
            let req;
            const finish = (err, result) => {
                if (settled) return;
                settled = true; clearTimeout(deadline); this.requests.delete(req);
                if (err) reject(err); else resolve(result);
            };
            const deadline = setTimeout(() => { if (req) req.destroy(); finish(new Error('Phone connection timed out')); }, route === '/v4/prepare' ? 6000 : 2200);
            req = http.request({ host, port: PORT, path: route, method: body ? 'POST' : 'GET', headers, agent: false }, (res) => {
                const parts = []; let size = 0;
                res.on('data', (chunk) => {
                    size += chunk.length;
                    if (size > limit) { finish(new Error('Phone response exceeded the frame limit')); req.destroy(); return; }
                    parts.push(chunk);
                });
                res.on('error', (e) => finish(e));
                res.on('aborted', () => finish(new Error('Phone disconnected')));
                res.on('end', () => finish(null, { status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }));
            });
            this.requests.add(req);
            req.on('error', (e) => finish(e));
            if (body) req.write(body);
            req.end();
        });
    }
    pair(text) {
        const p = parsePairing(text);
        return this.request(p.host, '/v4/pair', null, p.pin, 1024).then((r) => {
            if (r.status === 404) throw new Error('Update the phone app to version 0.5.0');
            if (r.status !== 200) throw new Error(r.status === 429 ? 'Too many pairing attempts; restart sharing on the phone' : 'Pairing refused: check the code and phone app version 0.5.0');
            return this.readInfo(p.host,r);
        });
    }
    readInfo(host,r){
        if(r.status!==200)throw new Error('Phone connection refused ('+r.status+')');
        let data;try{data=JSON.parse(r.body.toString('utf8'));}catch(_){throw new Error('Invalid phone reply');}
        if(!/^[a-f0-9]{32}$/.test(data.token||'')||data.protocol!==4||
            !((data.width===768&&data.height===432&&data.fps===30)||(data.width===576&&data.height===324&&data.fps===60))||
            ['jpeg','h264-annexb'].indexOf(data.format)<0)throw new Error('Update both HUD Mirror apps to 0.5.0');
        return {host,token:data.token,resume:data.resume,width:data.width,height:data.height,fps:data.fps,format:data.format};
    }
    resume(device){parsePairing(device.host+'/12345678');if(!/^[a-f0-9]{32}$/.test(device.resume))return Promise.reject(new Error('Pair the phone again'));
        return this.request(device.host,'/v4/resume',null,device.resume,2048).then(r=>this.readInfo(device.host,r));}
    prepare(pairing,codec){return this.request(pairing.host,'/v4/prepare',pairing.token,codec,2048).then(r=>{if(r.status!==200)throw new Error('Video setup ('+r.status+'): '+r.body.toString('utf8').slice(0,180));return this.readInfo(pairing.host,r);});}
    keyframe(pairing){return this.request(pairing.host,'/v4/keyframe',pairing.token,'1',128).catch(()=>{});}
    stream(pairing, events) {
        if (this.closed) { events.error(new Error('Phone connection closed')); return; }
        let failed = false, req;
        const fail = (e) => {
            if (failed || this.closed) return;
            failed = true; decoder.close(); this.decoders.delete(decoder); this.requests.delete(req);
            if (req) req.destroy(); events.error(e);
        };
        const decoder = new StreamDecoder({ frame: events.frame, state: events.state, error: fail, gap:()=>this.keyframe(pairing) }, pairing);
        const networkFail = (e) => { e.retryable = true; fail(e); };
        this.decoders.add(decoder);
        req = http.request({ host: pairing.host, port: PORT, path: '/v4/stream?after=0', method: 'GET', agent: false,
            headers: { Authorization: 'Bearer ' + pairing.token, 'Cache-Control': 'no-store', Connection: 'close' } }, (res) => {
            if (res.statusCode !== 200) { fail(new Error(res.statusCode === 403 ? 'Phone session ended; pair again' : 'Phone stopped sharing; start sharing again')); return; }
            if (res.headers['content-type'] !== 'application/x-maxmods-hud-stream' || res.headers['x-mirror-protocol'] !== '4') {
                fail(new Error('Invalid phone stream version')); return;
            }
            res.on('data', (chunk) => decoder.push(chunk));
            res.on('error', networkFail); res.on('aborted', () => networkFail(new Error('Phone connection lost')));
            res.on('end', () => networkFail(new Error('Phone stream ended. Start sharing again.')));
        });
        this.requests.add(req);
        req.setTimeout(3500, () => networkFail(new Error('Phone connection timed out')));
        req.on('error', networkFail); req.end();
    }
    close() {
        this.closed = true; this.decoders.forEach((d) => d.close()); this.decoders.clear();
        this.requests.forEach((r) => r.destroy()); this.requests.clear();
    }
}
module.exports = { PhoneClient, parsePairing, WIDTH, HEIGHT, BYTES, PORT };

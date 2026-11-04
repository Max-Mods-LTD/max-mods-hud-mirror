// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const http = require('http');

const WIDTH = 400;
const HEIGHT = 240;
const BYTES = WIDTH * HEIGHT * 4;
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
    constructor() { this.requests = new Set(); this.lastFrame = '0'; this.closed = false; }
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
            const deadline = setTimeout(() => { if (req) req.destroy(); finish(new Error('Phone connection timed out')); }, 2200);
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
        return this.request(p.host, '/v1/pair', null, p.pin, 1024).then((r) => {
            if (r.status !== 200) throw new Error(r.status === 429 ? 'Too many pairing attempts; restart sharing on the phone' : 'Pairing refused: check the code on the phone');
            let data; try { data = JSON.parse(r.body.toString('utf8')); } catch (e) { throw new Error('Invalid pairing reply'); }
            if (!/^[a-f0-9]{32}$/.test(data.token || '') || data.width !== WIDTH || data.height !== HEIGHT) throw new Error('Unsupported phone app version');
            this.lastFrame = '0';
            return { host: p.host, token: data.token };
        });
    }
    frame(pairing) {
        return this.request(pairing.host, '/v1/frame?after=' + this.lastFrame, pairing.token, null, BYTES).then((r) => {
            if (r.status === 204) return null;
            if (r.status !== 200) throw new Error('Phone stopped sharing; pair again');
            if (r.body.length !== BYTES || r.headers['content-type'] !== 'application/x-maxmods-rgba' ||
                r.headers['x-mirror-width'] !== String(WIDTH) || r.headers['x-mirror-height'] !== String(HEIGHT) ||
                !/^\d{1,15}$/.test(r.headers['x-mirror-frame-id'] || '')) throw new Error('Invalid phone frame');
            this.lastFrame = r.headers['x-mirror-frame-id'];
            return r.body;
        });
    }
    close() { this.closed = true; this.requests.forEach((r) => r.destroy()); this.requests.clear(); }
}
module.exports = { PhoneClient, parsePairing, WIDTH, HEIGHT, BYTES, PORT };

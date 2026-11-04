// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('assert');
const cp = require('child_process');
const path = require('path');
const { PhoneClient, BYTES } = require('../car/src/phone_client.js');
const root = path.resolve(__dirname, '..');
const child = cp.spawn('java', ['-cp', path.join(root, 'build', 'phone-tests'), 'PhoneServerHarness'], { stdio: ['pipe','pipe','inherit'] });
const p = new PhoneClient();
let data = '';
let timer = setTimeout(() => { child.kill(); throw new Error('Phone server did not start'); }, 8000);
child.stdout.on('data', (chunk) => {
    data += chunk.toString();
    if (data.indexOf('\n') < 0 || timer === null) return;
    clearTimeout(timer); timer = null;
    run(data.trim()).catch((e) => { console.error(e); process.exitCode = 1; }).then(() => { p.close(); child.stdin.end('\n'); });
});
child.on('error', (e) => { clearTimeout(timer); console.error(e); process.exitCode = 1; });
child.on('exit', (code) => { clearTimeout(timer); if (code) process.exitCode = 1; });
async function run(pin) {
    const denied = await p.request('127.0.0.1', '/v1/frame?after=0', null, null, 100);
    assert.strictEqual(denied.status, 403);
    const wrong = await p.request('127.0.0.1', '/v1/pair', null, pin === '00000000' ? '11111111' : '00000000', 100);
    assert.strictEqual(wrong.status, 403);
    const paired = await p.request('127.0.0.1', '/v1/pair', null, pin, 1024);
    assert.strictEqual(paired.status, 200);
    const info = JSON.parse(paired.body.toString());
    assert(/^[a-f0-9]{32}$/.test(info.token));
    const token = { host: '127.0.0.1', token: info.token };
    const pixels = await p.frame(token);
    assert.strictEqual(pixels.length, BYTES); assert.deepStrictEqual(Array.from(pixels.slice(0,4)), [12,34,56,255]);
    assert.strictEqual(await p.frame(token), null);
    const wrongToken = await p.request('127.0.0.1', '/v1/frame?after=0', 'f'.repeat(32), null, 100);
    assert.strictEqual(wrongToken.status, 403);
    const missing = await p.request('127.0.0.1', '/anything', info.token, null, 100);
    assert.strictEqual(missing.status, 404);
    // One initial bad attempt + a successful pair + three bad attempts uses the peer budget.
    for (let i = 0; i < 3; i++) await p.request('127.0.0.1', '/v1/pair', null, 'BADCODE!', 100);
    const limited = await p.request('127.0.0.1', '/v1/pair', null, pin, 100);
    assert.strictEqual(limited.status, 429);
    console.log('PASS real Java phone server -> HTTP pairing/auth -> Node car receiver: exact RGBA frame, no duplicates, token checks, route checks, rate limit');
}

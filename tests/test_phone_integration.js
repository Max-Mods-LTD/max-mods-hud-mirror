// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('assert');
const cp = require('child_process');
const path = require('path');
const { PhoneClient, BYTES, WIDTH, HEIGHT } = require('../car/src/phone_client.js');
const root = path.resolve(__dirname, '..');
const child = cp.spawn('java', ['-cp', path.join(root, 'build', 'phone-tests'), 'PhoneServerHarness'].concat(process.argv[2] === 'smooth' ? ['smooth'] : []), { stdio: ['pipe','pipe','inherit'] });
const p = new PhoneClient();
let data = '', started = false;
const acknowledgements = new Map();
const timer = setTimeout(() => { child.kill(); console.error('Phone server did not start'); process.exitCode = 1; }, 8000);
child.stdout.on('data', (chunk) => {
    data += chunk.toString();
    for (let nl; (nl = data.indexOf('\n')) >= 0;) {
        const line = data.slice(0, nl).trim(); data = data.slice(nl + 1);
        if (!started) {
            started = true; clearTimeout(timer);
            run(line).catch((e) => { console.error(e); process.exitCode = 1; }).then(() => { p.close(); child.stdin.end('quit\n'); });
        } else if (acknowledgements.has(line)) {
            acknowledgements.get(line)(); acknowledgements.delete(line);
        }
    }
});
child.on('error', (e) => { clearTimeout(timer); console.error(e); process.exitCode = 1; });
child.on('exit', (code) => { clearTimeout(timer); if (code) process.exitCode = 1; });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, ms) {
    const end = Date.now() + (ms || 3000);
    while (Date.now() < end) { if (fn()) return; await delay(10); }
    throw new Error('Phone integration condition timed out');
}
async function command(name) {
    let done = false;
    acknowledgements.set('OK ' + name, () => { done = true; }); child.stdin.write(name + '\n');
    await until(() => done);
}
async function run(pin) {
    const denied = await p.request('127.0.0.1', '/v3/stream?after=0', null, null, 100);
    assert.strictEqual(denied.status, 403);
    const wrong = await p.request('127.0.0.1', '/v3/pair', null, pin === '00000000' ? '11111111' : '00000000', 100);
    assert.strictEqual(wrong.status, 403);
    const paired = await p.request('127.0.0.1', '/v3/pair', null, pin, 1024);
    assert.strictEqual(paired.status, 200);
    const info = JSON.parse(paired.body.toString());
    assert(/^[a-f0-9]{32}$/.test(info.token));
    assert.strictEqual(info.protocol, 3); assert.strictEqual(info.width, process.argv[2] === 'smooth' ? 576 : WIDTH); assert.strictEqual(info.height, process.argv[2] === 'smooth' ? 324 : HEIGHT);
    assert.strictEqual(info.fps, process.argv[2] === 'smooth' ? 60 : 30); assert.strictEqual(info.format, 'jpeg');
    const token = Object.assign({host:'127.0.0.1'},info);
    const frames = [], states = [], errors = []; let firstPixels;
    p.stream(token, { frame: (pixels, id) => {
        if (!frames.length) firstPixels = pixels;
        assert.strictEqual(pixels.length, info.width * info.height * 3 / 2); frames.push({ id, at: Date.now() });
    }, state: (s) => states.push(s), error: (e) => errors.push(e) });
    await until(() => frames.length > 0);
    assert(firstPixels[0]>220&&firstPixels[info.width-1]>220,'JPEG corner borders were cropped');
    const y=firstPixels[80*info.width+80],u=firstPixels[info.width*info.height+40*info.width+40],v=firstPixels[info.width*info.height+40*info.width+info.width/2+40];
    assert(y>50&&y<130&&u<130&&v>180,'JPEG colors or YUV atlas layout changed');firstPixels=null;
    await delay(1900);
    assert.strictEqual(frames.length, 1, 'still screen must not fabricate pictures');
    assert(states.filter((s) => s === 'active').length >= 5); assert.strictEqual(errors.length, 0);
    console.log('PASS live unchanged screen stays connected beyond the old 1.5-second cutoff, without repeated image transfers');
    await command('hide'); await until(() => states[states.length - 1] === 'hidden');
    await command('show'); await until(() => states[states.length - 1] === 'waiting');
    await delay(100); assert.strictEqual(frames.length, 1, 'resume cannot replay the hidden picture');
    await command('animate');
    const before = frames.length, at = Date.now(); await delay(2000);
    const received = frames.length - before, fps = received * 1000 / (Date.now() - at);
    assert(received >= info.fps * 1.7, 'stream failed to keep up with the host producer');
    for (let i = 1; i < frames.length; i++) assert(frames[i].id > frames[i - 1].id);
    assert.strictEqual(errors.length, 0);
    console.log('PASS real Java -> HTTP stream -> Node decoder: ' + fps.toFixed(1) + ' fps on the host; this does not measure the car projector');
    const wrongToken = await p.request('127.0.0.1', '/v3/stream?after=0', 'f'.repeat(32), null, 100);
    assert.strictEqual(wrongToken.status, 403);
    const missing = await p.request('127.0.0.1', '/anything', info.token, null, 100);
    assert.strictEqual(missing.status, 404);
    // One initial bad attempt + a successful pair + three bad attempts uses the peer budget.
    for (let i = 0; i < 3; i++) await p.request('127.0.0.1', '/v3/pair', null, 'BADCODE!', 100);
    const limited = await p.request('127.0.0.1', '/v3/pair', null, pin, 100);
    assert.strictEqual(limited.status, 429);
    const replacement = new PhoneClient(), replacementErrors = []; let replacementFrames = 0;
    try {
        replacement.stream(token, { frame: () => { replacementFrames++; }, state: () => {}, error: (e) => replacementErrors.push(e) });
        await until(() => replacementFrames > 0 && errors.length > 0);
        assert.strictEqual(errors[0].retryable, true, 'a broken/replaced connection should permit a bounded retry');
        await command('stall'); await until(() => replacementErrors.length > 0, 4000);
        assert(/capture stopped/.test(replacementErrors[0].message), replacementErrors[0].message);
        assert(!replacementErrors[0].retryable, 'an explicit capture stop must not reconnect');
    } finally { replacement.close(); }
    console.log('PASS hidden-app resume, token/route checks, pairing limits, retryable connection replacement and terminal capture stop');
}

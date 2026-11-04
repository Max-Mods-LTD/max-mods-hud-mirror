// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('assert');
const EventEmitter = require('events');
const { ParkGuard } = require('../car/src/park_guard.js');
const { PhoneClient, parsePairing, BYTES, WIDTH, HEIGHT } = require('../car/src/phone_client.js');
const { MirrorController, testPattern, hudRect } = require('../car/src/mirror_controller.js');

let count = 0;
function test(name, fn) { return Promise.resolve().then(fn).then(() => { count++; console.log('PASS ' + name); }); }
function guard(clock) {
    const g = new ParkGuard(clock);
    g.updateSpeed({ speedVehicleCentreOfGravity: 0 });
    g.updateStage({ statusActualStageDrive: 'P' }, 'statusActualStageDrive'); return g;
}
class Renderer extends EventEmitter {
    constructor() { super(); this.images = []; this.videos = []; this.frames = []; this.settings = []; this.closed = false; }
    connect() { this.backend = 'id7'; this.targets = 'map:1088x480,panel:1920x720,hud:800x480'; this.emit('ready'); }
    image(o) { this.images.push(o); return 1; }
    video(o) { this.videos.push(o); return 1; }
    frame(ref, pixels) { this.frames.push(pixels); return true; }
    pixels(ref, rect, pixels) { this.frames.push(pixels); }
    set(ref, value) { this.settings.push(value); }
    close() { this.closed = true; }
}
const phoneFactory = () => ({ close() {}, stream() {} });

(async () => {
    await test('unknown, invalid and ambiguous vehicle signals block output', () => {
        let now = 1000; const g = new ParkGuard(() => now);
        assert(!g.allowed()); g.updateSpeed({ speedVehicleCentreOfGravity: 0 }); assert(!g.allowed());
        g.updateStage({ statusActualStageDrive: 1 }, 'statusActualStageDrive'); assert(g.allowed());
        g.updateSpeed({ speedVehicleCentreOfGravity: 65535 }); assert(!g.allowed());
        g.updateSpeed({ speedVehicleCentreOfGravity: 0 });
        g.updateStage({ statusGearSelectionDrive: 4 }, 'statusGearSelectionDrive'); assert(!g.allowed());
        g.updateStage({ statusGearSelectionDrive: 3 }, 'statusGearSelectionDrive'); assert(g.allowed());
        g.updateSpeed({ speedVehicleCentreOfGravity: NaN }); assert(!g.allowed());
    });
    await test('movement, leaving Park and stale telemetry revoke permission', () => {
        let now = 1000; const g = guard(() => now);
        g.updateSpeed({ speedVehicleCentreOfGravity: 1 }); assert(!g.allowed());
        g.updateSpeed({ speedVehicleCentreOfGravity: 0 });
        g.updateStage({ statusActualStageDrive: 'D' }, 'statusActualStageDrive'); assert(!g.allowed());
        g.updateStage({ statusActualStageDrive: 'P' }, 'statusActualStageDrive'); assert(g.allowed());
        now += 2501; assert(!g.allowed());
    });
    await test('pairing permits only private IPv4 destinations and eight-digit codes', () => {
        assert.deepStrictEqual(parsePairing('172.16.222.23/00112233'), { host: '172.16.222.23', pin: '00112233' });
        ['8.8.8.8/12345678','127.0.0.1/12345678','169.254.1.2/12345678','192.168.1.255/12345678',
            '192.168.1.5:22/12345678','example.com/12345678','10.0.0.500/12345678','10.0.0.1/1234'].forEach((s) => assert.throws(() => parsePairing(s)));
    });
    await test('blocked starts never open a renderer', () => {
        let opened = false; const c = new MirrorController(new ParkGuard(), { makeRenderer: () => { opened = true; return new Renderer(); }, makePhone: phoneFactory });
        c.start(true); assert(!opened); assert(!c.running); c.close();
    });
    await test('HUD test uses the advertised HUD target and releases it on motion', () => {
        const g = guard(); const r = new Renderer();
        const c = new MirrorController(g, { makeRenderer: () => r, makePhone: phoneFactory, layout: 'full' });
        c.start(true);
        assert.strictEqual(r.images.length, 1); assert.strictEqual(r.images[0].target, 'hud');
        assert.strictEqual(r.images[0].w, 800); assert.strictEqual(r.images[0].h, 450);
        assert.strictEqual(r.images[0].exclusive, false); assert.strictEqual(r.images[0].contend, false);
        assert.strictEqual(r.images[0].guide_hold, false); assert.strictEqual(r.frames[0].length, WIDTH * HEIGHT * 4);
        g.updateStage({ statusActualStageDrive: 'R' }, 'statusActualStageDrive'); c.checkPark();
        assert(!c.running); assert(r.closed); assert.strictEqual(r.settings[r.settings.length - 1].visible, false); c.close();
    });
    await test('a late network frame cannot redraw after Stop', async () => {
        let deliver; const g = guard(); const r = new Renderer();
        const c = new MirrorController(g, { makeRenderer: () => r,
            makePhone: () => ({ close() {}, stream(p, events) { deliver = events.frame; events.state('active'); } }) });
        c.pairing = { host: '172.16.222.23', token: '0'.repeat(32) }; c.start(false);
        c.stop(); deliver(Buffer.alloc(BYTES), 1); await Promise.resolve();
        assert.strictEqual(r.frames.length, 0); assert(r.closed); c.close();
    });
    await test('a frame arriving after Park is released is discarded', async () => {
        let deliver; const g = guard(); const r = new Renderer();
        const c = new MirrorController(g, { makeRenderer: () => r,
            makePhone: () => ({ close() {}, stream(p, events) { deliver = events.frame; events.state('active'); } }) });
        c.pairing = { host: '172.16.222.23', token: '0'.repeat(32) }; c.start(false);
        g.invalidate(); deliver(Buffer.alloc(BYTES), 1); await Promise.resolve();
        assert.strictEqual(r.frames.length, 0); assert(!c.running); c.close();
    });
    await test('renderer loss stops output instead of replaying a stored screenshot', () => {
        const r = new Renderer(); const c = new MirrorController(guard(), { makeRenderer: () => r, makePhone: phoneFactory });
        c.start(true); r.emit('disconnected'); assert(!c.running); assert(r.closed); c.close();
    });
    await test('wrong platform is rejected', () => {
        const r = new Renderer(); r.connect = function () { this.backend = 'id8'; this.targets = 'hud:353x203'; this.emit('ready'); };
        const c = new MirrorController(guard(), { makeRenderer: () => r, makePhone: phoneFactory });
        c.start(true); assert(!c.running); assert.strictEqual(r.frames.length, 0); c.close();
    });
    await test('incompatible phone dimensions are refused during pairing', async () => {
        const p = new PhoneClient();
        p.request = () => Promise.resolve({ status: 200, body: Buffer.from(JSON.stringify({
            token: '0'.repeat(32), protocol: 2, width: 1, height: HEIGHT, fps: 30, format: 'yuv420-atlas-deflate' })) });
        await assert.rejects(p.pair('10.0.0.1/12345678'), /Update both/); p.close();
        assert.strictEqual(testPattern().length, WIDTH * HEIGHT * 4);
    });
    await test('Compact reserves lower HUD space and toggles live without reconnecting', () => {
        let streams = 0; const r = new Renderer();
        const c = new MirrorController(guard(), { makeRenderer: () => r,
            makePhone: () => ({ close() {}, stream() { streams++; } }) });
        c.pairing = { host: '10.0.0.1', token: '0'.repeat(32) }; c.start(false);
        assert.strictEqual(c.layout, 'compact'); assert.strictEqual(r.videos[0].fps, 30);
        const compact = r.videos[0];
        assert(compact.y + compact.h < 480 * 0.75);
        assert(Math.abs(compact.w / compact.h - WIDTH / HEIGHT) < 0.01);
        assert(WIDTH * HEIGHT / 2 * 30 < 5500 * 1024, 'native motion uploads must fit the default renderer budget at 30 fps');
        assert.strictEqual(compact.exclusive, false); assert.strictEqual(compact.contend, false);
        c.toggleLayout(); assert.strictEqual(c.layout, 'full');
        assert.deepStrictEqual(r.settings[r.settings.length - 1], { x: 0, y: 15, w: 800, h: 450 });
        c.toggleLayout(); assert.strictEqual(c.layout, 'compact'); assert.strictEqual(streams, 1);
        const other = hudRect('full', 1000, 400);
        assert(other.w <= 1000 && other.h <= 400); assert(Math.abs(other.w / other.h - WIDTH / HEIGHT) < 0.01);
        c.close();
    });
    await test('live still-screen records preserve output; hidden content and dead links clear the image', async () => {
        let now = 1000, events; const g = guard(() => now), r = new Renderer();
        const c = new MirrorController(g, { clock: () => now, makeRenderer: () => r,
            makePhone: () => ({ close() {}, stream(p, e) { events = e; } }) });
        const refreshPark = () => { g.updateSpeed({ speedVehicleCentreOfGravity: 0 }); g.updateStage({ statusActualStageDrive: 'P' }, 'statusActualStageDrive'); };
        c.pairing = { host: '10.0.0.1', token: '0'.repeat(32) }; c.start(false);
        r.emit('target', 'hud', 'parked', 'stock', 'parked behind stock');
        events.state('active'); events.frame(Buffer.alloc(BYTES), 1);
        assert(/HUD: parked.*Receiving/.test(c.status), 'incoming frames must not hide a target-arbitration error');
        r.emit('target', 'hud', 'shown', '', '');
        now += 2000; refreshPark(); events.state('active'); assert(c.running);
        assert.strictEqual(r.frames.length, 2, 'a live still screen refreshes the video deadline without fabricating new frames');
        events.state('hidden'); assert.strictEqual(r.settings[r.settings.length - 1].visible, false);
        events.frame(Buffer.alloc(BYTES), 2); assert.strictEqual(r.frames.length, 2);
        events.state('active'); assert.strictEqual(r.frames.length, 2, 'resume must wait for a fresh picture');
        events.frame(Buffer.alloc(BYTES), 3); assert.strictEqual(r.frames.length, 3);
        now += 3600; refreshPark(); await new Promise((resolve) => setTimeout(resolve, 230));
        assert(c.running); assert(/reconnecting 1\/3/.test(c.status));
        assert.strictEqual(r.settings[r.settings.length - 1].visible, false); assert.strictEqual(c.latestPixels, null);
        c.close(); assert(r.closed);
    });
    await test('a brief network failure recovers using a new frame and ignores callbacks from the old connection', async () => {
        const streams = [], r = new Renderer();
        const c = new MirrorController(guard(() => 1000), { clock: () => 1000, makeRenderer: () => r,
            makePhone: () => ({ close() {}, stream(p, e) { streams.push(e); } }) });
        c.pairing = { host: '10.0.0.1', token: '0'.repeat(32) }; c.start(false);
        streams[0].state('active'); streams[0].frame(Buffer.alloc(BYTES), 1);
        const reset = new Error('temporary reset'); reset.retryable = true; streams[0].error(reset);
        assert(c.running); assert.strictEqual(c.latestPixels, null);
        await new Promise((resolve) => setTimeout(resolve, 300)); assert.strictEqual(streams.length, 2);
        streams[0].state('active'); streams[0].frame(Buffer.alloc(BYTES), 2);
        assert.strictEqual(r.frames.length, 1, 'old network callbacks replayed a stale picture');
        streams[1].state('active'); assert.strictEqual(r.frames.length, 1);
        streams[1].frame(Buffer.alloc(BYTES), 3); assert.strictEqual(r.frames.length, 2);
        assert.strictEqual(r.settings[r.settings.length - 1].visible, true); c.close();
    });
    await test('Stop, leaving Park and an explicit capture stop cancel recovery', async () => {
        for (const action of ['stop','park','capture']) {
            const streams = [], r = new Renderer(), g = guard(() => 1000);
            const c = new MirrorController(g, { clock: () => 1000, makeRenderer: () => r,
                makePhone: () => ({ close() {}, stream(p, e) { streams.push(e); } }) });
            c.pairing = { host: '10.0.0.1', token: '0'.repeat(32) }; c.start(false);
            const e = new Error('Phone capture stopped'); e.retryable = action !== 'capture'; streams[0].error(e);
            if (action === 'stop') c.stop();
            if (action === 'park') { g.updateStage({ statusActualStageDrive: 'D' }, 'statusActualStageDrive'); c.checkPark(); }
            await new Promise((resolve) => setTimeout(resolve, 300));
            assert(!c.running); assert.strictEqual(streams.length, 1); assert(r.closed); c.close();
        }
    });
    await test('repeated network failures stop after three retries', async () => {
        const streams = [], r = new Renderer();
        const c = new MirrorController(guard(() => 1000), { clock: () => 1000, makeRenderer: () => r,
            makePhone: () => ({ close() {}, stream(p, e) { streams.push(e); } }) });
        c.pairing = { host: '10.0.0.1', token: '0'.repeat(32) }; c.start(false);
        for (let i = 0; i < 4; i++) {
            const e = new Error('Video link unavailable'); e.retryable = true; streams[i].error(e);
            if (i < 3) await new Promise((resolve) => setTimeout(resolve, [300,800,1550][i]));
        }
        assert(!c.running); assert.strictEqual(streams.length, 4); assert(r.closed); c.close();
    });
    console.log(count + ' car tests passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });

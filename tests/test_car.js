// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('assert');
const EventEmitter = require('events');
const { ParkGuard } = require('../car/src/park_guard.js');
const { PhoneClient, parsePairing, BYTES } = require('../car/src/phone_client.js');
const { MirrorController, testPattern } = require('../car/src/mirror_controller.js');

let count = 0;
function test(name, fn) { return Promise.resolve().then(fn).then(() => { count++; console.log('PASS ' + name); }); }
function guard(clock) {
    const g = new ParkGuard(clock);
    g.updateSpeed({ speedVehicleCentreOfGravity: 0 });
    g.updateStage({ statusActualStageDrive: 'P' }, 'statusActualStageDrive'); return g;
}
class Renderer extends EventEmitter {
    constructor() { super(); this.images = []; this.frames = []; this.settings = []; this.closed = false; }
    connect() { this.backend = 'id7'; this.targets = 'map:1088x480,panel:1920x720,hud:800x480'; this.emit('ready'); }
    image(o) { this.images.push(o); return 1; }
    pixels(ref, rect, pixels) { this.frames.push(pixels); }
    set(ref, value) { this.settings.push(value); }
    close() { this.closed = true; }
}
const phoneFactory = () => ({ close() {}, frame() { return Promise.resolve(null); } });

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
        const c = new MirrorController(g, { makeRenderer: () => r, makePhone: phoneFactory });
        c.start(true);
        assert.strictEqual(r.images.length, 1); assert.strictEqual(r.images[0].target, 'hud');
        assert.strictEqual(r.images[0].w, 800); assert.strictEqual(r.images[0].h, 480);
        assert.strictEqual(r.images[0].exclusive, false); assert.strictEqual(r.images[0].contend, false);
        assert.strictEqual(r.images[0].guide_hold, false); assert.strictEqual(r.frames[0].length, BYTES);
        g.updateStage({ statusActualStageDrive: 'R' }, 'statusActualStageDrive'); c.checkPark();
        assert(!c.running); assert(r.closed); assert.strictEqual(r.settings[r.settings.length - 1].visible, false); c.close();
    });
    await test('a late network frame cannot redraw after Stop', async () => {
        let deliver; const g = guard(); const r = new Renderer();
        const c = new MirrorController(g, { makeRenderer: () => r,
            makePhone: () => ({ close() {}, frame() { return new Promise((resolve) => { deliver = resolve; }); } }) });
        c.pairing = { host: '172.16.222.23', token: '0'.repeat(32) }; c.start(false);
        c.stop(); deliver(Buffer.alloc(BYTES)); await Promise.resolve(); await Promise.resolve();
        assert.strictEqual(r.frames.length, 0); assert(r.closed); c.close();
    });
    await test('a frame arriving after Park is released is discarded', async () => {
        let deliver; const g = guard(); const r = new Renderer();
        const c = new MirrorController(g, { makeRenderer: () => r,
            makePhone: () => ({ close() {}, frame() { return new Promise((resolve) => { deliver = resolve; }); } }) });
        c.pairing = { host: '172.16.222.23', token: '0'.repeat(32) }; c.start(false);
        g.invalidate(); deliver(Buffer.alloc(BYTES)); await Promise.resolve(); await Promise.resolve();
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
    await test('malformed frame dimensions and oversize payloads are refused', async () => {
        const p = new PhoneClient();
        p.request = () => Promise.resolve({ status: 200, body: Buffer.alloc(BYTES), headers: {
            'content-type': 'application/x-maxmods-rgba', 'x-mirror-width': '1', 'x-mirror-height': '240', 'x-mirror-frame-id': '1' } });
        await assert.rejects(p.frame({ host: '10.0.0.1', token: '0'.repeat(32) }), /Invalid phone frame/); p.close();
        assert.strictEqual(testPattern().length, BYTES);
    });
    console.log(count + ' car tests passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });

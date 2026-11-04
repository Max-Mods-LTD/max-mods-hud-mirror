// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('assert');
const { ParkGuard } = require('../car/src/park_guard.js');
const { VehicleSignals } = require('../car/src/vehicle_signals.js');

const SPEED = 'de.bmw.infotainment.vehicle.Vehicle2';
const GEAR = 'de.bmw.infrastructure.VehicleInformation';
const turn = () => new Promise((resolve) => setImmediate(resolve));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fixture() {
    const callbacks = {};
    let speedReads = 0; let gearReads = 0; let shutdowns = 0;
    const field = (name, readable) => ({
        subscribe: (cb) => { callbacks[name] = cb; return Promise.resolve(); },
        // Some wrappers expose this method even without a generated getter.
        getValue: () => {
            if (!readable) { gearReads++; return Promise.reject(new Error('no getter available')); }
            speedReads++; return Promise.resolve({ speedVehicleCentreOfGravity: 0 });
        }
    });
    const proxy = (fields) => Object.assign({
        init: () => Promise.resolve(), waitUntilAvailable: () => Promise.resolve(),
        shutdown: () => { shutdowns++; return Promise.resolve(); }
    }, fields);
    const proxies = {
        [SPEED]: proxy({ statusCarSpeed2: field('speed', true) }),
        [GEAR]: proxy({ statusGearboxDrive: field('gearbox', false), DataPowerTrain2: field('powertrain', false) })
    };
    return { callbacks, proxies,
        sdk: { buildTypedProxy: (name, instance) => {
            assert.strictEqual(instance, '1');
            return Promise.resolve(proxies[name]);
        } },
        counts: () => ({ speedReads, gearReads, shutdowns }) };
}

(async () => {
    let now = 1000;
    const f = fixture(); const guard = new ParkGuard(() => now);
    const signals = new VehicleSignals(guard, null, f.sdk);
    try {
        await signals.start(); await turn(); await turn();
        assert(f.callbacks.gearbox && f.callbacks.powertrain, 'both gear variants must be subscribed');
        assert(!guard.allowed(), 'zero speed alone cannot authorise output');
        f.callbacks.gearbox({ statusActualStageDrive: 'P' }); assert(guard.allowed());
        f.callbacks.gearbox({ statusActualStageDrive: 'R' }); assert(!guard.allowed());
        f.callbacks.powertrain({ statusGearSelectionDrive: 3 }); assert(guard.allowed());
        f.callbacks.powertrain({ statusGearSelectionDrive: 4 }); assert(!guard.allowed());
        f.callbacks.powertrain({ statusGearSelectionDrive: 3 }); assert(guard.allowed());

        now += 2501;
        await delay(680); // Let a real speed poll run while gear is quiet.
        assert(f.counts().speedReads >= 2, 'speed still polls its supported getter');
        assert.strictEqual(f.counts().gearReads, 0, 'event-only gear must never be polled');
        assert(!guard.allowed(), 'a speed poll must not freshen a cached Park reading');
        assert.strictEqual(guard.reason(), 'Vehicle signals are stale');
        f.callbacks.powertrain({ statusGearSelectionDrive: 'P' }); assert(guard.allowed());
        console.log('PASS event-only gear, both selector variants, speed polling and stale-Park rejection');
    } finally { await signals.close(); }
    f.callbacks.speed({ speedVehicleCentreOfGravity: 0 });
    f.callbacks.powertrain({ statusGearSelectionDrive: 'P' });
    assert(!guard.allowed(), 'callbacks after shutdown cannot reauthorise output');
    assert.strictEqual(f.counts().shutdowns, 2);

    const fallback = fixture(); delete fallback.proxies[GEAR].statusGearboxDrive;
    const fallbackGuard = new ParkGuard();
    const fallbackSignals = new VehicleSignals(fallbackGuard, null, fallback.sdk);
    try {
        await fallbackSignals.start(); await turn(); await turn();
        fallback.callbacks.powertrain({ statusGearSelectionDrive: 'P' });
        assert(fallbackGuard.allowed());
        assert.strictEqual(fallbackSignals.errors.length, 0);
        console.log('PASS DataPowerTrain2 works when the primary selector field is absent');
    } finally { await fallbackSignals.close(); }

    const absent = fixture(); const absentGuard = new ParkGuard();
    const absentSignals = new VehicleSignals(absentGuard, null, {
        buildTypedProxy: (name, instance) => name === GEAR ? Promise.reject(new Error('interface unavailable')) : absent.sdk.buildTypedProxy(name, instance)
    });
    try {
        await absentSignals.start(); await turn(); await turn();
        assert(!absentGuard.allowed());
        assert(absentSignals.errors.some((e) => /stage: interface unavailable/.test(e)));
        console.log('PASS unavailable vehicle interfaces stay blocked and report a diagnostic');
    } finally { await absentSignals.close(); }

    const late = fixture(); let deliver;
    const lateSignals = new VehicleSignals(new ParkGuard(), null, {
        buildTypedProxy: (name, instance) => name === SPEED ? new Promise((resolve) => { deliver = resolve; }) : late.sdk.buildTypedProxy(name, instance)
    });
    const starting = lateSignals.start();
    while (!deliver) await turn();
    await lateSignals.close(); deliver(late.proxies[SPEED]); await starting;
    assert.strictEqual(late.counts().shutdowns, 2);
    assert.deepStrictEqual(late.callbacks, {});
    console.log('PASS shutdown during startup closes late proxies without subscribing');
})().catch((e) => { console.error(e); process.exitCode = 1; });

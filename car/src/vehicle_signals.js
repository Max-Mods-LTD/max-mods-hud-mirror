// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const builders = require('oap-sdk/src/someip/someipBuilders');

function timeout(p, ms) {
    let timer;
    return Promise.race([p, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Vehicle signal timed out')), ms); })])
        .then((v) => { clearTimeout(timer); return v; }, (e) => { clearTimeout(timer); throw e; });
}
function tick(fn) { return new Promise((resolve) => setImmediate(resolve)).then(fn); }

/* Read-only SDK proxies, generated from this app's manifest on the unit.
 * A quiet provider cannot authorise output: ParkGuard expires readings. */
class VehicleSignals {
    constructor(guard, changed) {
        this.guard = guard; this.changed = changed || function () {};
        this.closed = false; this.proxies = []; this.timers = []; this.errors = [];
    }
    start() {
        const watches = [
            ['de.bmw.infotainment.vehicle.Vehicle2', 'speed', [
                ['statusCarSpeed2', (v) => this.guard.updateSpeed(v)]
            ]],
            ['de.bmw.infrastructure.VehicleInformation', 'stage', [
                ['statusGearboxDrive', (v) => this.guard.updateStage(v, 'statusActualStageDrive')],
                ['DataPowerTrain2', (v) => this.guard.updateStage(v, 'statusGearSelectionDrive')]
            ]]
        ];
        return Promise.all(watches.map((w) => {
            let proxy;
            return tick(() => timeout(builders.buildTypedProxy(w[0], '1'), 3000))
                .then((p) => { proxy = p; this.proxies.push(p); return tick(() => timeout(p.init(), 3000)); })
                .then(() => tick(() => timeout(proxy.waitUntilAvailable(), 5000)))
                .then(() => {
                    if (this.closed) return;
                    const choices = w[2].filter((x) => proxy[x[0]] && typeof proxy[x[0]].getValue === 'function');
                    if (!choices.length) throw new Error('No readable ' + w[1] + ' field');
                    let busy = false;
                    const poll = () => {
                        if (busy || this.closed) return;
                        busy = true;
                        const read = (i) => {
                            if (this.closed) return Promise.resolve();
                            const field = choices[i];
                            return tick(() => timeout(proxy[field[0]].getValue(), 1000)).then((v) => {
                                if (!this.closed) { field[1](v); this.changed(); }
                            }).catch(() => {
                                if (i + 1 < choices.length) return read(i + 1);
                                this.guard.invalidate(w[1]); this.changed();
                            });
                        };
                        read(0).then(() => { busy = false; }, () => { busy = false; });
                    };
                    // Notifications stop promptly on movement. Polls refresh
                    // unchanged readings from a stationary vehicle.
                    choices.forEach((field, i) => {
                        if (i > 0) return;
                        tick(() => proxy[field[0]].subscribe((v) => {
                            if (!this.closed) { field[1](v); this.changed(); }
                        })).catch(() => {});
                    });
                    this.timers.push(setInterval(poll, 600)); poll();
                }).catch((e) => {
                    this.guard.invalidate(w[1]); this.errors.push(w[1] + ': ' + e.message); this.changed();
                });
        }));
    }
    close() {
        this.closed = true; this.guard.invalidate(); this.timers.forEach(clearInterval);
        return Promise.all(this.proxies.map((p) => Promise.resolve().then(() => p.shutdown && p.shutdown()).catch(() => {})));
    }
}
module.exports = { VehicleSignals };

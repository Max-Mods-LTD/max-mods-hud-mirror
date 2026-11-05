// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

function timeout(p, ms) {
    let timer;
    return Promise.race([p, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Vehicle signal timed out')), ms); })])
        .then((v) => { clearTimeout(timer); return v; }, (e) => { clearTimeout(timer); throw e; });
}
// The native binding needs calls on fresh ticks, one at a time.
let nativeQueue = Promise.resolve();
function tick(fn) {
    const run = () => new Promise((resolve, reject) => setImmediate(() => {
        try { Promise.resolve(fn()).then(resolve, reject); } catch (e) { reject(e); }
    }));
    const pending = nativeQueue.then(run, run);
    nativeQueue = pending.catch(() => {});
    return pending;
}

/* Read-only SDK proxies, generated from this app's manifest on the unit.
 * A quiet provider cannot authorise output: ParkGuard expires readings. */
class VehicleSignals {
    constructor(guard, changed, sdk) {
        this.guard = guard; this.changed = changed || function () {};
        this.builders = sdk || require('oap-sdk/src/someip/someipBuilders');
        this.closed = false; this.proxies = []; this.timers = []; this.errors = [];
    }
    recordError(message){
        if(this.errors[this.errors.length-1]!==message)this.errors.push(message);
        if(this.errors.length>12)this.errors.splice(0,this.errors.length-12);
        this.changed();
    }
    start() {
        const watches = [
            ['de.bmw.infotainment.vehicle.Vehicle2', 'speed', [
                ['statusCarSpeed2', (v) => this.guard.updateSpeed(v)]
            ]],
            ['de.bmw.infrastructure.VehicleInformation', 'stage', [
                ['statusGearboxDrive', (v) => this.guard.updateStage(v, 'statusActualStageDrive')],
                ['DataPowerTrain2', (v) => this.guard.updateStage(v, 'statusGearSelectionDrive')],
                ['DataPowerTrain2CRC', (v) => this.guard.updateStage(v, 'statusGearSelectionDrive')]
            ]]
        ];
        return Promise.all(watches.map((w) => {
            let proxy;
            return tick(() => timeout(this.builders.buildTypedProxy(w[0], '1'), 3000))
                .then((p) => {
                    proxy = p;
                    if (this.closed) return Promise.resolve(p.shutdown && p.shutdown());
                    this.proxies.push(p);
                    return tick(() => this.closed ? undefined : timeout(p.init(), 3000));
                })
                .then(() => this.closed ? undefined : tick(() => this.closed ? undefined : timeout(proxy.waitUntilAvailable(), 5000)))
                .then(async () => {
                    if (this.closed) return;
                    // Gear is notification-only, even if an SDK wrapper happens
                    // to expose getValue. Subscribe to BOTH variants: some cars
                    // publish DataPowerTrain2 but never statusGearboxDrive.
                    const choices = w[1] === 'speed' ? w[2].filter((x) => proxy[x[0]] && typeof proxy[x[0]].getValue === 'function') : [];
                    let subscriptions = 0; const subscribed = [];
                    for (const field of w[2]) {
                        if (this.closed) return;
                        if (!proxy[field[0]] || typeof proxy[field[0]].subscribe !== 'function') continue;
                        try {
                            const notify = (v) => {
                                if (!this.closed) { field[1](v); this.changed(); }
                            };
                            const id = await tick(() => this.closed ? undefined : timeout(proxy[field[0]].subscribe((v) => {
                                if (!this.closed) { field[1](v); this.changed(); }
                            }), 3000));
                            subscriptions++; subscribed.push({field, notify, id});
                        } catch (e) {
                            this.recordError(w[1] + ': ' + field[0] + ': ' + e.message);
                        }
                    }
                    if (this.closed) return;
                    if (!choices.length && !subscriptions) throw new Error('No live ' + w[1] + ' field');
                    // Never refresh a cached gear value on a timer. Only a real
                    // notification may refresh ParkGuard's freshness deadline.
                    if (!choices.length) {
                        // An initial SOME/IP event is a real current reading. Renew
                        // quiet event-only subscriptions instead of extending a
                        // cached Park timestamp or inventing an unsupported getter.
                        let renewing=false;
                        const renew=async()=>{
                            if(this.closed||renewing||this.guard.stageAt!==null&&this.guard.clock()-this.guard.stageAt<1200)return;
                            renewing=true;
                            try{for(const sub of subscribed){
                                const field=proxy[sub.field[0]];
                                if(!field||typeof field.unsubscribe!=='function'||sub.id===undefined)continue;
                                await tick(()=>this.closed?undefined:timeout(field.unsubscribe(sub.id),800));
                                if(!this.closed)sub.id=await tick(()=>timeout(field.subscribe(sub.notify),1000));
                            }}catch(e){if(!this.closed)this.recordError('Park refresh: '+e.message);}
                            finally{renewing=false;}
                        };
                        this.timers.push(setInterval(renew,700)); return;
                    }
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
                    // Speed has a getter; real reads refresh an unchanged zero.
                    this.timers.push(setInterval(poll, 600)); poll();
                }).catch((e) => {
                    if (this.closed) return;
                    this.guard.invalidate(w[1]); this.recordError(w[1] + ': ' + e.message);
                });
        }));
    }
    close() {
        this.closed = true; this.guard.invalidate(); this.timers.forEach(clearInterval);
        return Promise.all(this.proxies.map((p) => Promise.resolve().then(() => p.shutdown && p.shutdown()).catch(() => {})));
    }
}
module.exports = { VehicleSignals, nativeTick: tick, withSignalTimeout: timeout };

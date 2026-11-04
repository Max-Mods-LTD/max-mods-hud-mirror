// SPDX-License-Identifier: GPL-3.0-or-later
// RHMI entry-point lifecycle follows Robert Nisipeanu's Store app examples.
'use strict';
const OnlineApp = require('oap-sdk/src/core/OnlineApp.js');
const logging = require('oap-sdk/src/logging/logging');
const { spell } = require('./speller.js');
const { ParkGuard } = require('./park_guard.js');
const { VehicleSignals } = require('./vehicle_signals.js');
const { MirrorController } = require('./mirror_controller.js');
const release = require('./release_notes.js');
const logger = logging.getSDKLogger();
const STATE = 'ST_MaxModsHudMirror';
const NAMES = ['mirrorStatus', 'mirrorPark', 'mirrorPhone', 'mirrorTest', 'mirrorPair', 'mirrorStart', 'mirrorStop', 'mirrorLayout',
    'mirrorWhatsNew', 'mirrorReleaseLine1', 'mirrorReleaseLine2', 'mirrorReleasePrevious', 'mirrorReleaseNext'];

class HudMirrorApp extends OnlineApp {
    constructor() {
        super();
        this._ui = {}; this._written = {}; this._actions = {}; this._pressAt = {};
        this._done = false; this._spelling = false; this._visible = false; this._hide = null;
        this._releaseIndex = 0;
        this.guard = new ParkGuard();
        this.mirror = new MirrorController(this.guard);
        this.signals = new VehicleSignals(this.guard, () => { this.mirror.checkPark(); this.render(); });
        this.mirror.on('change', () => this.render());
        this.on('initialized', () => this.initUi().catch((e) => {
            logger.error('HUD Mirror initialisation: ' + e.message);
            this.mirror.close();
        }));
        this.on('entryPointExecute', (uuid) => {
            this._visible = true;
            if (this.rhmiApplication) Promise.resolve(this.rhmiApplication.openEntryState(uuid)).catch(() => {});
        });
        this.on('changeVisibility', (d) => { if (d && d.visible === false && !this._spelling) this.hide(); });
        this.on('shutdown', () => this.shutdown());
        this.on('error', (e) => logger.warn('HUD Mirror: ' + e.message));
    }
    initUi() {
        if (!this.rhmiApplication) return this.initialized();
        const rhmi = this.rhmiApplication;
        this._state = rhmi.getByName(STATE);
        if (!this._state) throw new Error('Missing HUD Mirror page');
        NAMES.forEach((n) => {
            this._ui[n] = rhmi.getByName(n);
            if (!this._ui[n]) throw new Error('Missing UI row ' + n);
        });
        this.bind('mirrorTest', () => this.mirror.start(true));
        this.bind('mirrorPair', () => this.pairPhone());
        this.bind('mirrorStart', () => this.mirror.start(false));
        this.bind('mirrorStop', () => this.mirror.stop());
        this.bind('mirrorLayout', () => this.mirror.toggleLayout());
        this.bind('mirrorReleasePrevious', () => this.releaseNote(-1));
        this.bind('mirrorReleaseNext', () => this.releaseNote(1));
        rhmi.on('userEvent', (ev) => {
            const n = ev && ev.eventType === 'ACTION' && this._actions[Number(ev.sourceId)];
            if (n) this.press(n.name, n.fn);
        });
        this._state.on('visible', (ev) => {
            clearTimeout(this._hide);
            if (ev && (ev.visible === true || ev.visible === 1 || ev.visible === '1')) this._visible = true;
            else if (!this._spelling) this._hide = setTimeout(() => this.hide(), 800);
        });
        rhmi.on('restoreHmi', () => { this._written = {}; this.render(); });
        return this._state.updateResources().then(() => {
            const entries = (this.appDescription && this.appDescription.application.entryPoints) || [];
            const ep = this.getEntryPoints().find((e) => entries.some((d) => d.uuid === e.getDescription().uuid));
            if (!ep) throw new Error('No HUD Mirror entry point');
            const desc = ep.getDescription();
            return ep.init().then(() => rhmi.mapEntryState(desc.uuid, this._state))
                .then(() => ep.entryPoint.setText(desc.textId))
                .then(() => ep.entryPoint.setIcon(desc.icon))
                .then(() => ep.setAvailability('ENABLED'));
        }).then(() => {
            this.registerActive();
            return this.initialized();
        }).then(() => {
            this._visible = true;
            this.signals.start();
            this._refresh = setInterval(() => { this.mirror.checkPark(); this.render(); }, 300);
            this.render();
            const uuid = this.getLastExecutedEntryPointUuid && this.getLastExecutedEntryPointUuid();
            if (uuid) return rhmi.openEntryState(uuid);
        });
    }
    bind(name, fn) {
        const c = this._ui[name];
        this._actions[Number(c.getId())] = { name, fn };
        c.on('action', () => this.press(name, fn));
    }
    press(name, fn) {
        if (this._done || this._spelling || Date.now() - (this._pressAt[name] || 0) < 400) return;
        this._pressAt[name] = Date.now();
        try { Promise.resolve(fn()).catch((e) => this.mirror.note(e.message)); }
        catch (e) { this.mirror.note(e.message); }
    }
    pairPhone() {
        this.mirror.stop();
        this._spelling = true;
        return spell(this, 'Phone address/code').then((text) => {
            this._spelling = false;
            if (!this._done && text) return this.mirror.pair(text);
        }, (e) => { this._spelling = false; throw e; });
    }
    write(name, text) {
        if (!this._ui[name] || this._written[name] === text) return;
        this._written[name] = text;
        Promise.resolve(this._ui[name].setValue(0, 'Text', text, 'Text')).catch((e) => logger.warn('HUD Mirror row: ' + e.message));
    }
    releaseNote(step) {
        this._releaseIndex = (this._releaseIndex + step + release.lines.length) % release.lines.length;
        this.render();
    }
    render() {
        if (this._done) return;
        this.write('mirrorStatus', this.mirror.status.slice(0, 95));
        const blocked = this.guard.reason();
        this.write('mirrorPark', ((blocked && this.signals.errors[0]) || blocked || 'Stationary, Park confirmed').slice(0, 95));
        this.write('mirrorPhone', this.mirror.pairing ? 'Phone paired: ' + this.mirror.pairing.host : 'Start sharing on your phone, then select Pair phone');
        this.write('mirrorLayout', this.mirror.layout === 'compact' ? 'HUD size: Compact (space below for BMW)' : 'HUD size: Full screen');
        this.write('mirrorWhatsNew', "What's new in " + release.version + ' (' + (this._releaseIndex + 1) + '/' + release.lines.length + ')');
        this.write('mirrorReleaseLine1', release.lines[this._releaseIndex][0]);
        this.write('mirrorReleaseLine2', release.lines[this._releaseIndex][1] || '');
    }
    hide() {
        if (this._spelling) return;
        this._visible = false;
        this.mirror.stop('Stopped: HUD Mirror page closed');
    }
    shutdown() {
        if (this._done) return;
        this._done = true; clearTimeout(this._hide); clearInterval(this._refresh);
        this.mirror.close();
        return this.signals.close().then(() => this.destroyBundles()).catch(() => {}).then(() => process.exit(0));
    }
}

const app = new HudMirrorApp();
app.start().catch((e) => logger.error('HUD Mirror failed to start: ' + e.message));

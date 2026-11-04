// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const EventEmitter = require('events');
const { ClusterRender } = require('./cluster_render_client.js');
const { PhoneClient, WIDTH, HEIGHT } = require('./phone_client.js');

function testPattern() {
    const b = Buffer.alloc(WIDTH * HEIGHT * 4);
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
        const border = x < 3 || y < 3 || x >= WIDTH - 3 || y >= HEIGHT - 3;
        const cross = Math.abs(x - WIDTH / 2) < 2 || Math.abs(y - HEIGHT / 2) < 2;
        const bars = y > 185 && y < 213 && x > 35 && x < 365;
        const off = (y * WIDTH + x) * 4;
        const value = border || cross || (bars && Math.floor(x / 35) % 2 === 0) ? 210 : 0;
        b[off] = value; b[off + 1] = value; b[off + 2] = value; b[off + 3] = 255;
    }
    return b;
}

class MirrorController extends EventEmitter {
    constructor(guard, options) {
        super();
        const o = options || {};
        this.guard = guard;
        this.clock = o.clock || Date.now;
        this.makeRenderer = o.makeRenderer || (() => new ClusterRender('maxmods_hud_mirror'));
        this.makePhone = o.makePhone || (() => new PhoneClient());
        this.renderer = null; this.phone = this.makePhone(); this.pairing = null;
        this.generation = 0; this.layer = null; this.timer = null; this.watchdog = null;
        this.lastFrameAt = null; this.sessionAt = null; this.status = 'Stopped'; this.detail = '';
        this.running = false; this.pairingBusy = false; this.dead = false;
    }
    note(text) { this.status = text; this.emit('change'); }
    pair(text) {
        this.stop('Pairing phone');
        const epoch = this.generation;
        this.pairing = null; this.pairingBusy = true;
        return this.phone.pair(text).then((p) => {
            if (this.dead || epoch !== this.generation) return;
            this.pairing = p; this.note('Phone paired. Select Start mirror.');
        }).catch((e) => {
            if (epoch === this.generation) this.note(e.message);
        }).then(() => { if (epoch === this.generation) this.pairingBusy = false; });
    }
    start(test) {
        this.stop('Starting');
        if (this.dead) return;
        if (!this.guard.allowed()) { this.note(this.guard.reason()); return; }
        if (!test && !this.pairing) { this.note('Pair your phone first'); return; }
        this.running = true; this.sessionAt = this.clock();
        const epoch = this.generation;
        const r = this.renderer = this.makeRenderer();
        this.note(test ? 'Checking HUD display' : 'Connecting to phone');
        r.on('ready', () => {
            if (!this.running || epoch !== this.generation) return;
            // A reconnect must never replay the last phone image automatically.
            if (this.layer !== null) { this.stop('Renderer reconnected. Press Start again.'); return; }
            const match = /(?:^|,)hud:(\d+)x(\d+)(?:,|$)/.exec(r.targets || '');
            if (r.backend !== 'id7' || !match) { this.stop('This prototype requires an iDrive 7 HUD renderer'); return; }
            this.layer = r.image({ target: 'hud', klass: 'content', x: 0, y: 0,
                w: Number(match[1]), h: Number(match[2]), iw: WIDTH, ih: HEIGHT,
                fps: 4, sampling: 'bilinear', visible: false, exclusive: false,
                contend: false, guide_hold: false, opacity: 0.8 });
            if (test) {
                if (!this.guard.allowed()) { this.stop(this.guard.reason()); return; }
                r.pixels(this.layer, null, testPattern());
                r.set(this.layer, { visible: true });
                this.lastFrameAt = this.clock();
                this.timer = setTimeout(() => this.stop('HUD test ended'), 8000);
            } else this.poll(epoch);
        });
        r.on('target', (name, state, holder, reason) => {
            if (name !== 'hud' || epoch !== this.generation || !this.running) return;
            this.detail = state + (reason ? ': ' + reason : '');
            this.note(state === 'shown' ? (test ? 'HUD test active (8 seconds)' : 'Mirroring phone to HUD') : 'HUD: ' + this.detail);
        });
        r.on('refused', (op, ref, reason) => { if (epoch === this.generation) this.stop('HUD renderer refused: ' + reason); });
        r.on('disconnected', () => { if (epoch === this.generation) this.stop('HUD renderer disconnected'); });
        this.watchdog = setInterval(() => {
            if (!this.guard.allowed()) this.stop(this.guard.reason());
            else if (this.clock() - this.sessionAt > (test ? 10000 : 10 * 60 * 1000)) this.stop('Session ended. Start a new session.');
            else if (!test && this.lastFrameAt !== null && this.clock() - this.lastFrameAt > 1500) this.stop('Phone frames stopped');
            else if (this.layer === null && this.clock() - this.sessionAt > 5000) this.stop('HUD renderer did not respond');
        }, 200);
        r.connect();
    }
    poll(epoch) {
        if (!this.running || epoch !== this.generation) return;
        if (!this.guard.allowed()) { this.stop(this.guard.reason()); return; }
        this.phone.frame(this.pairing).then((pixels) => {
            if (!this.running || epoch !== this.generation) return;
            if (!this.guard.allowed()) { this.stop(this.guard.reason()); return; }
            if (pixels) {
                this.renderer.pixels(this.layer, null, pixels);
                this.renderer.set(this.layer, { visible: true });
                this.lastFrameAt = this.clock();
            } else if (this.lastFrameAt === null && this.clock() - this.sessionAt > 5000) {
                this.stop('No phone picture. Start sharing on the phone.'); return;
            }
            this.timer = setTimeout(() => this.poll(epoch), 250);
        }).catch((e) => { if (epoch === this.generation) { this.pairing = null; this.stop(e.message); } });
    }
    checkPark() { if (this.running && !this.guard.allowed()) this.stop(this.guard.reason()); }
    stop(reason) {
        this.generation++; this.running = false; this.pairingBusy = false;
        clearTimeout(this.timer); clearInterval(this.watchdog); this.timer = this.watchdog = null;
        if (this.renderer) {
            if (this.layer !== null) this.renderer.set(this.layer, { visible: false });
            this.renderer.close(); this.renderer = null;
        }
        this.layer = null; this.lastFrameAt = null;
        this.phone.close(); this.phone = this.makePhone();
        this.note(reason || 'Stopped');
    }
    close() { this.stop(); this.dead = true; this.phone.close(); this.pairing = null; }
}
module.exports = { MirrorController, testPattern };

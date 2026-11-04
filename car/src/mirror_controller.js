// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const EventEmitter = require('events');
const { ClusterRender } = require('./cluster_render_client.js');
const { PhoneClient, WIDTH, HEIGHT, BYTES } = require('./phone_client.js');

function hudRect(mode, width, height) {
    const area = mode === 'full' ? { x: 0, y: 0, w: width, h: height } :
        { x: width * 0.05, y: height * 0.02, w: width * 0.9, h: height * 0.7 };
    const scale = Math.min(area.w / WIDTH, area.h / HEIGHT);
    const w = Math.round(WIDTH * scale), h = Math.round(HEIGHT * scale);
    return { x: Math.round(area.x + (area.w - w) / 2), y: Math.round(area.y + (area.h - h) / 2), w, h };
}

function testPattern() {
    const b = Buffer.alloc(WIDTH * HEIGHT * 4);
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
        const border = x < 3 || y < 3 || x >= WIDTH - 3 || y >= HEIGHT - 3;
        const cross = Math.abs(x - WIDTH / 2) < 2 || Math.abs(y - HEIGHT / 2) < 2;
        const bars = y > HEIGHT * 0.77 && y < HEIGHT * 0.89 && x > WIDTH * 0.09 && x < WIDTH * 0.91;
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
        this.lastFrameAt = null; this.sessionAt = null; this.status = 'Stopped'; this.detail = ''; this.targetState = '';
        this.running = false; this.pairingBusy = false; this.dead = false;
        this.layout = o.layout === 'full' ? 'full' : 'compact';
        this.targetWidth = WIDTH; this.targetHeight = HEIGHT;
        this.streamAt = null; this.lastContactAt = null; this.latestPixels = null;
        this.lastRenderAt = null; this.frameTimes = []; this.captureState = 'waiting';
        this.pictureWaitAt = null; this.lastStatusAt = null; this.latestFrameId = 0;
        this.connectionGeneration = 0; this.retryCount = 0; this.retryTimer = null; this.healthySince = null;
    }
    note(text) { this.status = text; this.emit('change'); }
    videoStatus(text) { this.note(this.targetState && this.targetState !== 'shown' ? 'HUD: ' + this.detail + '; ' + text : text); }
    toggleLayout() {
        this.layout = this.layout === 'compact' ? 'full' : 'compact';
        if (this.renderer && this.layer !== null) this.renderer.set(this.layer, hudRect(this.layout, this.targetWidth, this.targetHeight));
        this.emit('change');
    }
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
            this.targetWidth = Number(match[1]); this.targetHeight = Number(match[2]);
            const geometry = hudRect(this.layout, this.targetWidth, this.targetHeight);
            const opts = Object.assign({ target: 'hud', klass: 'content', visible: false, exclusive: false,
                contend: false, guide_hold: false, opacity: 1 }, geometry);
            this.layer = test ? r.image(Object.assign(opts, { iw: WIDTH, ih: HEIGHT, sampling: 'bilinear' })) :
                r.video(Object.assign(opts, { vw: WIDTH, vh: HEIGHT, fps: 30, level_bits: 0,
                    dirty_threshold: 0, pan_blocks: true, stall_ms: 2500 }));
            if (test) {
                if (!this.guard.allowed()) { this.stop(this.guard.reason()); return; }
                r.pixels(this.layer, null, testPattern());
                r.set(this.layer, { visible: true });
                this.lastFrameAt = this.clock();
                this.timer = setTimeout(() => this.stop('HUD test ended'), 8000);
            } else this.beginStream(epoch);
        });
        r.on('target', (name, state, holder, reason) => {
            if (name !== 'hud' || epoch !== this.generation || !this.running) return;
            this.targetState = state;
            this.detail = state + (reason ? ': ' + reason : '');
            this.note(state === 'shown' ? (test ? 'HUD test active (8 seconds)' : 'Mirroring phone to HUD') : 'HUD: ' + this.detail);
        });
        r.on('refused', (op, ref, reason) => { if (epoch === this.generation) this.stop('HUD renderer refused: ' + reason); });
        r.on('disconnected', () => { if (epoch === this.generation) this.stop('HUD renderer disconnected'); });
        this.watchdog = setInterval(() => {
            if (!this.guard.allowed()) this.stop(this.guard.reason());
            else if (this.clock() - this.sessionAt > (test ? 10000 : 10 * 60 * 1000)) this.stop('Session ended. Start a new session.');
            else if (!test && this.streamAt !== null && this.clock() - (this.lastContactAt === null ? this.streamAt : this.lastContactAt) > 3500) {
                const e = new Error('Phone connection lost'); e.retryable = true; this.recoverPhone(epoch, e);
            }
            else if (!test && this.pictureWaitAt !== null && this.clock() - this.pictureWaitAt > 5000) this.stop('No phone picture. Start sharing on the phone.');
            else if (this.layer === null && this.clock() - this.sessionAt > 5000) this.stop('HUD renderer did not respond');
        }, 200);
        r.connect();
    }
    beginStream(epoch) {
        this.streamAt = this.pictureWaitAt = this.clock();
        const connection = ++this.connectionGeneration;
        const current = () => {
            if (!this.running || epoch !== this.generation || connection !== this.connectionGeneration) return false;
            if (!this.guard.allowed()) { this.stop(this.guard.reason()); return false; }
            return true;
        };
        this.phone.stream(this.pairing, {
            state: (state) => {
                if (!current()) return;
                const now = this.clock(), previous = this.captureState;
                this.lastContactAt = now; this.captureState = state;
                if (this.healthySince !== null && now - this.healthySince >= 5000) this.retryCount = 0;
                if (state !== 'active') {
                    this.renderer.set(this.layer, { visible: false }); this.latestPixels = null;
                    this.pictureWaitAt = state === 'hidden' ? null : this.pictureWaitAt === null ? now : this.pictureWaitAt;
                    this.note(state === 'hidden' ? 'Shared app hidden. Return to it on the phone.' : 'Waiting for phone picture');
                } else {
                    if (previous === 'hidden' && !this.latestPixels) this.pictureWaitAt = now;
                    // A verified live capture may legitimately show the same image.
                    // Refresh the renderer's video deadline only on live records,
                    // never on a local timer or after a lost/paused phone stream.
                    if (this.latestPixels && now - this.lastRenderAt >= 750) {
                        this.renderer.frame(this.layer, this.latestPixels, this.latestFrameId); this.lastRenderAt = now;
                    }
                    if (this.lastFrameAt !== null && now - this.lastFrameAt > 1000) this.videoStatus('Capture active; waiting for next picture');
                }
            },
            frame: (pixels, id) => {
                if (!current()) return;
                if (this.captureState !== 'active') return;
                if (pixels.length !== BYTES) { this.stop('Invalid phone video frame'); return; }
                const now = this.clock();
                if (this.healthySince === null) this.healthySince = now;
                this.latestPixels = pixels; this.latestFrameId = id;
                this.lastFrameAt = this.lastRenderAt = now; this.pictureWaitAt = null;
                this.renderer.frame(this.layer, pixels, id); this.renderer.set(this.layer, { visible: true });
                this.frameTimes.push(now);
                while (this.frameTimes.length && now - this.frameTimes[0] > 2000) this.frameTimes.shift();
                if (this.lastStatusAt === null || now - this.lastStatusAt >= 1000) {
                    const elapsed = Math.max(1, now - this.frameTimes[0]);
                    const fps = Math.round(Math.max(0, this.frameTimes.length - 1) * 1000 / elapsed);
                    this.videoStatus('Receiving ' + fps + ' fps'); this.lastStatusAt = now;
                }
            },
            error: (e) => { if (epoch === this.generation && connection === this.connectionGeneration) this.recoverPhone(epoch, e); }
        });
    }
    recoverPhone(epoch, error) {
        if (!this.running || epoch !== this.generation) return;
        if (!this.guard.allowed()) { this.stop(this.guard.reason()); return; }
        if (!error.retryable || this.retryCount >= 3) { this.stop(error.message); return; }
        this.connectionGeneration++;
        this.phone.close(); this.renderer.set(this.layer, { visible: false });
        this.latestPixels = null; this.lastFrameAt = null; this.lastContactAt = null;
        this.streamAt = null; this.pictureWaitAt = null; this.lastRenderAt = null;
        this.frameTimes = []; this.lastStatusAt = null; this.captureState = 'waiting'; this.healthySince = null;
        const attempt = ++this.retryCount;
        this.note('Video link lost - reconnecting ' + attempt + '/3');
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            if (!this.running || epoch !== this.generation) return;
            if (!this.guard.allowed()) { this.stop(this.guard.reason()); return; }
            this.phone = this.makePhone(); this.beginStream(epoch);
        }, [250,750,1500][attempt - 1]);
    }
    checkPark() { if (this.running && !this.guard.allowed()) this.stop(this.guard.reason()); }
    stop(reason) {
        this.generation++; this.running = false; this.pairingBusy = false;
        this.connectionGeneration++; clearTimeout(this.retryTimer); this.retryTimer = null; this.retryCount = 0; this.healthySince = null;
        clearTimeout(this.timer); clearInterval(this.watchdog); this.timer = this.watchdog = null;
        if (this.renderer) {
            if (this.layer !== null) this.renderer.set(this.layer, { visible: false });
            this.renderer.close(); this.renderer = null;
        }
        this.layer = null; this.lastFrameAt = null;
        this.latestPixels = null; this.lastContactAt = null; this.streamAt = null;
        this.pictureWaitAt = null; this.lastRenderAt = null; this.frameTimes = []; this.lastStatusAt = null;
        this.captureState = 'waiting';
        this.targetState = ''; this.detail = '';
        this.phone.close(); this.phone = this.makePhone();
        this.note(reason || 'Stopped');
    }
    close() { this.stop(); this.dead = true; this.phone.close(); this.pairing = null; }
}
module.exports = { MirrorController, testPattern, hudRect };

// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const spawn = require('child_process').spawn;
const path = require('path');
const fs = require('fs');

class JpegWorker {
    constructor(width, height) {
        this.bytes = width * height * 3 / 2;
        this.child = null; this.pending = null; this.buffer = Buffer.alloc(0); this.closed = false;
    }
    decode(payload) {
        if (this.closed || this.pending) return Promise.reject(new Error('JPEG decoder unavailable'));
        return new Promise((resolve, reject) => {
            this.pending = { resolve, reject };
            this.timer = setTimeout(() => this.fail(new Error('Video decoding timed out')), 2000);
            if (!this.child) {
                let executable;
                try { executable = this.executable(); }
                catch(e) { this.fail(new Error('Cannot prepare video decoder: ' + e.message)); return; }
                this.child = spawn(executable, [], { stdio: ['pipe','pipe','ignore'] });
                this.child.on('error', (e) => this.fail(new Error('Video decoder: ' + e.message)));
                this.child.on('exit', () => { this.cleanup(); this.fail(new Error('Invalid JPEG video frame')); });
                this.child.stdin.on('error', (e) => this.fail(e));
                this.child.stdout.on('data', (b) => this.data(b));
            }
            const head = Buffer.alloc(4); head.writeUInt32LE(payload.length, 0);
            this.child.stdin.write(head); this.child.stdin.write(payload);
        });
    }
    executable() {
        const source = path.join(__dirname, '..', 'assets', 'jpeg-decoder');
        try { fs.accessSync(source, fs.constants.X_OK); return source; } catch (_) {}
        // Older Store builders pack every app member as 0644. The SDK runner
        // gives this app its own writable ../../data folder. Use a private
        // executable copy there; no chmod of installed/root-owned files.
        const data = path.resolve(__dirname, '..', '..', 'data');
        if (!fs.lstatSync(data).isDirectory()) throw new Error('App data folder is unavailable');
        this.work = fs.mkdtempSync(path.join(data, 'jpeg-'));
        fs.chmodSync(this.work, 0o700);
        const dest = path.join(this.work, 'decode');
        fs.writeFileSync(dest, fs.readFileSync(source), {flag:'wx',mode:0o700});
        return dest;
    }
    cleanup() {
        if (!this.work) return;
        try { fs.unlinkSync(path.join(this.work, 'decode')); fs.rmdirSync(this.work); } catch (_) {}
        this.work = null;
    }
    data(b) {
        if (this.closed) return;
        this.buffer = Buffer.concat([this.buffer, b]);
        if (this.buffer.length > this.bytes + 4 || (this.buffer.length >= 4 && this.buffer.readUInt32LE(0) !== this.bytes)) {
            this.fail(new Error('Invalid decoded video size')); return;
        }
        if (this.buffer.length === this.bytes + 4) {
            const p = this.pending, pixels = this.buffer.slice(4);
            this.pending = null; this.buffer = Buffer.alloc(0); clearTimeout(this.timer);
            if (!p) { this.fail(new Error('Unexpected decoded frame')); return; }
            p.resolve(pixels);
        }
    }
    fail(e) { this.close(e); }
    close(error) {
        this.closed = true; clearTimeout(this.timer); this.buffer = Buffer.alloc(0);
        if (this.child) this.child.kill(); else this.cleanup(); this.child = null;
        const p = this.pending; this.pending = null;
        if (p) p.reject(error || new Error('Video decoder closed'));
    }
}
module.exports = { JpegWorker };

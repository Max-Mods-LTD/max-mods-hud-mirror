// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const { JpegWorker } = require('./jpeg_worker.js');
const WIDTH = 768, HEIGHT = 432, BYTES = WIDTH * HEIGHT * 3 / 2;
const MAX_WIRE_BYTES = 600000, HEADER = 13;

class StreamDecoder {
    constructor(events, options) {
        const o = options || {};
        this.worker = new JpegWorker(o.width || WIDTH, o.height || HEIGHT);
        this.decode = o.decode || ((payload) => this.worker.decode(payload));
        this.events = events; this.buffer = Buffer.alloc(0); this.closed = false;
        this.lastWireId = 0; this.pending = null; this.decoding = false; this.epoch = 0;
    }
    fail(e) { if (!this.closed) { this.close(); this.events.error(e); } }
    push(chunk) {
        if (this.closed) return;
        try {
            this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
            let offset = 0;
            while (this.buffer.length - offset >= HEADER) {
                const length = this.buffer.readUInt32LE(offset), kind = this.buffer[offset + 4];
                const id = this.buffer.readUInt32LE(offset + 5) + this.buffer.readUInt32LE(offset + 9) * 0x100000000;
                if (length > MAX_WIRE_BYTES || !Number.isSafeInteger(id) || kind < 1 || kind > 5 ||
                    (kind === 1 ? !length || id <= this.lastWireId : length !== 0)) throw new Error('Invalid phone stream record');
                if (this.buffer.length - offset < HEADER + length) break;
                if (kind === 5) { this.fail(new Error('Phone capture stopped. Start sharing again.')); return; }
                const state = kind === 3 ? 'waiting' : kind === 4 ? 'hidden' : 'active';
                if (state !== 'active') { this.epoch++; this.pending = null; }
                this.events.state(state);
                if (this.closed) return;
                if (kind === 1) {
                    this.lastWireId = id;
                    // At most one in-flight decode and one latest waiting frame.
                    this.pending = { payload: Buffer.from(this.buffer.slice(offset + HEADER, offset + HEADER + length)), id, epoch: this.epoch };
                    this.pump();
                }
                offset += HEADER + length;
            }
            this.buffer = this.buffer.slice(offset);
            if (this.buffer.length > MAX_WIRE_BYTES + HEADER) throw new Error('Phone stream buffer exceeded its limit');
        } catch (e) { this.fail(e); }
    }
    pump() {
        if (this.closed || this.decoding || !this.pending) return;
        const frame = this.pending; this.pending = null; this.decoding = true;
        this.decode(frame.payload).then((pixels) => {
            this.decoding = false;
            if (!this.closed && frame.epoch === this.epoch) this.events.frame(pixels, frame.id);
            this.pump();
        }).catch((e) => { this.decoding = false; this.fail(e); });
    }
    close() { this.closed = true; this.pending = null; this.buffer = Buffer.alloc(0); this.epoch++; this.worker.close(); }
}
module.exports = { StreamDecoder, WIDTH, HEIGHT, BYTES, MAX_WIRE_BYTES, HEADER };

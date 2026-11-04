// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('assert');
const zlib = require('zlib');
const { StreamDecoder, inflateFrame, BYTES, MAX_WIRE_BYTES } = require('../car/src/stream_decoder.js');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function record(kind, id, payload) {
    payload = payload || Buffer.alloc(0);
    const header = Buffer.alloc(13); header.writeUInt32LE(payload.length, 0); header[4] = kind;
    header.writeUInt32LE(id >>> 0, 5); header.writeUInt32LE(Math.floor(id / 0x100000000), 9);
    return Buffer.concat([header, payload]);
}
async function until(fn) { for (let i = 0; i < 200; i++) { if (fn()) return; await delay(5); } throw new Error('Decode timed out'); }
(async () => {
    const pixels = Buffer.alloc(BYTES, 127), compressed = zlib.deflateSync(pixels, { level: 1 });
    assert((await inflateFrame(compressed)).equals(pixels));
    await assert.rejects(inflateFrame(zlib.deflateSync(Buffer.alloc(BYTES + 1))), /exceeded/);
    await assert.rejects(inflateFrame(zlib.deflateSync(Buffer.alloc(4))), /size/);
    await assert.rejects(inflateFrame(Buffer.from('broken')), /./);
    const seen = [], states = [], errors = [];
    const decoder = new StreamDecoder({ frame: (p, id) => { assert(p.equals(pixels)); seen.push(id); }, state: (s) => states.push(s), error: (e) => errors.push(e) });
    const first = record(1, 1, compressed);
    for (let i = 0; i < first.length; i++) decoder.push(first.slice(i, i + 1));
    await until(() => seen.length === 1);
    decoder.push(record(2, 1)); await delay(10); assert.deepStrictEqual(seen, [1]);
    for (let id = 2; id <= 200; id++) decoder.push(record(1, id, compressed));
    await until(() => seen[seen.length - 1] === 200);
    assert(seen.length <= 4, 'slow decoding must discard intermediate frames instead of queueing them');
    assert.strictEqual(errors.length, 0); assert(states.every((s) => s === 'active')); decoder.close();
    console.log('PASS fragmented records, lossless bounded inflation, unchanged-screen heartbeats and latest-frame delivery');

    const late = [], hidden = new StreamDecoder({ frame: (p, id) => late.push(id), state: () => {}, error: (e) => { throw e; } });
    hidden.push(record(1, 1, compressed)); hidden.push(record(4, 1));
    await delay(30); assert.deepStrictEqual(late, []);
    hidden.push(record(2, 1)); await delay(10); assert.deepStrictEqual(late, []);
    hidden.push(record(1, 2, compressed)); await until(() => late.length === 1); assert.deepStrictEqual(late, [2]); hidden.close();
    console.log('PASS hiding the shared app discards an in-flight decode and requires a new picture');

    for (const bad of [record(0, 0), record(1, 0, compressed), record(2, 1, Buffer.from('x')),
        (() => { const h = Buffer.alloc(13); h.writeUInt32LE(MAX_WIRE_BYTES + 1); h[4] = 1; return h; })()]) {
        let refused;
        const d = new StreamDecoder({ frame: () => { throw new Error('bad record delivered'); }, state: () => {}, error: (e) => { refused = e; } });
        d.push(bad); assert(refused); assert(d.closed);
    }
    let stopped;
    const end = new StreamDecoder({ frame: () => {}, state: () => {}, error: (e) => { stopped = e; } });
    end.push(record(5, 0)); assert(/capture stopped/.test(stopped.message));
    console.log('PASS malformed/oversized records and capture-stop messages fail closed');
})().catch((e) => { console.error(e); process.exitCode = 1; });

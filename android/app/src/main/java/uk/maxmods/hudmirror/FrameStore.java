// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;

import java.io.ByteArrayOutputStream;
import java.util.zip.Deflater;
import java.util.zip.DeflaterOutputStream;
import java.io.IOException;

/** One latest compressed picture. Capture liveness is separate from image age:
 * Android need not produce new buffers while the screen is unchanged. */
public final class FrameStore {
    // Native motion packing costs width*height/2 per frame. At 30 fps this
    // stays below cluster-render's default 5500 KiB/s shared upload cap.
    public static final int WIDTH = 768;
    public static final int HEIGHT = 432;
    public static final int FPS = 30;
    public static final int BYTES = WIDTH * HEIGHT * 3 / 2;
    public static final int MAX_WIRE_BYTES = BYTES + 4096;
    public static final long LIVENESS_MS = 2500;
    public interface Clock { long nanoTime(); }
    public static final class Frame {
        public final byte[] compressed;
        public final long id;
        public final long createdNs;
        Frame(byte[] p, long i, long ns) { compressed = p; id = i; createdNs = ns; }
    }
    public static final class Snapshot {
        public final String state;
        public final Frame frame;
        public final long version;
        Snapshot(String s, Frame f, long v) { state = s; frame = f; version = v; }
    }
    private final Clock clock;
    private Frame frame;
    private long counter, version, aliveAt;
    private boolean alive, visible = true, stopped;
    public FrameStore() { this(new Clock() { public long nanoTime() { return System.nanoTime(); } }); }
    public FrameStore(Clock c) { clock = c; }
    public void publish(byte[] pixels) {
        if (pixels == null || pixels.length != BYTES) throw new IllegalArgumentException("Invalid video frame length");
        Deflater deflater = new Deflater(Deflater.BEST_SPEED);
        byte[] compressed;
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            DeflaterOutputStream out = new DeflaterOutputStream(bytes, deflater);
            out.write(pixels); out.finish(); compressed = bytes.toByteArray();
        } catch (IOException e) { throw new IllegalStateException("Frame compression failed", e); }
        finally { deflater.end(); }
        if (compressed.length > MAX_WIRE_BYTES) throw new IllegalStateException("Compressed frame is too large");
        synchronized (this) {
            if (stopped || !visible) return;
            frame = new Frame(compressed, ++counter, clock.nanoTime()); version++; notifyAll();
        }
    }
    // Called by the capture worker only after checking the projection/display.
    // HTTP requests never renew this deadline or the picture's capture time.
    public synchronized void heartbeat() { if (!stopped) { alive = true; aliveAt = clock.nanoTime(); } }
    public synchronized void visible(boolean value) {
        if (visible == value || stopped) return;
        visible = value; frame = null; version++; notifyAll();
    }
    public synchronized Snapshot snapshot(long after) {
        long age = clock.nanoTime() - aliveAt;
        String state = stopped ? "stopped" : !alive || age < 0 || age > LIVENESS_MS * 1000000L ? "stalled" : !visible ? "hidden" : frame == null ? "waiting" : "active";
        return new Snapshot(state, state.equals("active") && frame.id > after ? frame : null, version);
    }
    public synchronized void awaitChange(long seen, long ms) throws InterruptedException {
        if (!stopped && seen == version && ms > 0) wait(ms);
    }
    public synchronized void clear() { stopped = true; frame = null; alive = false; version++; notifyAll(); }
}

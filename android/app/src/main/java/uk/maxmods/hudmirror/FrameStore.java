// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;

/** Bounded, volatile frame storage: a single latest image, no disk writes. */
public final class FrameStore {
    public static final int WIDTH = 400;
    public static final int HEIGHT = 240;
    public static final int BYTES = WIDTH * HEIGHT * 4;
    public static final long STALE_MS = 1500;
    public static final class Frame {
        public final byte[] pixels;
        public final long id;
        public final long createdNs;
        Frame(byte[] p, long i, long ns) { pixels = p; id = i; createdNs = ns; }
    }
    private Frame frame;
    private long counter;
    public synchronized void publish(byte[] pixels) {
        if (pixels == null || pixels.length != BYTES) throw new IllegalArgumentException("Invalid RGBA frame length");
        frame = new Frame(pixels, ++counter, System.nanoTime());
    }
    public synchronized Frame latest(long after) {
        if (frame == null || frame.id <= after || System.nanoTime() - frame.createdNs > STALE_MS * 1000000L) return null;
        return frame;
    }
    public synchronized void clear() { frame = null; }
}

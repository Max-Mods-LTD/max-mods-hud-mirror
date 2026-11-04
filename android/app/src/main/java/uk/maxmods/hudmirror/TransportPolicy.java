// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;

/** Bounds picture traffic and adapts capture work to the measured socket,
 * without controlling Bluetooth, audio focus or the car's volume. */
public final class TransportPolicy {
    public static final String AUTO = "auto", BLUETOOTH = "bluetooth", QUALITY = "quality";
    private final FrameStore.Clock clock;
    private String mode = AUTO;
    private boolean bluetooth;
    private int frequency, level, fps = FrameStore.FPS, slow, fast;
    private long adjustedAt;
    private long sampledAt;
    public TransportPolicy() { this(new FrameStore.Clock() { public long nanoTime() { return System.nanoTime(); } }); }
    public TransportPolicy(FrameStore.Clock c) { clock = c; adjustedAt = c.nanoTime(); }
    private boolean audioPriority() { return mode.equals(BLUETOOTH) || mode.equals(AUTO) && bluetooth && (frequency < 4900); }
    private int baseline() { return audioPriority() ? 1 : 0; }
    private void reset() { level = baseline(); fps = FrameStore.FPS; slow = fast = 0; sampledAt = 0; adjustedAt = clock.nanoTime(); }
    public synchronized void setMode(String value) {
        if (!AUTO.equals(value) && !BLUETOOTH.equals(value) && !QUALITY.equals(value)) value = AUTO;
        if (!mode.equals(value)) { mode = value; reset(); }
    }
    public synchronized void radio(boolean bt, int mhz) {
        boolean was = audioPriority(); bluetooth = bt; frequency = mhz;
        if (was != audioPriority()) reset();
    }
    public synchronized int capturePercent() { return new int[] {100,75,50,38,25}[level]; }
    public synchronized int targetFps() { return fps; }
    public synchronized int level() { return level; }
    public synchronized String mode() { return mode; }
    public synchronized long bytesPerSecond() { return mode.equals(QUALITY) ? 0 : audioPriority() ? 2L * 1024 * 1024 : 8L * 1024 * 1024; }
    public synchronized long intervalNs(int bytes) {
        long rate = bytesPerSecond();
        return Math.max(1000000000L / fps, rate == 0 ? 0 : ((long) bytes * 1000000000L + rate - 1) / rate);
    }
    public synchronized void sent(int bytes, long writeNs) {
        long rate = bytesPerSecond(), now = clock.nanoTime(), period = 1000000000L / fps;
        long cost = Math.max(writeNs, rate == 0 ? 0 : (long) bytes * 1000000000L / rate);
        boolean sparse = sampledAt == 0 || now - sampledAt > 500000000L;
        sampledAt = now;
        // One detailed picture after a quiet interval is not a 30-fps load.
        if (sparse && writeNs < 250000000L) { slow = fast = 0; return; }
        if (cost > period * 5 / 4) {
            slow++; fast = 0;
            if ((slow >= 3 || cost > period * 4) && now - adjustedAt >= 250000000L) {
                if (!mode.equals(QUALITY) && level < 4) level++;
                else fps = Math.max(10, Math.min(fps - 5, (int) (850000000L / Math.max(1, cost))));
                slow = 0; adjustedAt = now;
            }
        } else {
            slow = 0;
            if (cost < period / 2) fast++; else fast = 0;
            if (fast >= 90 && now - adjustedAt >= 8000000000L) {
                if (fps < FrameStore.FPS) fps = Math.min(FrameStore.FPS, fps + 5);
                else if (level > baseline()) level--;
                fast = 0; adjustedAt = now;
            }
        }
    }
    public synchronized void idle() {
        long now = clock.nanoTime();
        if (!mode.equals(QUALITY) && level > 0 && now - adjustedAt > 2000000000L) {
            level--; fps = Math.min(FrameStore.FPS, fps + 5); slow = fast = 0; adjustedAt = now;
        }
    }
    public synchronized String description() {
        String name = mode.equals(QUALITY) ? "Quality priority" : audioPriority() ? "Bluetooth priority" : "Auto";
        return name + " · target " + fps + " fps · " + capturePercent() + "% capture detail";
    }
}

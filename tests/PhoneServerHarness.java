// SPDX-License-Identifier: GPL-3.0-or-later
import uk.maxmods.hudmirror.*;
import java.net.*;
import java.io.*;
import java.nio.ByteBuffer;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.InflaterInputStream;

public class PhoneServerHarness {
    private static void check(boolean value, String reason) { if (!value) throw new AssertionError(reason); }
    private static void storeTests() throws Exception {
        final long[] now = {1000000L};
        FrameStore store = new FrameStore(new FrameStore.Clock() { public long nanoTime() { return now[0]; } });
        check(store.snapshot(0).state.equals("stalled"), "No worker heartbeat must fail closed");
        store.heartbeat(); check(store.snapshot(0).state.equals("waiting"), "No picture yet");
        boolean rejected = false;
        try { store.publish(new byte[4]); } catch (IllegalArgumentException e) { rejected = true; }
        check(rejected, "Invalid dimensions accepted");
        byte[] pixels = new byte[FrameStore.BYTES]; new Random(42).nextBytes(pixels);
        store.publish(pixels);
        FrameStore.Frame first = store.snapshot(0).frame;
        check(first != null && first.id == 1 && store.snapshot(1).frame == null, "Frame sequence");
        check(first.compressed.length <= FrameStore.MAX_WIRE_BYTES, "Compression limit");
        ByteArrayOutputStream raw = new ByteArrayOutputStream();
        InflaterInputStream inflater = new InflaterInputStream(new ByteArrayInputStream(first.compressed));
        byte[] chunk = new byte[16384]; for (int n; (n = inflater.read(chunk)) != -1;) raw.write(chunk, 0, n);
        check(Arrays.equals(pixels, raw.toByteArray()), "Lossless compression changed pixels");
        now[0] += 2000000000L; store.heartbeat(); now[0] += 1000000000L;
        check(store.snapshot(0).state.equals("active"), "Unchanged screen with live capture was rejected");
        check(store.snapshot(0).frame.createdNs == first.createdNs, "Heartbeat fabricated a fresh picture");
        now[0] += (FrameStore.LIVENESS_MS + 1) * 1000000L;
        check(store.snapshot(0).state.equals("stalled") && store.snapshot(0).frame == null, "Stalled worker exposed a screenshot");
        store.heartbeat(); store.visible(false);
        check(store.snapshot(0).state.equals("hidden") && store.snapshot(0).frame == null, "Hidden content exposed");
        store.visible(true); check(store.snapshot(0).state.equals("waiting"), "Resume replayed an old picture");
        store.publish(pixels); check(store.snapshot(0).frame.id == 2, "Sequence reset");
        store.clear(); store.heartbeat(); store.publish(pixels);
        check(store.snapshot(0).state.equals("stopped") && store.snapshot(0).frame == null, "Stopped capture reopened");
        System.out.println("PASS lossless bounded frame storage, live static screens, worker expiry, visibility and terminal cleanup");
    }
    private static void encoderTests() {
        int[][] sizes = {{108,240}, {240,108}, {800,480}, {640,360}, {72,164}, {288,162}};
        for (int[] size : sizes) {
            int width = size[0], height = size[1], stride = width * 4 + 16, base = 7;
            ByteBuffer rgba = ByteBuffer.allocate(base + stride * height); rgba.position(base);
            for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
                int p = base + y * stride + x * 4;
                int v = x < 3 || y < 3 || x >= width - 3 || y >= height - 3 ? 255 : 0;
                rgba.put(p, (byte) v); rgba.put(p + 1, (byte) v); rgba.put(p + 2, (byte) v); rgba.put(p + 3, (byte) 255);
            }
            byte[] atlas = FrameEncoder.encode(rgba, width, height, stride, 4);
            int[] fit = FrameEncoder.fit(width, height);
            int ox = (FrameStore.WIDTH - fit[0]) / 4 * 2, oy = (FrameStore.HEIGHT - fit[1]) / 4 * 2;
            check(atlas.length == FrameStore.BYTES, "Wrong atlas size");
            check(Math.abs((double) fit[0] / fit[1] - (double) width / height) < 0.02, "Aspect ratio changed");
            for (int y : new int[] {oy, oy + fit[1] - 1}) for (int x : new int[] {ox, ox + fit[0] - 1})
                check((atlas[y * FrameStore.WIDTH + x] & 255) == 255, "A phone corner was cropped");
            if (ox > 0 || oy > 0) check(atlas[0] == 0, "Letterbox is not black");
            check((atlas[FrameStore.WIDTH * FrameStore.HEIGHT] & 255) == 128, "Neutral chroma changed");
        }
        ByteBuffer quadrants = ByteBuffer.allocate(16);
        for (int i = 0; i < 4; i++) {
            for (int c = 0; c < 3; c++) quadrants.put(i * 4 + c, (byte) (i * 85));
            quadrants.put(i * 4 + 3, (byte) 255);
        }
        byte[] expanded = FrameEncoder.encode(quadrants, 2, 2, 8, 4);
        int ox = (FrameStore.WIDTH - FrameStore.HEIGHT) / 4 * 2;
        for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
            int at = (FrameStore.HEIGHT * (1 + 2 * y) / 4) * FrameStore.WIDTH + ox + FrameStore.HEIGHT * (1 + 2 * x) / 4;
            check((expanded[at] & 255) == (y * 2 + x) * 85, "Low-detail expansion distorted the phone quadrants");
        }
        System.out.println("PASS portrait/landscape corners, aspect fit, padded RGBA rows, low-detail quadrant expansion and full-range YUV atlas");
    }
    private static void policyTests() {
        final long[] now = {1000000000L};
        TransportPolicy policy = new TransportPolicy(new FrameStore.Clock() { public long nanoTime() { return now[0]; } });
        policy.radio(false, 2412); check(policy.capturePercent() == 100 && policy.targetFps() == 30, "Normal link degraded without evidence");
        policy.radio(true, 2412); check(policy.capturePercent() == 75, "2.4 GHz Bluetooth coexistence was not detected");
        check(policy.bytesPerSecond() == 2L * 1024 * 1024, "Bluetooth picture traffic is not bounded");
        check(policy.intervalNs(2 * 1024 * 1024) >= 1000000000L, "A large picture exceeded its link budget");
        policy.radio(true, 5200); check(policy.capturePercent() == 100, "5 GHz Auto unnecessarily used the 2.4 GHz baseline");
        policy.setMode(TransportPolicy.BLUETOOTH); check(policy.capturePercent() == 75, "Manual Bluetooth priority did not override Auto");
        for (int i = 0; i < 6; i++) { now[0] += 300000000L; policy.sent(350000, 1000000L); }
        check(policy.level() == 4 && policy.targetFps() < 30 && policy.targetFps() >= 10, "Congestion failed to reduce work within bounds");
        int lowFps = policy.targetFps();
        for (int i = 0; i < 100; i++) { now[0] += 100000000L; policy.sent(1000, 1000000L); }
        check(policy.targetFps() > lowFps, "Sustained recovery never restored frame rate");
        for (int i = 0; i < 5; i++) { now[0] += 2100000000L; policy.idle(); }
        check(policy.capturePercent() == 100, "Quiet screens never refined to full detail");
        policy.setMode(TransportPolicy.QUALITY); check(policy.capturePercent() == 100 && policy.bytesPerSecond() == 0, "Quality override lost detail");
        for (int i = 0; i < 4; i++) { now[0] += 300000000L; policy.sent(350000, 200000000L); }
        check(policy.capturePercent() == 100 && policy.targetFps() < 30, "Quality priority should preserve detail on a slow link");
        policy.setMode(TransportPolicy.AUTO); policy.radio(true, -1);
        check(policy.capturePercent() == 75, "Unavailable band should use the conservative Bluetooth baseline");
        for (int percent : new int[] {100,75,50,38,25}) {
            int[] fit = FrameEncoder.fit(1080, 2340, FrameStore.WIDTH * percent / 100, FrameStore.HEIGHT * percent / 100);
            check(fit[0] > 0 && fit[1] > 0 && fit[0] % 4 == 0 && fit[1] % 2 == 0, "Invalid adaptive capture size");
            check(fit[0] <= FrameStore.WIDTH * percent / 100 && fit[1] <= FrameStore.HEIGHT * percent / 100, "Adaptive size exceeded its bounds");
        }
        int[] wireBytes = new int[2];
        for (int index = 0; index < 2; index++) {
            int percent = index == 0 ? 100 : 25;
            int[] size = FrameEncoder.fit(1920, 1080, FrameStore.WIDTH * percent / 100, FrameStore.HEIGHT * percent / 100);
            byte[] noisy = new byte[size[0] * size[1] * 4]; new Random(73).nextBytes(noisy);
            FrameStore sample = new FrameStore(); sample.heartbeat();
            sample.publish(FrameEncoder.encode(ByteBuffer.wrap(noisy), size[0], size[1], size[0] * 4, 4));
            wireBytes[index] = sample.snapshot(0).frame.compressed.length;
        }
        check(wireBytes[1] < wireBytes[0] / 3, "Lower capture work did not reduce actual wire traffic");
        check(wireBytes[1] * 30L < 2L * 1024 * 1024, "Low-detail noisy video cannot fit the Bluetooth-priority budget at 30 fps");
        System.out.println("PASS noisy-frame traffic reduced from " + wireBytes[0] + " to " + wireBytes[1] + " bytes while retaining the fixed whole-phone canvas");
        System.out.println("PASS 2.4/5 GHz policy, manual overrides, picture traffic pacing, congestion/recovery and adaptive capture bounds");
    }
    public static void main(String[] args) throws Exception {
        FrameStore store = new FrameStore();
        if (args.length > 0 && args[0].equals("store-test")) {
            storeTests(); encoderTests(); policyTests(); return;
        }
        PairingServer server = new PairingServer(InetAddress.getByName("127.0.0.1"), 8476, store);
        final byte[] pixels = new byte[FrameStore.BYTES];
        for (int i = 0; i < pixels.length; i++) pixels[i] = (byte) (i * 31 + i / FrameStore.WIDTH);
        store.heartbeat(); store.publish(pixels); server.start();
        ScheduledExecutorService capture = Executors.newScheduledThreadPool(2);
        ScheduledFuture<?> heartbeat = capture.scheduleAtFixedRate(new Runnable() { public void run() { store.heartbeat(); } }, 0, 100, TimeUnit.MILLISECONDS);
        ScheduledFuture<?> animation = null;
        System.out.println(server.getPin()); System.out.flush();
        try {
            BufferedReader commands = new BufferedReader(new InputStreamReader(System.in));
            for (String command; (command = commands.readLine()) != null;) {
                if (command.equals("quit")) break;
                if (command.equals("hide")) store.visible(false);
                if (command.equals("show")) store.visible(true);
                if (command.equals("animate")) {
                    final int[] phase = {0};
                    animation = capture.scheduleAtFixedRate(new Runnable() { public void run() {
                        pixels[0] = (byte) ++phase[0]; store.publish(pixels);
                    } }, 0, 1000000000L / FrameStore.FPS, TimeUnit.NANOSECONDS);
                }
                if (command.equals("still") || command.equals("stall")) { if (animation != null) animation.cancel(false); }
                if (command.equals("stall")) heartbeat.cancel(false);
                if (command.equals("stop")) store.clear();
                System.out.println("OK " + command); System.out.flush();
            }
        } finally { capture.shutdownNow(); server.close(); }
    }
}

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
        int[][] sizes = {{108,240}, {240,108}, {800,480}, {640,360}};
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
        System.out.println("PASS portrait/landscape full-screen corners, aspect fit, padded RGBA rows and full-range YUV atlas");
    }
    public static void main(String[] args) throws Exception {
        FrameStore store = new FrameStore();
        if (args.length > 0 && args[0].equals("store-test")) {
            storeTests(); encoderTests(); return;
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

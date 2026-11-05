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
        try { store.publishJpeg(new byte[4]); } catch (IllegalArgumentException e) { rejected=true; }
        check(rejected,"Invalid JPEG accepted");
        byte[] pixels=java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("tests/fixtures/frame-768x432.jpg"));
        store.publishJpeg(pixels);
        FrameStore.Frame first=store.snapshot(0).frame;
        check(first!=null&&first.id==1&&store.snapshot(1).frame==null,"Frame sequence");
        check(Arrays.equals(pixels,first.compressed),"JPEG changed in transit");
        byte original=pixels[3];pixels[3]++;
        check(first.compressed[3]==original,"Published frame is mutable");pixels[3]=original;
        now[0] += 2000000000L; store.heartbeat(); now[0] += 1000000000L;
        check(store.snapshot(0).state.equals("active"), "Unchanged screen with live capture was rejected");
        check(store.snapshot(0).frame.createdNs == first.createdNs, "Heartbeat fabricated a fresh picture");
        now[0] += (FrameStore.LIVENESS_MS + 1) * 1000000L;
        check(store.snapshot(0).state.equals("stalled") && store.snapshot(0).frame == null, "Stalled worker exposed a screenshot");
        store.heartbeat(); store.visible(false);
        check(store.snapshot(0).state.equals("hidden") && store.snapshot(0).frame == null, "Hidden content exposed");
        store.visible(true); check(store.snapshot(0).state.equals("waiting"), "Resume replayed an old picture");
        store.publishJpeg(pixels); check(store.snapshot(0).frame.id == 2, "Sequence reset");
        store.clear(); store.heartbeat(); store.publishJpeg(pixels);
        check(store.snapshot(0).state.equals("stopped") && store.snapshot(0).frame == null, "Stopped capture reopened");
        System.out.println("PASS immutable bounded JPEG storage, live static screens, worker expiry, visibility and terminal cleanup");
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
        policy.setProfile("smooth");check(policy.targetFps()==60,"Smooth profile target");
        policy.radio(true,2412);check(policy.capturePercent()==100,"Bluetooth reduced spatial detail");
        check(policy.bytesPerSecond()==3L*1024*1024,"Bluetooth budget missing");
        check(policy.intervalNs(3*1024*1024)>=1000000000L,"Wire pacing missing");
        check(policy.intervalNs(1000)<1000000L,"Socket must not impose a second JPEG frame-rate clock");
        int quality=policy.jpegQuality();
        for(int i=0;i<12;i++){now[0]+=300000000L;policy.sent(350000,100000000L);}
        check(policy.capturePercent()==100&&policy.targetFps()==60&&policy.jpegQuality()<quality,"JPEG must reduce compressed traffic before fps");
        for(int i=0;i<20;i++){now[0]+=300000000L;policy.sent(350000,100000000L);}
        check(policy.targetFps()<60&&policy.targetFps()>=30&&policy.jpegQuality()>=75,"Sustained congestion must preserve a 30 fps requested floor");
        int low=policy.targetFps();
        for(int i=0;i<120;i++){now[0]+=40000000L;policy.sent(1000,1000000L);}
        check(policy.targetFps()>low,"Recovery never restored rate");
        for(int i=0;i<600;i++){now[0]+=40000000L;policy.sent(1000,1000000L);}
        check(policy.targetFps()==60&&policy.jpegQuality()==quality,"Recovery never restored JPEG detail");
        policy.setMode(TransportPolicy.QUALITY);check(policy.jpegQuality()==93&&policy.bytesPerSecond()==0,"Quality override");
        TransportPolicy avc=new TransportPolicy(new FrameStore.Clock(){public long nanoTime(){return now[0];}});avc.setProfile("smooth");
        avc.radio(false,2412);check(avc.avcBitrate()==2400000,"No-audio AVC budget");
        avc.radio(false,2412,true);check(avc.avcBitrate()==1200000,"Active audio without a reported Bluetooth device was ignored");
        avc.radio(true,2412,true);check(avc.avcBitrate()==1200000,"Shared-band audio budget");
        for(int i=0;i<9;i++){now[0]+=300000000L;avc.sentAvc(10000,150000000L,250000000L);}
        check(avc.avcBitrate()==TransportPolicy.AVC_MIN&&avc.targetFps()==60&&avc.capturePercent()==100,"AVC congestion must change bitrate, not impose a JPEG fps limiter");
        avc.avcBacklog();check(avc.avcBitrate()==TransportPolicy.AVC_MIN,"AVC bitrate floor");
        for(int i=0;i<120;i++){now[0]+=40000000L;avc.sentAvc(1000,1000000L,20000000L);}
        check(avc.avcBitrate()>TransportPolicy.AVC_MIN&&avc.avcBitrate()<=1200000,"AVC bounded recovery");
        for(int i=0;i<1200;i++){now[0]+=40000000L;avc.sentAvc(1000,1000000L,20000000L);}
        check(avc.avcBitrate()==1200000,"AVC exceeded the audio ceiling");
        avc.radio(true,5180,true);
        for(int i=0;i<1200;i++){now[0]+=40000000L;avc.sentAvc(1000,1000000L,20000000L);}
        check(avc.avcBitrate()==1800000,"5 GHz audio budget/recovery");
        avc.radio(false,5180,false);
        for(int i=0;i<1200;i++){now[0]+=40000000L;avc.sentAvc(1000,1000000L,20000000L);}
        check(avc.avcBitrate()==2400000,"Audio-disconnect recovery");
        avc.setMode(TransportPolicy.BLUETOOTH);check(avc.avcBitrate()==1200000,"Manual Audio priority must work on any band");
        avc.setMode(TransportPolicy.QUALITY);
        for(int i=0;i<1200;i++){now[0]+=40000000L;avc.sentAvc(1000,1000000L,20000000L);}
        check(avc.avcBitrate()==3000000,"Explicit Quality budget/recovery");
        TransportPolicy burst=new TransportPolicy(new FrameStore.Clock(){public long nanoTime(){return now[0];}});burst.setProfile("smooth");burst.radio(true,2412);
        for(int i=0;i<200;i++){now[0]+=100000000L;burst.sent(1000,150000000L);}
        check(burst.targetFps()==30,"JPEG requested target fell to the old 15 fps floor");
        for(int i=0;i<600;i++){now[0]+=40000000L;burst.sent(1000,i%10==0?150000000L:1000000L);}
        check(burst.targetFps()==60,"Isolated Bluetooth write bursts prevented rate recovery");
        FrameStore smooth=new FrameStore();smooth.configure("smooth");check(smooth.width()==576&&smooth.height()==324&&smooth.fps()==60,"Profile negotiation");
        System.out.println("PASS fixed canvas, JPEG quality before fps, audio/radio AVC budgets, bitrate floor/recovery and unchanged AVC fps target");
    }
    public static void main(String[] args) throws Exception {
        FrameStore store = new FrameStore();
        if (args.length > 0 && args[0].equals("store-test")) {
            storeTests(); encoderTests(); policyTests(); return;
        }
        if(args.length>0&&args[0].equals("smooth"))store.configure("smooth");
        final boolean avc=args.length>0&&args[0].equals("avc");
        TransportPolicy streamPolicy=new TransportPolicy();streamPolicy.setProfile(store.fps()==60?"smooth":"sharp");
        PairingServer server = new PairingServer(InetAddress.getByName("127.0.0.1"), 8476, store, streamPolicy);
        server.setResumeKey("0123456789abcdef0123456789abcdef");
        final byte[] pixels=ContentBounds.attach(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("tests/fixtures/frame-"+store.width()+"x"+store.height()+".jpg")),new int[]{0,0,store.width(),store.height(),store.width(),store.height()});
        // Synthetic NALs test transport/reference handling, not a real decoder.
        final byte[] idr={0,0,0,1,0x67,1,0,0,0,1,0x65,2},delta={0,0,0,1,0x41,3};
        if(avc){
            store.setFormat("h264-annexb");
            server.setVideoControl(new PairingServer.VideoControl(){
                public String configure(String mode){return mode.equals("h264")?null:"Synthetic AVC harness only";}
                public void keyframe(){store.publishAvc(idr);}
            });
        }
        store.heartbeat(); if(avc)store.publishAvc(idr);else store.publishJpeg(pixels); server.start();
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
                if (command.equals("delta")) store.publishAvc(delta);
                if (command.equals("idr")) store.publishAvc(idr);
                if (command.equals("avcburst")) for(int i=0;i<10;i++){store.publishAvc(delta);Thread.sleep(45);}
                if (command.equals("animate")) {
                    final int[] phase = {0};
                    animation = capture.scheduleAtFixedRate(new Runnable() { public void run() {
                        store.publishJpeg(pixels);
                    } }, 0, 1000000000L / store.fps(), TimeUnit.NANOSECONDS);
                }
                if (command.equals("still") || command.equals("stall")) { if (animation != null) animation.cancel(false); }
                if (command.equals("stall")) heartbeat.cancel(false);
                if (command.equals("stop")) store.clear();
                System.out.println("OK " + command); System.out.flush();
            }
        } finally { capture.shutdownNow(); server.close(); }
    }
}

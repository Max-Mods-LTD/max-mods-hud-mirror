// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;


/** One latest compressed picture. Capture liveness is separate from image age:
 * Android need not produce new buffers while the screen is unchanged. */
public final class FrameStore {
    // Native motion packing costs width*height/2 per frame. At 30 fps this
    // stays below cluster-render's default 5500 KiB/s shared upload cap.
    public static final int WIDTH = 768;
    public static final int HEIGHT = 432;
    public static final int FPS = 30;
    public static final int BYTES = WIDTH * HEIGHT * 3 / 2;
    public static final int MAX_WIRE_BYTES = 600000;
    private int width = WIDTH, height = HEIGHT, fps = FPS;
    private String format="jpeg";
    private final java.util.ArrayDeque<Frame> encoded=new java.util.ArrayDeque<Frame>();
    private int encodedBytes;
    public synchronized String format(){return format;}
    public synchronized void setFormat(String value){
        if(!"jpeg".equals(value)&&!"h264-annexb".equals(value))throw new IllegalArgumentException("Unknown codec");
        format=value;frame=null;encoded.clear();encodedBytes=0;version++;notifyAll();
    }
    public synchronized void publishAvc(byte[] bytes){
        if(bytes==null||bytes.length<4||bytes.length>MAX_WIRE_BYTES)throw new IllegalArgumentException("Invalid AVC frame");
        if(stopped||!visible||!format.equals("h264-annexb"))return;
        Frame next=new Frame(bytes.clone(),++counter,clock.nanoTime());encoded.addLast(next);encodedBytes+=bytes.length;
        while(encoded.size()>12||encodedBytes>2*1024*1024)encodedBytes-=encoded.removeFirst().compressed.length;
        frame=next;version++;notifyAll();
    }
    public synchronized void configure(String profile) {
        if (counter != 0) throw new IllegalStateException("Restart sharing to change quality");
        boolean smooth = "smooth".equals(profile);
        width = smooth ? 576 : WIDTH; height = smooth ? 324 : HEIGHT; fps = smooth ? 60 : 30;
    }
    public synchronized int width() { return width; }
    public synchronized int height() { return height; }
    public synchronized int fps() { return fps; }
    public void publishJpeg(byte[] jpeg) {
        if (jpeg == null || jpeg.length < 4 || jpeg.length > MAX_WIRE_BYTES ||
            (jpeg[0] & 255) != 255 || (jpeg[1] & 255) != 216) throw new IllegalArgumentException("Invalid JPEG frame");
        synchronized (this) {
            if (stopped || !visible || !format.equals("jpeg")) return;
            frame = new Frame(jpeg.clone(), ++counter, clock.nanoTime()); version++; notifyAll();
        }
    }
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
    // Called by the capture worker only after checking the projection/display.
    // HTTP requests never renew this deadline or the picture's capture time.
    public synchronized void heartbeat() { if (!stopped) { alive = true; aliveAt = clock.nanoTime(); } }
    public synchronized void visible(boolean value) {
        if (visible == value || stopped) return;
        visible = value; frame = null; encoded.clear();encodedBytes=0;version++; notifyAll();
    }
    public synchronized Snapshot snapshot(long after) {
        long age = clock.nanoTime() - aliveAt;
        String state = stopped ? "stopped" : !alive || age < 0 || age > LIVENESS_MS * 1000000L ? "stalled" : !visible ? "hidden" : frame == null ? "waiting" : "active";
        Frame next=state.equals("active")&&frame.id>after?frame:null;
        if(next!=null&&format.equals("h264-annexb")){for(Frame candidate:encoded)if(candidate.id>after){next=candidate;break;}}
        return new Snapshot(state,next,version);
    }
    public synchronized void awaitChange(long seen, long ms) throws InterruptedException {
        if (!stopped && seen == version && ms > 0) wait(ms);
    }
    public synchronized void clear() { stopped = true; frame = null; encoded.clear();encodedBytes=0;alive = false; version++; notifyAll(); }
}

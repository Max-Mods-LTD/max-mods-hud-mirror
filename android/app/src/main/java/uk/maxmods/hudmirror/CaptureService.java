// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.hardware.display.*;
import android.media.*;
import android.media.projection.*;
import android.os.*;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import java.net.*;
import java.nio.ByteBuffer;

public final class CaptureService extends Service {
    public static volatile boolean active;
    public static volatile String status = "Ready";
    public static volatile String pairingText = "";
    public static volatile String linkStatus = "";
    private final Handler main = new Handler(Looper.getMainLooper());
    private final FrameStore frames = new FrameStore();
    private final TransportPolicy transport = new TransportPolicy();
    private HandlerThread worker;
    private volatile MediaProjection projection;
    private volatile VirtualDisplay display;
    private volatile ImageReader reader;
    private Handler captureHandler;
    private DisplayManager.DisplayListener rotationListener;
    private PairingServer server;
    private String bindAddress;
    private long lastFrameNs;
    private long startedMs;
    private volatile boolean cleaning;
    private volatile boolean captureVisible = true;
    private boolean captureScheduled;
    private int density;
    private int sourceWidth, sourceHeight, appliedPercent;
    private final Runnable captureTask = new Runnable() { public void run() {
        captureScheduled = false;
        ImageReader source = reader;
        if (source != null && active && !cleaning) capture(source);
    }};
    private final Runnable captureHeartbeat = new Runnable() { public void run() {
        if (!active || cleaning) return;
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        KeyguardManager lock = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        if (!power.isInteractive() || lock.isDeviceLocked()) {
            main.post(new Runnable() { public void run() { finish("Sharing stopped: phone locked"); } }); return;
        }
        VirtualDisplay vd = display;
        if (projection == null || vd == null || vd.getDisplay() == null || !vd.getDisplay().isValid()) {
            main.post(new Runnable() { public void run() { finish("Sharing stopped: capture display ended"); } }); return;
        }
        frames.heartbeat();
        if (lastFrameNs != 0 && System.nanoTime() - lastFrameNs > 2000000000L) transport.idle();
        if (appliedPercent != transport.capturePercent()) resizeCapture(sourceWidth, sourceHeight);
        captureHandler.postDelayed(this, 250);
    }};
    private final Runnable monitor = new Runnable() { public void run() {
        if (!active) return;
        RadioStatus radio = RadioStatus.read(CaptureService.this);
        transport.setMode(getSharedPreferences("hud_mirror", MODE_PRIVATE).getString("videoMode", TransportPolicy.AUTO));
        transport.radio(radio.bluetooth, radio.frequency);
        linkStatus = radio.description() + "\n" + transport.description();
        Inet4Address now = MainActivity.wifiAddress(CaptureService.this);
        if (now == null || !now.getHostAddress().equals(bindAddress)) { finish("Sharing stopped: Wi-Fi connection changed"); return; }
        if (SystemClock.elapsedRealtime() - startedMs >= 10 * 60 * 1000L) { finish("Session ended. Start sharing again."); return; }
        if (server != null) status = !captureVisible ? "Shared app hidden. Return to it to resume." : server.isPaired() ? "Video sharing active. Sound uses BMW Bluetooth media." : "Sharing ready. Pair in the car.";
        main.postDelayed(this, 1000);
    }};
    public IBinder onBind(Intent intent) { return null; }
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) { finish("Sharing stopped"); return START_NOT_STICKY; }
        if (active) return START_NOT_STICKY;
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel("sharing", "HUD screen sharing", NotificationManager.IMPORTANCE_LOW));
        Intent stop = new Intent(this, CaptureService.class).setAction("STOP");
        PendingIntent stopIntent = PendingIntent.getService(this, 0, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent open = PendingIntent.getActivity(this, 1, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, "sharing").setSmallIcon(android.R.drawable.ic_menu_view)
                .setContentTitle("Max Mods HUD Mirror").setContentText("Your screen is being shared over BMW Wi-Fi")
                .setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null, "Stop sharing", stopIntent).build()).build();
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(100, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
            else startForeground(100, notification);
            bindAddress = intent.getStringExtra("address");
            RadioStatus radio = RadioStatus.read(this);
            transport.setMode(getSharedPreferences("hud_mirror", MODE_PRIVATE).getString("videoMode", TransportPolicy.AUTO));
            transport.radio(radio.bluetooth, radio.frequency);
            Inet4Address wifi = MainActivity.wifiAddress(this);
            if (wifi == null || !wifi.getHostAddress().equals(bindAddress)) throw new IllegalStateException("Connect to BMW Wi-Fi and try again");
            Intent consent = intent.getParcelableExtra("projection");
            if (consent == null) throw new IllegalStateException("Screen-sharing permission is missing");
            MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
            projection = manager.getMediaProjection(intent.getIntExtra("result", Activity.RESULT_CANCELED), consent);
            if (projection == null) throw new IllegalStateException("Screen-sharing permission was refused");
            worker = new HandlerThread("hud-mirror-capture"); worker.start();
            captureHandler = new Handler(worker.getLooper());
            density = getResources().getConfiguration().densityDpi;
            projection.registerCallback(new MediaProjection.Callback() {
                public void onStop() { if (!cleaning) finish("Sharing stopped by Android"); }
                public void onCapturedContentVisibilityChanged(boolean visible) {
                    captureVisible = visible; frames.visible(visible);
                }
                public void onCapturedContentResize(final int width, final int height) {
                    if (!cleaning && captureHandler != null) captureHandler.post(new Runnable() { public void run() { resizeCapture(width, height); } });
                }
            }, main);
            int[] region = phoneRegionSize(); sourceWidth = region[0]; sourceHeight = region[1];
            int[] size = captureSize(sourceWidth, sourceHeight);
            reader = newReader(size[0], size[1]);
            active = true;
            getSharedPreferences("hud_mirror", MODE_PRIVATE).edit().putBoolean("sharingWasActive", true).apply();
            display = projection.createVirtualDisplay("MaxModsHudMirror", size[0], size[1], density,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, captureHandler);
            if (Build.VERSION.SDK_INT < 34) {
                rotationListener = new DisplayManager.DisplayListener() {
                    public void onDisplayAdded(int id) { }
                    public void onDisplayRemoved(int id) { }
                    public void onDisplayChanged(int id) {
                        if (id == android.view.Display.DEFAULT_DISPLAY) {
                            int[] next = phoneRegionSize(); resizeCapture(next[0], next[1]);
                        }
                    }
                };
                ((DisplayManager) getSystemService(DISPLAY_SERVICE)).registerDisplayListener(rotationListener, captureHandler);
            }
            frames.heartbeat(); captureHandler.post(captureHeartbeat);
            server = new PairingServer(wifi, PairingServer.PORT, frames, transport); server.start();
            pairingText = bindAddress + "/" + server.getPin();
            status = "Sharing ready. Pair in the car."; startedMs = SystemClock.elapsedRealtime();
            main.post(monitor);
        } catch (Exception e) { finish("Could not start sharing: " + e.getMessage()); }
        return START_NOT_STICKY;
    }
    private int[] phoneRegionSize() {
        DisplayMetrics metrics = new DisplayMetrics();
        ((WindowManager) getSystemService(WINDOW_SERVICE)).getDefaultDisplay().getRealMetrics(metrics);
        return new int[] {metrics.widthPixels, metrics.heightPixels};
    }
    private int[] captureSize(int width, int height) {
        appliedPercent = transport.capturePercent();
        return FrameEncoder.fit(width, height, FrameStore.WIDTH * appliedPercent / 100, FrameStore.HEIGHT * appliedPercent / 100);
    }
    private ImageReader newReader(int width, int height) {
        ImageReader next = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 3);
        next.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() { public void onImageAvailable(ImageReader source) {
            if (source != reader || captureScheduled || !active || cleaning) return;
            captureScheduled = true;
            long remaining = 1000000000L / transport.targetFps() - (System.nanoTime() - lastFrameNs);
            // Consume the latest queued image at the deadline. Dropping an early
            // image here can lose the final change on an otherwise still screen.
            captureHandler.postDelayed(captureTask, Math.max(0, (remaining + 999999L) / 1000000L));
        }}, captureHandler);
        return next;
    }
    private void resizeCapture(int width, int height) {
        if (!active || cleaning || display == null || reader == null) return;
        sourceWidth = width; sourceHeight = height;
        int[] size = captureSize(width, height);
        if (reader.getWidth() == size[0] && reader.getHeight() == size[1]) return;
        try {
            captureHandler.removeCallbacks(captureTask); captureScheduled = false;
            ImageReader old = reader;
            ImageReader next = newReader(size[0], size[1]);
            display.resize(size[0], size[1], density);
            reader = next; display.setSurface(next.getSurface()); old.close();
        } catch (final Exception e) { main.post(new Runnable() { public void run() { finish("Capture resize failed: " + e.getMessage()); } }); }
    }
    private void capture(ImageReader source) {
        Image image = null;
        try {
            image = source.acquireLatestImage();
            if (image == null || !active || !captureVisible || cleaning) return;
            long now = System.nanoTime();
            Image.Plane plane = image.getPlanes()[0];
            ByteBuffer buffer = plane.getBuffer();
            int pixel = plane.getPixelStride(), row = plane.getRowStride();
            byte[] atlas = FrameEncoder.encode(buffer, image.getWidth(), image.getHeight(), row, pixel);
            synchronized (this) {
                if (active && !cleaning) { frames.publish(atlas); lastFrameNs = now; }
            }
        } catch (final Exception e) { main.post(new Runnable() { public void run() { finish("Capture stopped: " + e.getMessage()); } }); }
        finally { if (image != null) image.close(); }
    }
    private void finish(String message) { status = message; cleanup(); stopSelf(); }
    private synchronized void cleanup() {
        if (cleaning) return;
        cleaning = true; active = false; pairingText = ""; main.removeCallbacks(monitor);
        getSharedPreferences("hud_mirror", MODE_PRIVATE).edit().putBoolean("sharingWasActive", false).apply();
        if (captureHandler != null) captureHandler.removeCallbacksAndMessages(null);
        if (rotationListener != null) { ((DisplayManager) getSystemService(DISPLAY_SERVICE)).unregisterDisplayListener(rotationListener); rotationListener = null; }
        if (server != null) { server.close(); server = null; }
        frames.clear();
        if (display != null) { display.release(); display = null; }
        if (reader != null) { reader.close(); reader = null; }
        if (projection != null) { MediaProjection p = projection; projection = null; p.stop(); }
        if (worker != null) { worker.quitSafely(); worker = null; }
        stopForeground(STOP_FOREGROUND_REMOVE);
    }
    public void onDestroy() { if (active) status = "Sharing stopped"; cleanup(); super.onDestroy(); }
}

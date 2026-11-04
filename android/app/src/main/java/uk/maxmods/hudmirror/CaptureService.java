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
import java.net.*;
import java.nio.ByteBuffer;

public final class CaptureService extends Service {
    public static volatile boolean active;
    public static volatile String status = "Ready";
    public static volatile String pairingText = "";
    private final Handler main = new Handler(Looper.getMainLooper());
    private final FrameStore frames = new FrameStore();
    private HandlerThread worker;
    private MediaProjection projection;
    private VirtualDisplay display;
    private ImageReader reader;
    private PairingServer server;
    private String bindAddress;
    private long lastFrameNs;
    private long startedMs;
    private boolean cleaning;
    private final Runnable monitor = new Runnable() { public void run() {
        if (!active) return;
        Inet4Address now = MainActivity.wifiAddress(CaptureService.this);
        if (now == null || !now.getHostAddress().equals(bindAddress)) { finish("Sharing stopped: Wi-Fi connection changed"); return; }
        if (SystemClock.elapsedRealtime() - startedMs >= 10 * 60 * 1000L) { finish("Session ended. Start sharing again."); return; }
        if (server != null) status = server.isPaired() ? "Sharing to the paired car" : "Sharing ready. Pair in the car.";
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
            Inet4Address wifi = MainActivity.wifiAddress(this);
            if (wifi == null || !wifi.getHostAddress().equals(bindAddress)) throw new IllegalStateException("Connect to BMW Wi-Fi and try again");
            Intent consent = intent.getParcelableExtra("projection");
            if (consent == null) throw new IllegalStateException("Screen-sharing permission is missing");
            MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
            projection = manager.getMediaProjection(intent.getIntExtra("result", Activity.RESULT_CANCELED), consent);
            if (projection == null) throw new IllegalStateException("Screen-sharing permission was refused");
            projection.registerCallback(new MediaProjection.Callback() { public void onStop() {
                if (!cleaning) finish("Sharing stopped by Android");
            }}, main);
            worker = new HandlerThread("hud-mirror-capture"); worker.start();
            Handler handler = new Handler(worker.getLooper());
            reader = ImageReader.newInstance(FrameStore.WIDTH, FrameStore.HEIGHT, PixelFormat.RGBA_8888, 2);
            reader.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() { public void onImageAvailable(ImageReader source) { capture(source); } }, handler);
            server = new PairingServer(wifi, PairingServer.PORT, frames); server.start();
            int density = getResources().getConfiguration().densityDpi;
            display = projection.createVirtualDisplay("MaxModsHudMirror", FrameStore.WIDTH, FrameStore.HEIGHT, density,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, handler);
            pairingText = bindAddress + "/" + server.getPin();
            active = true; status = "Sharing ready. Pair in the car."; startedMs = SystemClock.elapsedRealtime();
            main.post(monitor);
        } catch (Exception e) { finish("Could not start sharing: " + e.getMessage()); }
        return START_NOT_STICKY;
    }
    private void capture(ImageReader source) {
        Image image = null;
        try {
            image = source.acquireLatestImage();
            if (image == null || !active) return;
            long now = System.nanoTime();
            if (now - lastFrameNs < 250000000L) return;
            Image.Plane plane = image.getPlanes()[0];
            ByteBuffer buffer = plane.getBuffer();
            int pixel = plane.getPixelStride(), row = plane.getRowStride();
            if (pixel < 4 || image.getWidth() != FrameStore.WIDTH || image.getHeight() != FrameStore.HEIGHT) throw new IllegalStateException("Unsupported screen-capture format");
            byte[] rgba = new byte[FrameStore.BYTES];
            for (int y = 0; y < FrameStore.HEIGHT; y++) {
                int dest = y * FrameStore.WIDTH * 4;
                if (pixel == 4) { buffer.position(y * row); buffer.get(rgba, dest, FrameStore.WIDTH * 4); }
                else for (int x = 0; x < FrameStore.WIDTH; x++) {
                    int src = y * row + x * pixel, dst = dest + x * 4;
                    rgba[dst] = buffer.get(src); rgba[dst + 1] = buffer.get(src + 1); rgba[dst + 2] = buffer.get(src + 2);
                }
            }
            for (int i = 3; i < rgba.length; i += 4) rgba[i] = (byte) 255;
            synchronized (this) {
                if (active && !cleaning) { frames.publish(rgba); lastFrameNs = now; }
            }
        } catch (final Exception e) { main.post(new Runnable() { public void run() { finish("Capture stopped: " + e.getMessage()); } }); }
        finally { if (image != null) image.close(); }
    }
    private void finish(String message) { status = message; cleanup(); stopSelf(); }
    private synchronized void cleanup() {
        if (cleaning) return;
        cleaning = true; active = false; pairingText = ""; main.removeCallbacks(monitor);
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

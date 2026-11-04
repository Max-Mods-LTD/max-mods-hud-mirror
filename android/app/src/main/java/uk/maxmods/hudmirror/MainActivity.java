// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;

import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.projection.MediaProjectionManager;
import android.net.*;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.net.*;

public final class MainActivity extends Activity {
    private static final int CAPTURE = 70;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView state;
    private TextView pair;
    private Button start;
    private Button mode;
    private TextView link;
    private String selectedAddress;
    private final Runnable update = new Runnable() { public void run() { render(); handler.postDelayed(this, 500); } };

    public static Inet4Address wifiAddress(Context context) {
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(CONNECTIVITY_SERVICE);
        for (Network network : cm.getAllNetworks()) {
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            if (caps == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue;
            LinkProperties links = cm.getLinkProperties(network);
            if (links == null) continue;
            for (LinkAddress link : links.getLinkAddresses()) {
                InetAddress ip = link.getAddress();
                if (ip instanceof Inet4Address && ip.isSiteLocalAddress()) return (Inet4Address) ip;
            }
        }
        return null;
    }
    private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density + 0.5f); }
    private TextView text(String value, int size, int color) {
        TextView v = new TextView(this); v.setText(value); v.setTextSize(size); v.setTextColor(color);
        v.setPadding(0, dp(10), 0, dp(10)); return v;
    }
    public void onCreate(Bundle saved) {
        super.onCreate(saved);
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(Color.rgb(12, 19, 24));
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(dp(26), dp(36), dp(26), dp(24));
        scroll.addView(layout);
        layout.addView(text("MAX MODS", 16, Color.rgb(102, 220, 167)));
        layout.addView(text("HUD Mirror", 34, Color.WHITE));
        layout.addView(text("Android prototype 0.3.0 · up to 30 fps", 14, Color.LTGRAY));
        layout.addView(text("1. Park the car and select P.\n2. Connect this phone to the BMW Wi-Fi hotspot.\n3. Start sharing, then enter the address/code in the car's HUD Mirror app.", 17, Color.WHITE));
        state = text("Ready", 17, Color.rgb(102, 220, 167)); layout.addView(state);
        link = text("", 14, Color.LTGRAY); layout.addView(link);
        pair = text("", 20, Color.WHITE); pair.setTextIsSelectable(true); layout.addView(pair);
        start = new Button(this); start.setText("Start sharing"); start.setAllCaps(false);
        layout.addView(start, new LinearLayout.LayoutParams(-1, dp(58)));
        start.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { begin(); } });
        Button stop = new Button(this); stop.setText("Stop sharing"); stop.setAllCaps(false);
        layout.addView(stop, new LinearLayout.LayoutParams(-1, dp(58)));
        stop.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            stopService(new Intent(MainActivity.this, CaptureService.class)); render();
        }});
        mode = new Button(this); mode.setAllCaps(false); layout.addView(mode, new LinearLayout.LayoutParams(-1, dp(58)));
        mode.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            String current = getSharedPreferences("hud_mirror", MODE_PRIVATE).getString("videoMode", TransportPolicy.AUTO);
            String next = current.equals(TransportPolicy.AUTO) ? TransportPolicy.BLUETOOTH : current.equals(TransportPolicy.BLUETOOTH) ? TransportPolicy.QUALITY : TransportPolicy.AUTO;
            getSharedPreferences("hud_mirror", MODE_PRIVATE).edit().putString("videoMode", next).apply(); render();
        }});
        layout.addView(text("Sound: connect BMW Bluetooth media before starting, select it in the car, then return to HUD Mirror. Video uses Wi-Fi.\n\nAuto adapts video when Bluetooth shares a slower link. Bluetooth priority reserves more bandwidth for sound; picture detail or fps can reduce. Quality priority keeps full capture detail. A 5 GHz Wi-Fi option, if available in your BMW, can help avoid sharing 2.4 GHz.\n\nThe whole phone screen fits. Landscape gives a wider picture. Change Compact / Full screen in the car. Keep the car app open.\n\nAndroid asks permission each session. Locking the phone ends sharing. Sessions end after 10 minutes.", 14, Color.LTGRAY));
        setContentView(scroll);
        if (!CaptureService.active && getSharedPreferences("hud_mirror", MODE_PRIVATE).getBoolean("sharingWasActive", false)) {
            CaptureService.status = "The previous sharing session ended unexpectedly. Start sharing again.";
            getSharedPreferences("hud_mirror", MODE_PRIVATE).edit().putBoolean("sharingWasActive", false).apply();
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 71);
    }
    private void begin() {
        Inet4Address address = wifiAddress(this);
        if (address == null) { Toast.makeText(this, "Connect to the BMW Wi-Fi hotspot first", Toast.LENGTH_LONG).show(); return; }
        if (CaptureService.active) return;
        selectedAddress = address.getHostAddress();
        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        startActivityForResult(manager.createScreenCaptureIntent(), CAPTURE);
    }
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != CAPTURE || result != RESULT_OK || data == null) return;
        Intent service = new Intent(this, CaptureService.class);
        service.putExtra("result", result); service.putExtra("projection", data); service.putExtra("address", selectedAddress);
        startForegroundService(service);
        Toast.makeText(this, "Sharing is starting. Return here for the pairing address/code.", Toast.LENGTH_LONG).show();
    }
    private void render() {
        if (state == null) return;
        updateText(state, CaptureService.status);
        updateText(pair, CaptureService.pairingText);
        start.setEnabled(!CaptureService.active);
        updateText(link, CaptureService.active ? CaptureService.linkStatus : RadioStatus.read(this).description());
        String selected = getSharedPreferences("hud_mirror", MODE_PRIVATE).getString("videoMode", TransportPolicy.AUTO);
        updateText(mode, "Video mode: " + (selected.equals(TransportPolicy.BLUETOOTH) ? "Bluetooth priority" : selected.equals(TransportPolicy.QUALITY) ? "Quality priority" : "Auto"));
    }
    private void updateText(TextView view, String value) {
        if (!value.equals(view.getText().toString())) view.setText(value);
    }
    protected void onResume() { super.onResume(); handler.post(update); }
    protected void onPause() { handler.removeCallbacks(update); super.onPause(); }
}

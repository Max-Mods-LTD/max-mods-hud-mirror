// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;

/** Read-only connection hints. An available audio output does not prove
 * that BMW is currently playing it. No audio routing/focus is changed. */
public final class RadioStatus {
    public final boolean bluetooth;
    public final int frequency;
    private RadioStatus(boolean bt, int mhz) { bluetooth = bt; frequency = mhz; }
    public static RadioStatus read(Context context) {
        boolean bt = false; int mhz = -1;
        try {
            AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            for (AudioDeviceInfo device : audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
                int type = device.getType();
                if (type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                        type == AudioDeviceInfo.TYPE_BLE_HEADSET || type == AudioDeviceInfo.TYPE_BLE_SPEAKER) bt = true;
            }
        } catch (RuntimeException ignored) { /* Manual Bluetooth priority remains available. */ }
        try {
            WifiManager manager = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            WifiInfo info = manager.getConnectionInfo();
            if (info != null) mhz = info.getFrequency();
        } catch (RuntimeException ignored) { /* No scan/location permission is requested. */ }
        return new RadioStatus(bt, mhz);
    }
    public String description() {
        String band = frequency >= 5925 ? "6 GHz" : frequency >= 4900 ? "5 GHz" : frequency >= 2400 && frequency < 2500 ? "2.4 GHz" : "band unavailable";
        return "Wi-Fi: " + band + " · Bluetooth output " + (bluetooth ? "connected" : "not detected");
    }
}

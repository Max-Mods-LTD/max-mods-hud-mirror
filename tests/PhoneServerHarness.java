// SPDX-License-Identifier: GPL-3.0-or-later
import uk.maxmods.hudmirror.*;
import java.net.*;
import java.io.*;

public class PhoneServerHarness {
    public static void main(String[] args) throws Exception {
        FrameStore store = new FrameStore();
        if (args.length > 0 && args[0].equals("store-test")) {
            if (store.latest(0) != null) throw new AssertionError("Empty store");
            boolean rejected = false;
            try { store.publish(new byte[4]); } catch (IllegalArgumentException e) { rejected = true; }
            if (!rejected) throw new AssertionError("Invalid dimensions accepted");
            store.publish(new byte[FrameStore.BYTES]);
            if (store.latest(0) == null || store.latest(1) != null) throw new AssertionError("Frame sequence");
            Thread.sleep(1550);
            if (store.latest(0) != null) throw new AssertionError("Stale screenshot exposed");
            store.clear(); if (store.latest(0) != null) throw new AssertionError("Clear failed");
            System.out.println("PASS Android frame storage, invalid size, sequence, expiry and clearing"); return;
        }
        PairingServer server = new PairingServer(InetAddress.getByName("127.0.0.1"), 8476, store);
        byte[] pixels = new byte[FrameStore.BYTES];
        pixels[0] = 12; pixels[1] = 34; pixels[2] = 56; pixels[3] = (byte) 255;
        store.publish(pixels); server.start();
        System.out.println(server.getPin()); System.out.flush();
        try { new BufferedReader(new InputStreamReader(System.in)).readLine(); }
        finally { server.close(); }
    }
}

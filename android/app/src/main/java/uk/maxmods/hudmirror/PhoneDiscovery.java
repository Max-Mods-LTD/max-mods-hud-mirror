// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Respond to short, local discovery probes during a sharing session. Neither
 * the pairing code nor the remembered-car key is sent in a discovery reply. */
public final class PhoneDiscovery implements Closeable {
    private final DatagramSocket socket;
    private final byte[] network;
    private final int prefix;
    private final String pin, resume;
    private volatile boolean closed;
    private final long started = System.nanoTime();

    public PhoneDiscovery(InetAddress wifi, int port, String pin, String resume) throws IOException {
        if (!(wifi instanceof Inet4Address)) throw new IOException("IPv4 Wi-Fi required");
        network = wifi.getAddress();
        int bits = -1;
        NetworkInterface nic = NetworkInterface.getByInetAddress(wifi);
        if (nic != null) for (InterfaceAddress address : nic.getInterfaceAddresses())
            if (wifi.equals(address.getAddress())) bits = address.getNetworkPrefixLength();
        if (bits < 1 || bits > 32) throw new IOException("Wi-Fi subnet unavailable");
        prefix = bits; this.pin = pin; this.resume = resume;
        socket = new DatagramSocket(null);
        try { socket.bind(new InetSocketAddress(port)); socket.setSoTimeout(1000); }
        catch (IOException e) { socket.close(); throw e; }
    }
    private boolean local(InetAddress peer) {
        if (!(peer instanceof Inet4Address) || !(peer.isSiteLocalAddress() || peer.isLoopbackAddress())) return false;
        byte[] bytes = peer.getAddress();
        for (int bit = 0; bit < prefix; bit++)
            if (((bytes[bit / 8] ^ network[bit / 8]) & (128 >>> (bit % 8))) != 0) return false;
        return true;
    }
    private static String proof(String key, String nonce) throws Exception {
        if (key == null) return "-";
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.US_ASCII), "HmacSHA256"));
        byte[] bytes = mac.doFinal(("MMHUD1:" + nonce).getBytes(StandardCharsets.US_ASCII));
        StringBuilder hex = new StringBuilder();
        for (byte b : bytes) hex.append(String.format(java.util.Locale.US, "%02x", b & 255));
        return hex.toString();
    }
    public void start() {
        Thread listener = new Thread(new Runnable() { public void run() {
            byte[] buffer = new byte[96]; long window = 0; int replies = 0;
            while (!closed && System.nanoTime() - started < 10L * 60L * 1000000000L) try {
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length); socket.receive(packet);
                if (!local(packet.getAddress())) continue;
                String query = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.US_ASCII);
                if (!query.matches("MMHUD1 [a-f0-9]{32}")) continue;
                long now = System.nanoTime();
                if (now - window >= 1000000000L) { window = now; replies = 0; }
                if (++replies > 10) continue;
                String nonce = query.substring(7);
                byte[] reply = ("MMHUD1 " + nonce + " " + proof(pin, nonce) + " " + proof(resume, nonce)).getBytes(StandardCharsets.US_ASCII);
                socket.send(new DatagramPacket(reply, reply.length, packet.getAddress(), packet.getPort()));
            } catch (SocketTimeoutException ignored) { }
              catch (Exception e) { if (!closed) close(); }
            close();
        } }, "hud-mirror-discovery");
        listener.setDaemon(true); listener.start();
    }
    public void close() { closed = true; socket.close(); }
}

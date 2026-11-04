// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.*;

/** Local Wi-Fi only. The car pulls frames, so no head-unit firewall edits
 * are needed. The short code is exchanged for an in-memory session token. */
public final class PairingServer implements Closeable {
    public static final int PORT = 8476;
    private final FrameStore frames;
    private final String pin;
    private final String token;
    private final long started = System.nanoTime();
    private final ServerSocket server;
    private final ThreadPoolExecutor workers;
    private final Set<Socket> sockets = Collections.synchronizedSet(new HashSet<Socket>());
    private final Map<String, Integer> attempts = new HashMap<String, Integer>();
    private volatile boolean closed;
    private String pairedPeer;
    private Thread listener;

    public PairingServer(InetAddress bind, int port, FrameStore store) throws IOException {
        if (!(bind.isSiteLocalAddress() || bind.isLoopbackAddress())) throw new IOException("Private Wi-Fi address required");
        frames = store;
        SecureRandom random = new SecureRandom();
        pin = String.format(Locale.US, "%08d", random.nextInt(100000000));
        byte[] bytes = new byte[16]; random.nextBytes(bytes);
        StringBuilder hex = new StringBuilder();
        for (byte b : bytes) hex.append(String.format(Locale.US, "%02x", b & 255));
        token = hex.toString();
        server = new ServerSocket();
        server.setReuseAddress(true);
        server.bind(new InetSocketAddress(bind, port), 4);
        workers = new ThreadPoolExecutor(2, 2, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<Runnable>(2));
    }
    public String getPin() { return pin; }
    public int getPort() { return server.getLocalPort(); }
    public synchronized boolean isPaired() { return pairedPeer != null; }
    public void start() {
        listener = new Thread(new Runnable() { public void run() {
            while (!closed) try {
                final Socket s = server.accept();
                if (!s.getInetAddress().isSiteLocalAddress() && !s.getInetAddress().isLoopbackAddress()) { s.close(); continue; }
                s.setSoTimeout(1500); sockets.add(s);
                try { workers.execute(new Runnable() { public void run() { serve(s); } }); }
                catch (RejectedExecutionException e) { sockets.remove(s); s.close(); }
            } catch (IOException e) { if (!closed) close(); }
        }}, "hud-mirror-listener");
        listener.setDaemon(true); listener.start();
    }
    private String line(InputStream in, int max) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        while (b.size() <= max) {
            int ch = in.read();
            if (ch < 0) throw new EOFException();
            if (ch == '\n') return new String(b.toByteArray(), StandardCharsets.US_ASCII).replace("\r", "");
            b.write(ch);
        }
        throw new IOException("Request header too long");
    }
    private static boolean equal(String a, String b) {
        return a != null && b != null && MessageDigest.isEqual(a.getBytes(StandardCharsets.US_ASCII), b.getBytes(StandardCharsets.US_ASCII));
    }
    private void serve(Socket socket) {
        try {
            InputStream in = new BufferedInputStream(socket.getInputStream());
            String[] start = line(in, 1024).split(" ");
            if (start.length != 3 || !start[2].equals("HTTP/1.1")) { reply(socket, 400, "", null, null); return; }
            Map<String, String> h = new HashMap<String, String>();
            int total = 0;
            while (true) {
                String l = line(in, 1024); total += l.length();
                if (total > 4096) throw new IOException("Headers too large");
                if (l.isEmpty()) break;
                int i = l.indexOf(':'); if (i <= 0) throw new IOException("Invalid header");
                String key = l.substring(0, i).toLowerCase(Locale.US);
                if (h.containsKey(key)) throw new IOException("Duplicate header");
                h.put(key, l.substring(i + 1).trim());
            }
            if (closed || System.nanoTime() - started > 10L * 60L * 1000000000L) { reply(socket, 410, "", null, null); return; }
            String peer = socket.getInetAddress().getHostAddress();
            if (start[0].equals("POST") && start[1].equals("/v1/pair")) {
                if (h.containsKey("transfer-encoding") || !"8".equals(h.get("content-length"))) { reply(socket, 400, "", null, null); return; }
                byte[] b = new byte[8];
                for (int n = 0; n < 8;) { int r = in.read(b, n, 8 - n); if (r < 0) throw new EOFException(); n += r; }
                synchronized (this) {
                    int count = attempts.containsKey(peer) ? attempts.get(peer) : 0;
                    // A single small attempt budget for the entire session, not a resettable timer.
                    int all = 0; for (Integer value : attempts.values()) all += value;
                    if (count >= 5 || all >= 10 || (pairedPeer != null && !pairedPeer.equals(peer))) { reply(socket, 429, "", null, null); return; }
                    attempts.put(peer, count + 1);
                    if (!equal(pin, new String(b, StandardCharsets.US_ASCII))) { reply(socket, 403, "", null, null); return; }
                    pairedPeer = peer;
                }
                byte[] json = ("{\"token\":\"" + token + "\",\"width\":400,\"height\":240}").getBytes(StandardCharsets.US_ASCII);
                reply(socket, 200, "application/json", json, null); return;
            }
            synchronized (this) {
                if (!peer.equals(pairedPeer) || !equal("Bearer " + token, h.get("authorization"))) { reply(socket, 403, "", null, null); return; }
            }
            if (!start[0].equals("GET") || !start[1].matches("/v1/frame\\?after=[0-9]{1,15}")) { reply(socket, 404, "", null, null); return; }
            long after = Long.parseLong(start[1].substring(start[1].indexOf('=') + 1));
            FrameStore.Frame f = frames.latest(after);
            if (f == null) { reply(socket, 204, "", null, null); return; }
            reply(socket, 200, "application/x-maxmods-rgba", f.pixels, f);
        } catch (IOException | RuntimeException ignored) {
            // No screenshot, code, token or request is logged.
        } finally {
            sockets.remove(socket); try { socket.close(); } catch (IOException ignored) { }
        }
    }
    private void reply(Socket s, int status, String type, byte[] body, FrameStore.Frame frame) throws IOException {
        int length = body == null ? 0 : body.length;
        String head = "HTTP/1.1 " + status + " Reply\r\nContent-Length: " + length + "\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n";
        if (!type.isEmpty()) head += "Content-Type: " + type + "\r\n";
        if (frame != null) head += "X-Mirror-Width: 400\r\nX-Mirror-Height: 240\r\nX-Mirror-Frame-Id: " + frame.id + "\r\n";
        OutputStream out = s.getOutputStream();
        out.write((head + "\r\n").getBytes(StandardCharsets.US_ASCII));
        if (body != null) out.write(body);
        out.flush();
    }
    public void close() {
        if (closed) return;
        closed = true; frames.clear();
        try { server.close(); } catch (IOException ignored) { }
        synchronized (sockets) { for (Socket s : sockets) try { s.close(); } catch (IOException ignored) { } sockets.clear(); }
        workers.shutdownNow();
    }
}

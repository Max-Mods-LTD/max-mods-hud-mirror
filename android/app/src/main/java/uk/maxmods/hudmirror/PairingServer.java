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
    private final TransportPolicy transport;
    private final String pin;
    private final String token;
    private final long started = System.nanoTime();
    private final ServerSocket server;
    private final ThreadPoolExecutor workers;
    private final ScheduledExecutorService writeDeadlines = Executors.newSingleThreadScheduledExecutor();
    private final Set<Socket> sockets = Collections.synchronizedSet(new HashSet<Socket>());
    private final Map<String, Integer> attempts = new HashMap<String, Integer>();
    private volatile boolean closed;
    private String pairedPeer;
    private Thread listener;
    private Socket streamSocket;

    public PairingServer(InetAddress bind, int port, FrameStore store) throws IOException {
        this(bind, port, store, new TransportPolicy());
    }
    public PairingServer(InetAddress bind, int port, FrameStore store, TransportPolicy policy) throws IOException {
        if (!(bind.isSiteLocalAddress() || bind.isLoopbackAddress())) throw new IOException("Private Wi-Fi address required");
        frames = store;
        transport = policy;
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
                s.setSoTimeout(1500); s.setTcpNoDelay(true);
                // A large kernel send queue can turn a weak radio link into
                // seconds of old video even though our Java queue is bounded.
                s.setSendBufferSize(16384); sockets.add(s);
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
            if (start.length != 3 || !start[2].equals("HTTP/1.1")) { reply(socket, 400, "", null); return; }
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
            if (closed || System.nanoTime() - started > 10L * 60L * 1000000000L) { reply(socket, 410, "", null); return; }
            String peer = socket.getInetAddress().getHostAddress();
            if (start[0].equals("POST") && start[1].equals("/v2/pair")) {
                if (h.containsKey("transfer-encoding") || !"8".equals(h.get("content-length"))) { reply(socket, 400, "", null); return; }
                byte[] b = new byte[8];
                for (int n = 0; n < 8;) { int r = in.read(b, n, 8 - n); if (r < 0) throw new EOFException(); n += r; }
                synchronized (this) {
                    int count = attempts.containsKey(peer) ? attempts.get(peer) : 0;
                    // A single small attempt budget for the entire session, not a resettable timer.
                    int all = 0; for (Integer value : attempts.values()) all += value;
                    if (count >= 5 || all >= 10 || (pairedPeer != null && !pairedPeer.equals(peer))) { reply(socket, 429, "", null); return; }
                    attempts.put(peer, count + 1);
                    if (!equal(pin, new String(b, StandardCharsets.US_ASCII))) { reply(socket, 403, "", null); return; }
                    pairedPeer = peer;
                }
                byte[] json = ("{\"token\":\"" + token + "\",\"protocol\":2,\"width\":" + FrameStore.WIDTH +
                        ",\"height\":" + FrameStore.HEIGHT + ",\"fps\":" + FrameStore.FPS + ",\"format\":\"yuv420-atlas-deflate\"}").getBytes(StandardCharsets.US_ASCII);
                reply(socket, 200, "application/json", json); return;
            }
            synchronized (this) {
                if (!peer.equals(pairedPeer) || !equal("Bearer " + token, h.get("authorization"))) { reply(socket, 403, "", null); return; }
            }
            if (!start[0].equals("GET") || !start[1].matches("/v2/stream\\?after=[0-9]{1,15}")) { reply(socket, 404, "", null); return; }
            long after = Long.parseLong(start[1].substring(start[1].indexOf('=') + 1));
            stream(socket, after);
        } catch (IOException | RuntimeException ignored) {
            // No screenshot, code, token or request is logged.
        } finally {
            sockets.remove(socket); try { socket.close(); } catch (IOException ignored) { }
        }
    }
    private void stream(Socket socket, long after) throws IOException {
        synchronized (this) {
            if (streamSocket != null && streamSocket != socket) try { streamSocket.close(); } catch (IOException ignored) { }
            streamSocket = socket;
        }
        try {
            OutputStream out = new BufferedOutputStream(socket.getOutputStream(), 65536);
            out.write(("HTTP/1.1 200 OK\r\nContent-Type: application/x-maxmods-hud-stream\r\nX-Mirror-Protocol: 2\r\n" +
                    "Cache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            out.flush();
            long lastWrite = 0, nextPicture = 0; int lastState = -1;
            while (!closed && !socket.isClosed()) {
                FrameStore.Snapshot snapshot = frames.snapshot(after);
                if (System.nanoTime() - started >= 10L * 60L * 1000000000L || snapshot.state.equals("stopped") || snapshot.state.equals("stalled")) {
                    writeRecord(socket, out, 5, after, null); return;
                }
                int state = snapshot.state.equals("hidden") ? 4 : snapshot.state.equals("waiting") ? 3 : 2;
                long now = System.nanoTime();
                if (snapshot.frame != null && now >= nextPicture) {
                    long began = System.nanoTime();
                    writeRecord(socket, out, 1, snapshot.frame.id, snapshot.frame.compressed);
                    long ended = System.nanoTime();
                    transport.sent(snapshot.frame.compressed.length, ended - began);
                    nextPicture = began + transport.intervalNs(snapshot.frame.compressed.length);
                    after = snapshot.frame.id; lastWrite = System.nanoTime(); lastState = 2;
                } else if (state != lastState || now - lastWrite >= 250000000L) {
                    writeRecord(socket, out, state, after, null); lastWrite = System.nanoTime(); lastState = state;
                }
                long waitMs = Math.max(1, 250 - (System.nanoTime() - lastWrite) / 1000000L);
                if (snapshot.frame != null) waitMs = Math.min(waitMs, Math.max(1, (nextPicture - System.nanoTime()) / 1000000L));
                try { frames.awaitChange(snapshot.version, waitMs); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IOException("Stream interrupted"); }
            }
        } finally { synchronized (this) { if (streamSocket == socket) streamSocket = null; } }
    }
    /** u32 payload length, u8 kind, u64 frame id, then one bounded zlib frame.
     * No queue: a slow socket gets the latest picture when it catches up. */
    private void writeRecord(final Socket socket, OutputStream out, int kind, long id, byte[] payload) throws IOException {
        int length = payload == null ? 0 : payload.length;
        byte[] header = new byte[13];
        for (int i = 0; i < 4; i++) header[i] = (byte) (length >>> (i * 8));
        header[4] = (byte) kind;
        for (int i = 0; i < 8; i++) header[5 + i] = (byte) (id >>> (i * 8));
        ScheduledFuture<?> deadline = writeDeadlines.schedule(new Runnable() { public void run() {
            try { socket.close(); } catch (IOException ignored) { }
        } }, 3, TimeUnit.SECONDS);
        try { out.write(header); if (payload != null) out.write(payload); out.flush(); }
        finally { deadline.cancel(false); }
    }
    private void reply(Socket s, int status, String type, byte[] body) throws IOException {
        int length = body == null ? 0 : body.length;
        String head = "HTTP/1.1 " + status + " Reply\r\nContent-Length: " + length + "\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n";
        if (!type.isEmpty()) head += "Content-Type: " + type + "\r\n";
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
        workers.shutdownNow(); writeDeadlines.shutdownNow();
    }
}

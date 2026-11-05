# Phone stream protocol 3

The phone binds its selected private Wi-Fi IPv4 address on TCP 8476.
`POST /v3/pair` accepts the eight-digit PIN and returns an ephemeral 128-bit
bearer token plus `protocol:3`, `format:"jpeg"` and one of these exact profiles:

| Profile | Width | Height | Maximum target fps |
| --- | --- | --- | --- |
| Sharp | 768 | 432 | 30 |
| Smooth | 576 | 324 | 60 |

Unknown dimensions, formats or combinations are refused. Both apps must be
0.4.0. The negotiated fps is a maximum target, not a measured display rate.

`GET /v3/stream?after=<id>` requires `Authorization: Bearer <token>`. The
response is a continuous `application/x-maxmods-hud-stream` body with
`X-Mirror-Protocol: 3`. Each record has a 13-byte header:

| Offset | Type | Meaning |
| --- | --- | --- |
| 0 | uint32 LE | JPEG payload length, at most 600000 bytes |
| 4 | uint8 | Kind |
| 5 | uint64 LE | Capture sequence within JavaScript's safe integer range |
| 13 | bytes | JPEG for kind 1; no payload for other kinds |

| Kind | Meaning |
| --- | --- |
| 1 | New complete JPEG picture |
| 2 | Authenticated capture-alive heartbeat; does not create a new image |
| 3 | Capture live, waiting for first/new image |
| 4 | Captured app hidden; discard cached/pending pictures |
| 5 | Capture stopped/stalled/session ended; terminal, do not reconnect |

Frame IDs increase. Pictures fit the entire phone capture in the fixed canvas.
The phone keeps only the newest JPEG and paces writes; a slow client does not
build a video backlog. The car allows one native decode in flight and one latest
waiting frame. Hidden/closed epochs discard late decoder completions.

The unprivileged native worker accepts a uint32-LE JPEG length and JPEG on stdin,
then returns uint32-LE atlas length and full-range BT.601 YUV420 atlas on stdout.
The atlas holds Y at full width/height, followed by half-resolution U and V
side-by-side (each half the full width). The worker validates size before
allocation/decode, caps address space at 96 MiB and has a client-side 2 s deadline.
No screenshot file is used. Legacy Store archives without execute bits use a
private executable copy in the SDK-provided app data folder, removed on close.

Capture liveness is renewed only by the capture worker after projection/display
checks, not by HTTP requests or pixel changes. Hidden content, locking, expired
liveness, Stop and the 10-minute session end clear the frame store. Brief network
failures may reconnect up to three times; a new live frame is required to show
anything. Park/stale-signal checks remain independent of network recovery.

## QR pairing

The car temporarily listens on one local private address, TCP 8477, when Pair
with QR is selected. The QR contains
`maxmods://pair?v=1&host=<local-ip>&port=8477&key=<48-hex-nonce>`.
It expires after two minutes. The phone scans locally with ZXing and sends the
eight-digit phone PIN to `POST /pair`, header `X-MaxMods-Pair: <nonce>`, using
the same Wi-Fi network as capture. Redirects/public addresses are refused.

The car derives the phone address from the incoming socket, checks the nonce,
request length/origin, attempt budget, deadline and Park state, claims the nonce
once, and completes the existing outgoing phone pairing. It never trusts a
phone-supplied address. Camera frames and the nonce are never logged or uploaded.

The optional Max Mods Connect tool provides a Unix-socket privilege boundary at
`/run/maxmods-connect/pair.sock`, group `tm_oap_app`. Its only request is
`{"op":"pair","host":"<car-local-ip>"}`. It validates the address against actual
local interfaces, then temporarily permits TCP 8477 only to that address on
that interface from its subnet. No arbitrary port/command/duration is accepted.
The lease ends on client disconnect or after two minutes; cleanup removes only
rules marked MaxModsQR. The bridge never receives a PIN, QR nonce or screenshot.
Without the helper, direct QR can work where the existing car firewall permits
it; manual pairing remains available.

These protocols use authenticated local HTTP, without transport encryption.
Use a trusted BMW network. Tokens, codes and pictures are memory-only.

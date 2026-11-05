# Phone stream protocol 4

Phone and car both require version **0.5.0**. The phone binds its selected
private Wi-Fi IPv4 address on TCP 8476. Requests with an Origin, unsupported
routes/body lengths or unauthorised peers/tokens are refused.

## Pairing and linked start

POST /v4/pair exchanges the eight-digit PIN for an ephemeral 128-bit bearer
token, a private reconnect credential and protocol/profile information.
Pairing has a bounded per-peer/session attempt budget.

POST /v4/resume accepts the fixed 32-hex reconnect credential. It reconnects
only to a running capture server and returns that session's token/info.
Failed attempts are bounded. It cannot start MediaProjection or approve
Android consent. The car polls its one saved private address every two
seconds while idle; a new token can auto-start after genuine Park checks.
A car Stop suppresses auto-start for that token.

The credential is held in Android private preferences (backup disabled) and
the car's SDK app-data folder (0600). Session tokens and PINs are memory-only.
Forget on the phone removes the credential; the next capture creates a new
one. Forget on the car removes its saved link.

| Profile | Renderer width | Renderer height | Maximum requested fps |
| --- | --- | --- | --- |
| Sharp | 768 | 432 | 30 |
| Smooth | 576 | 324 | 60 |

Info includes protocol:4 and format:jpeg or h264-annexb. Unknown combinations
are refused. The rate is a requested maximum, not a measured display rate.

Authenticated POST /v4/prepare accepts exactly jpeg or h264 (four bytes).
The phone switches the surface on its one VirtualDisplay. JPEG retains the
selected canvas. Hardware AVC captures the complete screen into 1280 × 720,
with Android aspect fit; native decoder VPP scales to the renderer canvas.
Android 12L+ uniform scaling is required for this path. Older Android or
unsupported hardware/configuration returns an error and the car selects JPEG.
POST /v4/keyframe with a one-byte body requests a fresh AVC sync frame.

## Stream framing

GET /v4/stream?after=id requires Authorization: Bearer token. The response is
application/x-maxmods-hud-stream with X-Mirror-Protocol:4. Each record has:

| Offset | Type | Meaning |
| --- | --- | --- |
| 0 | uint32 LE | Payload length, no more than 600000 |
| 4 | uint8 | Kind |
| 5 | uint64 LE | Increasing capture sequence, safe in JavaScript integers |
| 13 | bytes | One complete JPEG / AVC access unit for kind 1 |

| Kind | Meaning |
| --- | --- |
| 1 | New compressed picture / AVC access unit |
| 2 | Authenticated capture-alive; no new picture |
| 3 | Capture live, waiting for a picture |
| 4 | Shared content hidden; discard pending/reference pictures |
| 5 | Stopped/stalled/expired capture; terminal |

JPEG stores only the newest frame. The car allows one native decode and one
latest waiting frame. AVC needs reference order: the phone retains at most
12 access units / 2 MiB. On gaps the car discards non-IDR units and requests a
keyframe, at most every 250 ms. Each IDR has codec configuration prefixed.
A slow writer is bounded and can cause JPEG fallback; no unbounded playback
queue is allowed. AVC byte pacing does not independently drop reference
frames to impose a second fps limiter.

Capture-alive is renewed only by the capture worker after checking Android's
projection/display and phone state. HTTP or unchanged pixels cannot renew
it. Hidden content, locking, expired liveness, Stop and the ten-minute limit
clear the store. JPEG link recovery is bounded to three retries and waits for
a new live frame. GPU disconnection/pause falls back once to JPEG.

## Car output

The JPEG worker accepts a uint32-LE length plus JPEG on stdin and returns a
uint32-LE length plus full-range BT.601 YUV420 atlas. It validates dimensions,
caps memory at 96 MiB and has a two-second client deadline. Y is full size;
half-width U/V are side by side beneath it. No screenshot file is used.

HUD/cluster JPEG sends that atlas to cluster-render. Cluster uses map with
contend=true, not the full gauge panel. Compact/Full geometry keeps aspect.

iDrive output converts the atlas to contiguous I420 planes in a RAM-only
/dev/shm/mgu-video-maxmods-* file. Its 64-byte MGUV v1 header names dimensions,
three slots, sequence, selected slot, BT.601 and full range. The writer fills
the next slot, publishes slot then sequence. mgu-render samples newest frames
on the GPU without per-frame dashboard uploads. Close unregisters and removes
the file. UI frames are small native rect/glyph/image/video operations.

The maxmods-video helper uses /run/maxmods-video/control.sock. Its bounded
open request accepts only HUD/map, Compact/Full and the two profiles above.
It starts a separate process of the already-installed Waze decoder with its
own FIFO/config/control paths, no AVB/UDP/CarPlay input, no firmware patching,
and guide hiding off. It forwards native status and validates the target.
A genuine phone capture-alive record renews its short lease. Close, socket
loss or expiry kills only the owned child; normal close acknowledges after
exit. New outputs wait for release. Existing Waze is never stopped/reconfigured.

Speed/Park freshness, app visibility options and session deadlines remain
independent of transport. No output is authorised by cached/timer-generated
vehicle readings.

## QR pairing version 2

Pair with QR temporarily listens on TCP 8477. It advertises up to four
eligible private car addresses:

maxmods://pair?v=2&host=first&hosts=comma-separated-addresses&port=8477&key=48hex

The phone selects only addresses in the same subnet as its capture Wi-Fi
network and binds the HTTP request to that Network. It sends the eight-digit
PIN to POST /pair, header X-MaxMods-Pair. Redirects/public addresses are refused.
The car derives the phone address from the socket, checks nonce, length,
origin, attempts, expiry and live Park, then claims the nonce once and performs
the normal outgoing pairing. Camera frames remain local.

Connect 0.2.0 grants a temporary lease through its group-restricted Unix
socket. It validates one to four addresses against actual interfaces and
adds only TCP 8477 rules for the interface, destination and source subnet.
No arbitrary commands/ports/durations are accepted. Disconnect/expiry removes
only MaxModsQR rules, with cleanup retry. The helper receives no PIN, QR key
or video. QR is shown only after the helper becomes ready; manual pairing
remains available if it fails.

These local protocols are authenticated but not transport-encrypted. Use a
trusted BMW network. Only the private reconnect credential/address and display
preferences persist; screens, camera frames, PINs and session tokens do not.

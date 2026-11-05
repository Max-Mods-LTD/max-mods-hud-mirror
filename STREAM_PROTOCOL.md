# Phone stream protocol 4

Current phone and car version is **0.6.0**, retaining protocol 4. Update both
for current traffic handling and connection guides. The phone binds its selected
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
selected canvas. Hardware AVC first tries that canvas, with a 1280 × 720
fallback. Android fits the complete screen; decoder VPP scales to the canvas.
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
12 access units / 2 MiB. If multiple pending units are over 300 ms behind,
the phone retains only the newest without changing its sequence/capture time.
On gaps the car discards non-IDR units and requests a
keyframe, at most every 250 ms. Each IDR has codec configuration prefixed.
A slow writer is bounded and can cause JPEG fallback; no unbounded playback
queue is allowed. AVC byte pacing does not independently drop reference
frames to impose a second fps limiter.

The hardware encoder caps surface input before compression at its negotiated
30/60 maximum. Auto AVC ceilings are 1.2 Mbps for detected audio on shared or
unknown bands, 1.8 Mbps for audio on 5 GHz and 2.4 Mbps otherwise. Audio priority
always caps at 1.2 Mbps; Quality allows 3 Mbps. Measured write delay/capture age
reduces the requested encoder rate by 25%, no more often than every 500 ms,
to a 0.6 Mbps floor. Sustained clear writes recover gradually within the
current ceiling. MediaCodec applies changes via VIDEO_BITRATE; a driver that
rejects runtime changes keeps encoding and exposes that status to the phone.
JPEG congestion reduces quality before reducing fps; canvas dimensions stay
fixed. These policies do not change audio focus, routing or BMW radio settings.

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

## Local connection

QR pairing and its TCP 8477 listener are removed from the current apps.
Manual pairing and trusted resume need no inbound car firewall opening.
The obsolete Connect tool remains in source/rollback material and
is not listed or required by the current catalog.

The local protocol is authenticated but not transport-encrypted. Use a
trusted BMW network. Only the private reconnect credential/address and display
preferences persist; screens, PINs and session tokens do not.

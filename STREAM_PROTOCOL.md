# Phone stream protocol 2

The companion listens on its private Wi-Fi IPv4 address, TCP 8476.
Only the paired peer and its ephemeral bearer token may open the stream.
The session ends after ten minutes. This is authenticated local HTTP;
it does not encrypt screenshots. No screenshot or token is persisted.

`POST /v2/pair` accepts the displayed eight-digit code and returns the
session token, protocol 2, width 768, height 432, target fps 30 and format
`yuv420-atlas-deflate`. Car and phone 0.3.0 use the same wire format.
The negotiated fps is the maximum target, not a current measurement.

`GET /v2/stream?after=<last-frame-id>` uses `Authorization: Bearer <token>`.
The response is one continuous `application/x-maxmods-hud-stream` body,
with `X-Mirror-Protocol: 2`. Each record has a 13-byte header:

| Offset | Type | Meaning |
| --- | --- | --- |
| 0 | uint32 LE | Compressed payload length |
| 4 | uint8 | Record kind |
| 5 | uint64 LE | Frame sequence, within JavaScript's safe integer range |
| 13 | bytes | Payload, for kind 1 only |

| Kind | Meaning |
| --- | --- |
| 1 | New image: one zlib-compressed native YUV 4:2:0 atlas |
| 2 | Capture active; no new picture in this record |
| 3 | Capture active, waiting for its first/new picture |
| 4 | Shared app hidden; erase output until a new picture arrives |
| 5 | Capture stopped, stalled or session expired; close stream |

The atlas is 768 x 432 Y bytes, followed by 216 rows with U on the left
and V on the right, 384 bytes each. Colour is full-range BT.601 to match
the renderer. Payloads are capped at raw atlas bytes + 4096; inflation
is streamed and capped at exactly 497,664 output bytes, including on
Node 8. The receiver retains at most one decode and one latest pending
frame. Intermediate frames are discarded when it cannot keep up.

The capture worker checks the projection, virtual display and phone lock
state every 250 ms. Only that worker renews the 2.5-second liveness
deadline. HTTP requests and repeated pixels do not renew it. MediaProjection
stop/visibility callbacks end or hide output. A live unchanged screen
keeps its original capture time and sequence number.

The server sends the newest available picture when its pacing permits, or a state heartbeat
every 250 ms. Socket writes have a three-second deadline. The car uses a
3.5-second connection deadline and its existing fresh zero-speed/Park
guard. Active capture records may refresh an unchanged frame in the native
video renderer, whose stall deadline is separate. Paused/stopped/dead
connections never refresh a cached picture.

Version 0.3.0 requests a 16 KiB socket send buffer so a slowed radio does
not hide a large playback queue below the Java layer. Auto picture traffic
is paced at 8 MiB/s normally or 2 MiB/s when an available Bluetooth output
shares 2.4 GHz/an unknown band; Bluetooth priority forces the latter.
Quality priority removes that artificial byte cap and preserves full
capture detail. Actual writes still have the same bounded deadline.

Write duration and picture size drive capture scaling (100/75/50/38/25
percent) before fps reduction (30 down to 10). The planes are converted
at the smaller capture size before expansion into the unchanged canvas,
reducing CPU work and compressed traffic without cropping phone edges.
Sparse/quiet screens may refine to full detail instead of being treated
as a continuous 30-fps load. These are traffic policies, not an RF fix or
a guarantee of a particular projector rate.

The car may retry a transport error three times with 250/750/1500 ms
backoff, discarding cached pictures and all callbacks from an old
connection. Only a new live frame may show the layer again. Explicit
capture/protocol failures do not retry. Stop, vehicle permission loss,
renderer loss and the original session deadline cancel recovery.

The native video layer targets 30 fps and uses the renderer's existing
motion packing when needed, refining to the exact atlas when the shared
upload budget permits. Its worst packed motion traffic at 30 fps is
4,976,640 bytes/s, below the default 5500 KiB/s renderer cap. Other layers,
Wi-Fi and hardware processing can still reduce the projected rate.

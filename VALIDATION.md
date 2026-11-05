# Validation — HUD Mirror 0.7.0

Host checks completed 5 November 2026. These are source/package, protocol and
workflow checks, not an MGU emulator or a physical phone/car benchmark.

## Native BMW interface and black-screen recovery

The supplied five-second video shows Waze's native BMW list page. The current
app uses the same public RHMI template/widget family: eight LT_State_Wide
menu pages, LT_Button_1Row buttons and LT_Label_1Row text. BMW supplies fonts,
layout, red selection, rotary focus and Back. A ninth WelcomeApp page embeds
only the iDrive picture. No BMW SDK, fonts or proprietary widget code is shipped.

The custom dashboard/font atlas/controller grab and FrontCCU subscription are
removed. HUD/cluster sessions never connect to a menu/video GPU client. Native
menu resources load before offering entry; clicking a menu does not hide a
custom surface and wait for lazy resource loading.

Host lifecycle checks use the actual generated UI schema and verify:

- All nine pages load before entry; the entry maps to the native main page.
- Native display/layout actions, saved settings, guide and update notes.
- Rejected or never-settled opens and failed Back requests recover to the
  native main menu and release navigation state. A late JavaScript completion
  cannot replace a newer navigation result.
- HMI requests do not hold the vehicle-signals native queue; Park/speed work
  remains independent even if a menu request never answers.
- BMW Back / picture tap returns from video; loss/hidden picture returns to
  native controls instead of leaving a blank picture page.
- Background/foreground behaviour, motion stop, linked one-Start, suppression
  after Stop, genuine Park for pending start and own-resource reset remain.

The video-only host checks lazy connection, actual embed sizing, 13-word video
commands, no controller grab, touch/Back, hide/release, disconnect and startup
timeout. iDrive renderer tests check asynchronous startup cancellation and
renderer-loss listener cleanup, plus I420/MGUV planes, slots, sequence, live
layout without per-frame menu rebuild, private settings and RAM-file removal.
Physical native rendering/rotary/Back and failed-menu behaviour need car tests.

## Frame rate and audio handling

- JPEG native output now copies chunks into one bounded frame buffer instead
  of repeatedly concatenating all accumulated bytes. Byte-at-a-time header/
  payload tests prove reconstruction without Buffer.concat, correct bounds
  and fail-closed malformed sizes. The real static JPEG worker still passes
  colors, portrait/landscape geometry, malformed data and permission fallback.
- JPEG capture owns the fps clock; the socket paces only its byte budget.
  Tests verify that a small write does not acquire another frame-period wait.
- Congestion still reduces JPEG quality before requested fps. Requested fps
  no longer drops below 30. Windowed recovery reaches 60 despite periodic
  Bluetooth-like slow-write bursts that defeat a consecutive-fast-write rule.
  Actual link throughput can remain below that requested rate.
- Android reuses its padded-pixel copy buffer; hardware AVC requests real-time
  priority and its negotiated operating rate. API-35 compilation checks the
  configuration; driver acceptance and thermal/RF effects require the phone.
- Prior audio-aware AVC ceilings, adaptive bitrate/floor/recovery, single
  encoder input cap, whole-picture fit and age-bounded keyframe recovery stay.
  Annex B / bounded reference order / immutable capture timestamps / capture
  liveness / hidden/stopped cleanup checks pass. No hardware decoder ran here.
- Authenticated /v4/status reports real capture, wire fps and video kbit/s.
  Bounded counters, idle/stop clearing and heartbeat-without-fps tests pass.
  Unauthenticated status is refused; real HTTP/Node checks validate counters
  during both Sharp and Smooth playback. Stats polling stops off the visible
  diagnostics page. Rates describe published/sent/received frames, not projection.
- Real Java HTTP -> Node/native JPEG received 29.5 fps from a synthetic 30-fps
  producer and 57.5 from a 60-fps producer after the final socket-clock change.
  Token/resume checks, still-screen liveness, hidden/visible, peer budgets,
  connection replacement and terminal stop pass. Static content is not sent
  repeatedly merely to increase the displayed rate.
- Real Java HTTP -> Node AVC checks synthetic NALs: delayed references skipped,
  a car-requested IDR, ordered deltas, hidden-reference reset and terminal stop.
  This is transport validation, not a hardware decode or radio simulation.

## Other regression checks

- 21 car controller cases: fresh zero speed/Park, stale/invalid signals, late
  frames, renderer cleanup, bounded retries, one destination at a time,
  old-output release before new output, geometry, codec cancellation/fallback.
- Six signal groups: both selector fields, CRC events, actual speed polls,
  quiet subscription renewals, missing interfaces and shutdown races. Runtime
  signal code is unchanged. Tests now wait for bounded observable poll/renew
  events rather than fixed 80 ms scheduler margins; the no-notification case
  verifies a real renewal happened without refreshing cached Park.
- GPU helper/FIFO: fragmented replies/status, genuine capture-only lease,
  ordered/bounded nonblocking writes, exit acknowledgement, single owned
  decoder, disconnect/expiry cleanup and abandoned-session cleanup. Host
  helpers use mock children/TCP stand-ins; BMW Unix sockets, DRI/systemd,
  installed Waze/MSDK/VAAPI and compositor ownership remain unverified here.
- Display60 reversible/idempotent override and rollback; legacy Connect
  cleanup/injection/lease checks pass. Current apps do not use QR or Connect.
- Actual upstream Store reader/packer/planner lists all three current entries,
  installs/upgrades GPU Video before the app and rejects the old invalid tool
  build metadata. Checked with ee34705eb3e682949acaf9106155a740f1012982,
  updater 0.8.21. Source-only SDK link uses made-up stubs, not BMW code.
- Package checks validate native widgets, unique HMI IDs, module syntax,
  current metadata/notes, no custom atlas/dashboard, decoder source/licenses,
  executable mode, no FrontCCU declaration and read-only vehicle permissions.
- Android API-35 compile / API-26+ DEX, zip alignment, v2/v3 signing and same
  update certificate. APK contains current notes/guide/rate counters and no
  scanner, QR connector, camera permission or ZXing classes.

## Physical evidence and remaining checks

The user reports Bluetooth/video is much better in 0.6.0 but drops to roughly
9 fps and settles near 15; opening picture/settings can leave a black screen.
That is evidence about the prior build. No physical 0.7.0 result is claimed.

Update acceptance, native layout/controller/Back, menu recovery while playing,
Android capture/rotation/consent, encoder hints, real RF/audio/thermal behaviour,
background Android Auto, decoder compatibility, HUD/cluster/iDrive ownership,
actual rendered fps, all picture edges and BMW speed/sign/gauge visibility
still need the car. A 60 Hz clock or a requested rate is not a 60 fps guarantee.
Stationary/Park and fail-closed cleanup remain; no driving waiver was added.

## Android artifact

- downloads/Max_Mods_HUD_Mirror_Android_v0.7.0.apk
- Version code: 7; bytes: 156341
- SHA-256: 0af7bd4bda3616d76921ae74d144d2925c2a0a10ff2c6c13dea8e16f77c699a0
- Certificate SHA-256:
  6ff47774fbd873410db97aba2e76d9d460dcf271db288845bc85376dce3d7903

## Reproduce

Run Node test_car, test_vehicle_signals, test_app_lifecycle, test_native_video,
test_idrive_renderer, test_stream_decoder, test_gpu_video_renderer,
test_gpu_fifo, test_video_helper, test_display60, test_connect and test_package
under tests/. test_store_source.js also needs MGU_STORE_CHECKOUT.

Compile FrameStore, FrameEncoder, TransportPolicy, RateMeter, PairingServer,
AnnexB and the Java harnesses into build/phone-tests. Run PhoneServerHarness
store-test, AvcStoreHarness and RateMeterHarness. Then run test_avc_integration,
test_phone_integration and test_phone_integration smooth sequentially (same
port 8476). Avoid competing builds during short timing checks.
Build APK with tools/build_android.py and the existing private update key.

# Validation — HUD Mirror 0.6.0

Host checks completed 5 November 2026. These are source/package, protocol and
host rendering checks, not an MGU emulator or a physical phone/car benchmark.

## Current release

- Removed the car QR listener/generator and Android scanner/connector, camera
  permission and ZXing build dependency. Current catalog contains three
  entries: HUD Mirror 0.6.0, GPU Video 0.1.0 and Display60 0.1.0. Connect is
  neither listed nor required; its historical uninstall/rollback source remains.
- Both apps use connection_guide.json for the BMW Wi-Fi menu/password, Samsung
  connection, no-Internet prompt, sound route, manual pairing and audio-priority
  steps. Car guide has native Previous/Next/Back actions; phone has settings
  shortcuts. Physical menu labels vary by equipment/software.
- Pure-Java policy checks cover audio detected without a Bluetooth output,
  shared/unknown/5 GHz budgets, manual modes, congestion floor and recovery.
  AVC feedback changes bitrate without applying JPEG's fps limiter. JPEG
  reduces compressed quality before fps and restores both after clear writes.
- AVC backlog tests preserve the newest unit's real sequence/capture time,
  discard only aged multiple pending references and never renew capture
  liveness. Hidden, stopped and expired capture remain blocked.
- Real Java HTTP -> Node AVC check uses synthetic NALs: delayed references
  are discarded; the car requests a fresh IDR; deltas remain ordered; hiding
  invalidates references and requires another IDR; terminal stop closes output.
  This does not execute a hardware decoder or simulate RF interference.
- API-35 Android compile checks the selected-canvas encoder configuration,
  float MAX_FPS_TO_ENCODER and live VIDEO_BITRATE control. Actual driver
  acceptance, bitrate output and radio behaviour need the phone/car.

## Runtime and packaging checks

- **21 car controller cases**: zero speed/Park, invalid/stale data, late
  callbacks, stopped/hidden capture, bounded recovery, all three destinations,
  old-output release before new output, whole-picture geometry, cluster slot
  contention, cancellation during codec setup, immediate compatibility
  switching, GPU-to-JPEG fallback and cleanup despite a failed hide command.
- **Six signal groups**: both selector fields, changing DataPowerTrain2CRC,
  speed polling, quiet-field subscription renewal with real notifications,
  no timer/cached Park refresh, unavailable interfaces and shutdown races.
  SDK values are mocked; no live BMW reading was observed here.
- **Lifecycle / linked start**: hiding pages, foreground-only mode, movement
  while hidden, native controller/focus bindings, OEM menus/diagnostics, one
  Start after first pairing, Stop suppression for the same capture token,
  Park-gated pending start, reconnect, own-resource reset and guide navigation.
- **GPU dashboard**: actual embed-box scaling, draw-command/resource bounds,
  1024/1440-wide layouts, transparent logo, rotary/native focus, release notes,
  Setup guide action, no QR controls and controls retained during video updates.
  No full-screen software UI bitmap upload. Inspected real-command previews
  are in docs/images; these are host renderings, not BMW screenshots.
- **iDrive surface**: MGUV header/slots/sequence, contiguous I420 planes,
  live layout without per-frame UI rebuild, RAM-file removal, private saved
  credentials/preferences and Forget behaviour.
- **GPU adapter / FIFO**: fragmented replies/status, target validation, real
  capture-only lease renewal, ordered/bounded writes, exit acknowledgement,
  single owned decoder, disconnect/expiry cleanup and abandoned-session cleanup.
  Real host FIFO checks delayed-reader startup without a blocking open,
  ordered large writes and cancellable pipe cleanup.
- **Native hardware decoding was not executed.** Helper checks use mock
  children and TCP framing stand-ins because this host refuses Unix-socket
  binds. BMW systemd, DRI permissions, installed Waze, MSDK/VAAPI, compositor
  and target ownership are not verified by these checks.
- **JPEG/native stream**: real musl-static JPEG worker, colors/geometry,
  malformed inputs, fragmentation/bounds, one latest waiting picture, hidden
  decode cancellation and executable fallback for old Store archives.
- **Java storage/encoding**: immutable frames, static capture liveness,
  expiry/hidden/stop, portrait/landscape fit and padded RGBA rows. Annex B
  checks reject malformed NALs and preserve bounded reference order.
- **Real Java server -> HTTP -> Node/native JPEG**: 29.5 received fps for a
  synthetic 30-fps producer; 56.9 for a 60-fps producer. Received fps is not
  phone capture or projector fps. Token/resume checks, codec fallback,
  keyframe route, pairing budget, static screen, hidden/visible, connection
  replacement and terminal stop passed. The first concurrent build/test run
  missed the Sharp rate and signal-poll timing assertions; both passed in
  isolation without changing assertions or production signal code. These
  short host timing checks are sensitive to competing CPU work.
- **Display60**: reversible/idempotent override, preserving later edits,
  rollback and symlink refusal; no real car renderer restart. Legacy Connect
  cleanup/injection/lease checks still pass; current apps do not use it.
- **Actual Store source/packer/planner**: all three current entries parsed
  with no skips, GPU Video installed/upgraded before the app, correct file
  checksums/permissions. Regression reproduces the missing-helper failure
  when invalid build metadata is added to tools. Checked with upstream
  ee34705eb3e682949acaf9106155a740f1012982, updater 0.8.21.
- **Car package**: source-only module link using made-up SDK stubs, Node
  syntax, current native UI/metadata, assets/decoder source/licenses,
  executable bits and read-only vehicle declarations.
- **Android**: API-35 compile, API-26+ DEX, alignment and v2/v3 signatures;
  same update certificate as earlier releases. Current guide/notes are in
  the APK; no ScannerActivity, QrConnector or ZXing classes. Hardware AVC
  requires Android 12L+ for uniform whole-screen fit; older phones use JPEG.

## Physical checks still needed

Update acceptance; capture/rotation/consent; genuine powertrain CRC cadence
and quiet-field renewal; native controller navigation/guide presentation;
installed decoder/GPU permissions; thermal/radio behaviour and audio with
Bluetooth or wireless Android Auto; background lifecycle; HUD/map/iDrive
ownership; picture detail, real rendered fps and all phone edges; BMW speed,
signs, gauges and warnings.

The user now reports smooth streaming until audio/Bluetooth is involved.
That is partial physical evidence for the prior build. The 0.6.0 audio changes
have not been tested on the car here; do not describe them as car-verified
fixes or promise 60 fps. Earlier QR/cluster and stale-signal faults also need
physical regression checks. Video remains stationary/Park-only. Lock/force
stop, Wi-Fi address changes, capture expiry and ten-minute sessions end sharing.

## Android artifact

- File: downloads/Max_Mods_HUD_Mirror_Android_v0.6.0.apk
- Version code: 6
- Bytes: 156341
- SHA-256: b47fb00a781ff585537a8ec9c2f35a82bd915584cc34e0e9a71290d085b41f50
- Update certificate SHA-256:
  6ff47774fbd873410db97aba2e76d9d460dcf271db288845bc85376dce3d7903

## Reproduce

Run Node checks in tests/test_car.js, test_vehicle_signals.js,
test_app_lifecycle.js, test_stream_decoder.js, test_display60.js,
test_dashboard.js, test_idrive_renderer.js, test_gpu_video_renderer.js,
test_gpu_fifo.js, test_video_helper.js and test_package.js. Also run
legacy test_connect.js. test_store_source.js needs MGU_STORE_CHECKOUT.

Compile PhoneServerHarness.java / AvcStoreHarness.java with FrameStore,
FrameEncoder, AnnexB, PairingServer and TransportPolicy into build/phone-tests.
Run PhoneServerHarness store-test and uk.maxmods.hudmirror.AvcStoreHarness,
then test_avc_integration.js, test_phone_integration.js and again with smooth.
Do not run the port-8476 integration checks concurrently. Run timing checks
without a simultaneous APK compilation. tools/render_dashboard_preview.py
regenerates real-command previews. APK instructions: tools/build_android.py.
The builder refuses to replace a missing update key when releases exist.

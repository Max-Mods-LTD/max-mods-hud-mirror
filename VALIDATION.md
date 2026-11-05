# Validation — HUD Mirror 0.5.0

Host checks completed 5 November 2026. These are source/package, protocol and
host rendering checks, not an MGU emulator or a physical phone/car benchmark.

## Passed

- **21 car controller cases**: zero speed/Park, invalid/stale data, late
  callbacks, stopped/hidden capture, bounded recovery, all three destinations,
  old-output release before a new output, whole-picture geometry, cluster slot
  contention, cancellation during codec preparation, immediate compatibility
  switching, GPU-to-JPEG fallback after decoder exit and cleanup despite a
  failed hide command.
- **Six signal groups**: both selector fields, changing DataPowerTrain2CRC,
  actual speed polling, quiet-field resubscription with real notifications,
  no timer/cached Park refresh, unavailable interfaces and shutdown races.
  SDK field values are mocked; no live BMW reading was observed.
- **App lifecycle / linked start**: hiding the page, foreground-only mode,
  movement while hidden, native controller/focus bindings, OEM menus and
  diagnostics, one Start after initial pairing, Stop suppression for the same
  capture token, Park-gated pending start, reconnect and own-resource reset.
- **GPU dashboard**: actual embed-box scaling, all draw-command/resource bounds,
  1024/1440-wide layouts, transparent logo, rotary/native focus, release notes,
  QR layout and controls that stay open during video updates. No full-screen
  software UI bitmap is uploaded. Previews are in docs/images.
- **iDrive surface**: MGUV header/slot/sequence, exact contiguous I420 Y/U/V
  planes, live layout changes without per-frame UI rebuild, RAM-file removal,
  private saved reconnect credential/preferences and Forget behaviour.
- **GPU adapter**: fragmented replies and status, target validation, real
  capture-only lease renewal, ordered/bounded writes, exit acknowledgement,
  single owned decoder, disconnect/lease cleanup and abandoned-session cleanup.
  A real host FIFO test verifies delayed-reader startup without a blocking
  open, ordered large writes and cancellable pipe cleanup.
- **Native hardware decoding was not executed.** Helper tests use a mock child
  and TCP framing stand-ins because this host refuses Unix-socket binds. They
  do not verify the BMW's systemd units, DRI permissions, installed Waze version,
  Intel MSDK/VAAPI decoding, compositor or target ownership.
- **JPEG/native stream**: real musl-static JPEG worker, colors/geometry, malformed
  inputs, stream fragmentation/bounds, one latest waiting picture, hidden
  decode cancellation and executable fallback for old Store archives.
- **Java storage/encoding policy**: immutable frames, static capture liveness,
  expiry/hidden/stop, portrait/landscape fit, congestion pacing and recovery.
  AVC tests cover Annex B conversion, malformed NAL rejection and bounded
  reference order. Hardware MediaCodec itself was not run on a phone.
- **Real Java server -> HTTP -> Node/native JPEG**: 29.0 received fps for a
  synthetic 30-fps producer and 57.5 for a 60-fps producer in the initial
  0.5 checks. This does not measure Android capture or the projector. Token,
  resume credential, codec fallback, keyframe route, pairing budget, still
  picture, hidden/visible, connection replacement and terminal stop passed.
- **QR**: nonce/attempt/origin/body/expiry/Park checks, multiple advertised
  addresses, helper startup beyond the old timeout and no QR after helper
  failure. The actual new dashboard QR raster decodes with the phone's ZXing
  luma path on the host.
- **Connect**: exact interface/subnet/destination/port, injection refusal,
  lease/disconnect cleanup and cleanup retry. nft commands are mocked.
  **Display60**: reversible/idempotent override, restoration preserving later
  edits, rollback and symlink refusal. No real car renderer was restarted.
- **Store packaging**: source-only module link with synthetic SDK stubs,
  syntax, current metadata/native UI, assets/worker source/licenses, preserved
  executable bits and read-only vehicle declarations. Connect/GPU Video
  artifacts build with the upstream production tool builder.
- **Android**: API-35 compile, API-26+ DEX, alignment and v2/v3 signatures;
  certificate matches earlier releases. Current notes, transparent logo,
  AVC/QR classes and streaming-status API are in the signed APK. Hardware AVC
  requires Android 12L+ for uniform whole-screen scaling; older phones use JPEG.

## Physical checks still needed

Install/update acceptance; Android capture/rotation/consent/camera; genuine
powertrain CRC notification cadence and quiet-field renewal; native controller
navigation; QR selection/firewall/systemd; installed decoder compatibility
and GPU permissions; radio/thermal performance; wireless Android Auto/audio
coexistence; background app lifecycle; HUD/map/iDrive display arbitration;
image quality, real rendered fps and all phone edges; BMW speed, signs, gauges
and warnings.

The user reported that the earlier HUD test worked, but video was pixelated,
laggy/intermittent, QR/cluster failed and stale signals occurred. Those reports
motivated this update. No physical success for 0.5.0 has been observed.
Do not describe the reported faults as car-verified fixes or promise 60 fps.

Video remains stationary/Park-only. Force-stopping/locking the phone, changed
Wi-Fi, expired capture and ten-minute sessions still end sharing.

## Android artifact

- File: downloads/Max_Mods_HUD_Mirror_Android_v0.5.0.apk
- Bytes: 422574
- SHA-256: 0c0b52544265316fc586f16818a7b78c235a9626d613b96f800c75e6b7c05f52
- Update certificate SHA-256:
  6ff47774fbd873410db97aba2e76d9d460dcf271db288845bc85376dce3d7903

## Reproduce

Run the Node checks in tests/test_car.js, test_vehicle_signals.js,
test_app_lifecycle.js, test_stream_decoder.js, test_qr_pairing.js,
test_connect.js, test_display60.js, test_dashboard.js, test_idrive_renderer.js,
test_gpu_video_renderer.js, test_gpu_fifo.js, test_video_helper.js and
test_package.js.

Compile PhoneServerHarness.java / AvcStoreHarness.java with FrameStore,
FrameEncoder, AnnexB, PairingServer and TransportPolicy into build/phone-tests.
Run PhoneServerHarness store-test and uk.maxmods.hudmirror.AvcStoreHarness,
then test_phone_integration.js and again with smooth. Compile QrScanHarness
with the vendored ZXing JAR. tools/render_dashboard_preview.py regenerates
the real-command previews. APK instructions are in tools/build_android.py.
The builder refuses to replace a missing update key when releases exist.

# Validation — HUD Mirror 0.4.0

Host checks completed 5 November 2026. This is not an MGU emulator, an Android
hardware test, an RF/audio test or a measured projector result.

## Passed

- 17 controller tests: fresh zero-speed/Park requirements; stale/invalid data;
  late callbacks after Stop; native renderer loss; layout/aspect bounds;
  authenticated static-screen liveness; hidden-content clearing; bounded
  network recovery and cancellation; HUD/cluster selection; 30/60 profile
  negotiation and native upload-budget arithmetic.
- Four vehicle-signal groups: actual BMW field names/scaling, event-only
  selector fields, both gearbox variants, speed polling, stale Park rejection,
  unavailable interfaces and startup/shutdown races. No unsupported gear getter
  was added. These are mocked SDK checks, not readings from the car.
- App lifecycle tests: a hidden iDrive page can keep its mirror running while
  the dashboard/controller capture is released; foreground-only mode stops;
  a hidden-page movement update still stops output; native dashboard and
  fallback navigation use the SDK's openState route.
- Real Java FrameStore/PairingServer and HTTP -> Node -> native JPEG decoder
  integration: **29.0 received fps for the 30-fps host producer** and
  **57.5 received fps for the 60-fps host producer** in the final runs.
  The producer uses synthetic JPEGs; this does not benchmark Android's
  Bitmap encoder, BMW networking or the projector.
- Real native musl-static decoder: 60 fixture frames in 291 ms on this host;
  expected colors/full YUV atlas; malformed/truncated/wrong-dimension JPEG
  rejection; stream fragmentation/oversize rejection; latest waiting frame;
  hidden decode cancellation and terminal stop. The private app-data executable
  fallback also passed with the packaged worker's execute bit removed.
- Java storage/policy tests: immutable JPEGs, capture heartbeat separate from
  pixel changes, worker expiry, hidden/stopped stores, portrait/landscape fit,
  Bluetooth traffic pacing, fixed spatial detail during congestion and bounded
  frame-rate recovery. Legacy conversion tests remain as geometry regressions;
  production capture uses the Android-native JPEG path.
- QR request tests: random one-use nonce, source-address-derived phone pairing,
  expiry, origin/length/attempt bounds and Park checks. The actual car dashboard
  QR raster decodes using the phone's ZXing/luma pipeline on the host.
- Connect privilege-boundary tests: only the selected real local interface,
  subnet, destination and TCP 8477; remote addresses/command injection refused;
  socket-close and lease-expiry cleanup; unrelated firewall rules preserved.
  nft commands are simulated. Real BMW firewall/systemd operation needs testing.
- Display60 tests: idempotent fps override, exact original-file restoration,
  preserving later edits even across reinstall, restart failure rollback,
  symlink refusal and ten simulated restarts. No real renderer restart occurred.
- Both optional Store tools build with upstream mgu-deploy's artifact builder.
- The source-only car package links against made-up SDK stubs, passes Node
  syntax checks, contains the logo/font/native worker/buildable worker source,
  retains executable permissions and has valid native UI JSON/XML. No BMW SDK,
  firmware, signing key or proprietary donor is in the package.
- Android compiles against API 35, DEXes for API 26+, aligns and verifies its
  v2/v3 signatures. Its update certificate matches 0.3.0. Branding, current
  release notes, QR decoder and JPEG encoder are included. Camera permission
  is requested only when the user opens the scanner.
- The actual car drawing code generated Connection, Display, Updates and QR
  previews under docs/images. Those are host previews, not car screenshots.

## Still requires the physical phone/car

Install/update acceptance; native helper execution on the BMW CPU/kernel;
Android capture/rotation/visibility; camera focus; actual QR interface selection,
firewall helper startup and lease cleanup; actual simultaneous Bluetooth or
Android Auto video/audio/networking; background OAP lifecycle; display arbitration;
CPU/thermal behaviour; native motion picture quality; projected/cluster fps;
all four phone edges; and BMW speed, traffic signs, gauges and warning visibility.

Earlier user reports: 0.2.0 displayed on the HUD; 0.3.0 audio worked but motion
was pixelated/laggy at roughly 5–10 received fps. No physical result for 0.4.0
has been reported. The new transport, helpers and UI must not be described as
car-verified until that test occurs. Compact reserves room; coexistence is
not certified by this host test.

Video remains stationary/Park-only. Shutdown/force-stop, locking, changed Wi-Fi,
expired capture and the ten-minute session limit still end sharing.

## Android artifact

- File: `downloads/Max_Mods_HUD_Mirror_Android_v0.4.0.apk`
- Bytes: 324270
- SHA-256: `2fb5503c090a37b337bbf94709cbe92153e7484ca9665eb0f0f347b2a3f3b22c`

## Reproduce

Run the Node checks in tests/test_car.js, test_vehicle_signals.js,
test_app_lifecycle.js, test_stream_decoder.js, test_qr_pairing.js,
test_connect.js, test_display60.js and test_package.js. Compile
PhoneServerHarness.java plus FrameStore, FrameEncoder, PairingServer and
TransportPolicy into build/phone-tests (ECJ or javac); run its store-test,
then test_phone_integration.js for Sharp and again with argument smooth.
QrScanHarness.java uses the vendored ZXing JAR and docs/images/pairing.png.
These checks require no BMW SDK or car access. Android build instructions
are in tools/build_android.py; native worker instructions are beside its source.

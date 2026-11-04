# Validation — car and Android prototype 0.2.0

Checked on 4 November 2026.

## Passed

- The real Java server streamed a synthetic 30-fps producer through HTTP
  to the real Node decoder. Host runs measured 26.5–30.5 received fps;
  after reducing decoder chunk overhead the latest run measured 30.5.
  This is not a benchmark of Android capture or the BMW projector.
- A static picture stayed connected beyond the former 1.5-second cutoff,
  using capture-worker liveness records without repeated picture transfers.
  Hiding a shared app required a new picture on resume. Stalling the
  capture worker closed the stream after its liveness deadline.
- Java encoding tests preserve all four corners of portrait and landscape
  captures, maintain aspect ratio, handle padded RGBA rows and produce the
  renderer's full-range YUV atlas. Zlib round-trip checks are byte-exact
  and cover incompressible input and maximum payload size.
- Stream tests cover arbitrary TCP fragmentation, bounded inflation,
  latest-frame delivery under load, hidden-content decode races, malformed
  records, decompression overflow and explicit capture-stop records.
- Compact layout keeps its picture above the lower HUD area. Tests cover
  switching to Full screen live, fitting alternate target dimensions and
  motion-packed upload traffic below the default renderer cap at 30 fps.
- Current version and all six release notes are bundled into the native
  car UI, with Previous/Next navigation and lines limited to 60 characters.
- Car 0.1.1 removes unsupported getters from the two gear declarations.
  All explicitly requested interfaces, fields, methods and events pass a
  read-only check against the publicly attached 2020 reference catalog in
  [upstream idrive7-apps issue #15](https://github.com/cauliflowermossgrape/idrive7-apps/issues/15).
  This is not the user's firmware catalog;
  no BMW catalog is included in this repository.
- Vehicle signal regression checks cover notification-only gear fields,
  both selector variants, a missing primary selector field, speed polling,
  rejection of stale Park readings, unavailable-interface diagnostics and
  shutdown while proxy setup is pending. A synthetic SDK is used.
- Android application compiled against Android platform API 35, converted
  to DEX for API 26+, packaged, zip-aligned and signed. Android's
  `apksigner verify --verbose` confirms APK v2 and v3 signatures.
- Twelve car-side tests cover unknown/invalid vehicle readings, speed,
  leaving Park, stale telemetry, private-address pairing, blocked starts,
  HUD target geometry, release on motion, late frames after Stop,
  renderer disconnect, wrong iDrive generation, incompatible phone versions,
  layout switching, live still pictures and connection failure.
- The real Java phone-side HTTP server was exercised by the real Node
  car-side receiver: pairing, token authentication, exact decoded atlas
  bytes, unchanged-screen heartbeats, route rejection and attempt limits passed.
- Java frame storage tests cover empty storage, invalid dimensions,
  sequence numbers, independent worker expiry, visibility and terminal clearing.
- The car app source package builds with the upstream Store linker
  against explicitly synthetic SDK stubs. Every app module resolves,
  syntax checks pass, the Store source descriptor matches the app, and
  vehicle attributes are read/subscribe only.
- The distributable source package contains no BMW SDK, installed
  firmware, VIN, vehicle key, signing key or generated app bundle.

## Needs hardware

- Installing Android 0.2.0 over 0.1.0, consent, capture scheduling,
  projection resize/visibility callbacks and rotation on Max's phone.
- Installing car 0.2.0, native video-layer acceptance, sustained incoming
  and physically projected fps on the real hotspot/head unit.
- Physical sharpness, full-screen edges, compact/full-screen placement,
  brightness, latency and preservation of BMW speed and traffic signs.
- On-device Stop behaviour, Park/movement interlock and normal HUD
  restoration after stop/removal.

The user's car rejected 0.1.0 during SOME/IP interface generation.
After 0.1.1, Max confirmed a working HUD test and brief phone mirroring.
He reported poor image quality, approximately 1 fps, cropped phone content
and intermittent `Phone frames stopped`. His photograph confirms that the
app still had live stationary/Park permission when that error appeared.
Version 0.2.0 addresses those software paths but has not yet been run on
his phone/car. No MGU firmware emulator or Android device/emulator was
available here. Retest stationary in Park, and photograph Compact mode
with the factory speed/limit display visible if it remains present.

## Commands used

```sh
node tests/test_car.js
node tests/test_vehicle_signals.js
node tests/test_package.js
node tests/test_stream_decoder.js
java -jar "$ECJ_JAR" -8 -proc:none -warn:none -d build/phone-tests \
  android/app/src/main/java/uk/maxmods/hudmirror/FrameStore.java \
  android/app/src/main/java/uk/maxmods/hudmirror/FrameEncoder.java \
  android/app/src/main/java/uk/maxmods/hudmirror/PairingServer.java \
  tests/PhoneServerHarness.java
java -cp build/phone-tests PhoneServerHarness store-test
node tests/test_phone_integration.js
python3 tools/build_android.py
```

See `README.md` for build prerequisites and the Store installation flow.

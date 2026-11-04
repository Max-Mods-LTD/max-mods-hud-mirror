# Validation — prototype 0.1.0

Checked on 4 November 2026.

## Passed

- Android application compiled against Android platform API 35, converted
  to DEX for API 26+, packaged, zip-aligned and signed. Android's
  `apksigner verify --verbose` confirms APK v2 and v3 signatures.
- Ten car-side tests cover unknown/invalid vehicle readings, speed,
  leaving Park, stale telemetry, private-address pairing, blocked starts,
  HUD target geometry, release on motion, late frames after Stop,
  renderer disconnect, wrong iDrive generation and malformed frames.
- The real Java phone-side HTTP server was exercised by the real Node
  car-side receiver: pairing, token authentication, exact RGBA bytes,
  duplicate-frame suppression, route rejection and attempt limits passed.
- Java frame storage tests cover empty storage, invalid dimensions,
  sequence numbers, screenshot expiry and clearing.
- The car app source package builds with the upstream Store linker
  against explicitly synthetic SDK stubs. Every app module resolves,
  syntax checks pass, the Store source descriptor matches the app, and
  vehicle attributes are read/subscribe only.
- The distributable source package contains no BMW SDK, installed
  firmware, VIN, vehicle key, signing key or generated app bundle.

## Needs hardware

- Android app installation, consent prompt and screen capture on the
  user's Samsung phone; Wi-Fi reachability on the BMW hotspot.
- Actual SDK behaviour and lifecycle on the car's firmware. Linking
  against made-up stubs checks packaging, not BMW API compatibility.
- Fresh speed/Park values and their units/enums on the user's M4.
- HUD slot acceptance, real rendered image, dimensions, positioning,
  brightness, aspect ratio, latency and coexistence with BMW HUD content.
- On-device Stop behaviour, Park/movement interlock and normal HUD
  restoration after stop/removal.

No MGU firmware emulator, Android device/emulator or physical car was
available for this build. Do not describe it as hardware-tested or a
finished customer product. First run the eight-second HUD test pattern
with the car stationary in Park.

## Commands used

```sh
node tests/test_car.js
node tests/test_package.js
java -jar "$ECJ_JAR" -8 -proc:none -warn:none -d build/phone-tests \
  android/app/src/main/java/uk/maxmods/hudmirror/FrameStore.java \
  android/app/src/main/java/uk/maxmods/hudmirror/PairingServer.java \
  tests/PhoneServerHarness.java
java -cp build/phone-tests PhoneServerHarness store-test
node tests/test_phone_integration.js
python3 tools/build_android.py
```

See `README.md` for build prerequisites and the Store installation flow.

# Current validation

Car and Android release: **0.8.0**. Android version code: **8**.

## Verified on the host

| Area | Evidence |
| --- | --- |
| BMW menu structure | Generated native RHMI list/button/label templates; unique IDs/names; ten preloaded pages; home limited to essential actions; Settings/Back navigation and failed/hung-request recovery |
| Full-screen geometry | Native layer covers physical 1920 × 720 from (0,0) in the test fixture; Compact returns to the embed box; unavailable foreground protection/layer mode refuses Full without changing the active layout |
| Whole phone picture | 10,000 source/canvas combinations retain every phone edge with outward even-YUV bounds; real JPEG decode accepts APP15; per-frame metadata survives rotation without stale bounds |
| iDrive video data | Exact Y/U/V plane offsets, three-slot MGVF publication, dimension-change rebind, missing-metadata fallback, no per-frame UI rebuild and private-file cleanup |
| Pairing | Real Java UDP responder and Node discovery match six-digit codes and saved keys; wrong code, invalid/replayed response and cancellation checks; authenticated HTTP pairing/resume and attempt limits |
| Stream | Real Java HTTP → Node JPEG decode sustained **30.0 fps** for Sharp and **60.0 fps** for Smooth in synthetic host-producer checks; unchanged images retain liveness without generating frames |
| Recovery and output | Car regressions cover Stop, late callbacks, hidden content, bounded retries, one destination, GPU fallback, startup cancellation and release before replacement |
| Vehicle readings | Event-only gear, alternate selector fields, fresh powertrain notifications, genuine subscription renewal and stale/invalid/moving-state rejection |
| Packaging | Real community Store reader, packer and dependency planner list all three components, install the required GPU Video tool first, and validate helper checksums/modes; SDK linking test uses synthetic stubs |
| Native helpers | Fragmented GPU protocol, FIFO ordering/cancellation, decoder lease/exit cleanup, optional Display60 settings restore/rollback and native JPEG decoding |

Host throughput is **not** measured car-display throughput. Synthetic HMI objects do not emulate BMW rendering, focus, projection or radio coexistence.

## Physical verification still needed

Check the actual BMW native menus/controller, true full-screen layer and Back/tap exit, Wi-Fi discovery on the car's hotspot, sound/video coexistence, display arbitration and measured HUD/cluster/iDrive frame rate. Factory speed/sign visibility in Compact also requires an on-car check. No stable 30/60 fps projector result is claimed.

Android consent, background capture, phone rotation, Wi-Fi changes and hardware-encoder compatibility need device testing. The APK is built against Android SDK 35; there is no attached Android device or BMW emulator in these checks.

## Reproduce

Run the Node checks sequentially, with Java HTTP harness checks sharing TCP/UDP 8476:

```sh
node tests/test_car.js
node tests/test_vehicle_signals.js
node tests/test_app_lifecycle.js
node tests/test_native_video.js
node tests/test_idrive_renderer.js
node tests/test_stream_decoder.js
node tests/test_phone_discovery.js
node tests/test_gpu_video_renderer.js
node tests/test_gpu_fifo.js
node tests/test_video_helper.js
node tests/test_display60.js
node tests/test_package.js
MGU_STORE_CHECKOUT=/path/to/mgu-store node tests/test_store_source.js
```

Compile the pure Java classes and harnesses with Java 8-compatible tools:

```sh
mkdir -p build/phone-tests
javac -source 8 -target 8 -d build/phone-tests \
  android/app/src/main/java/uk/maxmods/hudmirror/FrameStore.java \
  android/app/src/main/java/uk/maxmods/hudmirror/FrameEncoder.java \
  android/app/src/main/java/uk/maxmods/hudmirror/ContentBounds.java \
  android/app/src/main/java/uk/maxmods/hudmirror/PhoneDiscovery.java \
  android/app/src/main/java/uk/maxmods/hudmirror/TransportPolicy.java \
  android/app/src/main/java/uk/maxmods/hudmirror/RateMeter.java \
  android/app/src/main/java/uk/maxmods/hudmirror/PairingServer.java \
  android/app/src/main/java/uk/maxmods/hudmirror/AnnexB.java \
  tests/PhoneServerHarness.java tests/ContentBoundsHarness.java \
  tests/AvcStoreHarness.java tests/RateMeterHarness.java
java -cp build/phone-tests ContentBoundsHarness
java -cp build/phone-tests PhoneServerHarness store-test
java -cp build/phone-tests uk.maxmods.hudmirror.AvcStoreHarness
java -cp build/phone-tests uk.maxmods.hudmirror.RateMeterHarness
node tests/test_avc_integration.js
node tests/test_phone_integration.js
node tests/test_phone_integration.js smooth
```

ECJ can replace `javac` using `java -jar ecj.jar -8 -proc:none -warn:none` with the same output/sources. Avoid competing builds during short timing checks. See the [developer guide](README.md) for APK build requirements and the [protocol](PROTOCOL.md) for wire formats.

## Signed Android artifact

- File: `downloads/MaxModsHudMirror.apk`
- Size: 160437 bytes
- SHA-256: `ab4d820e525069ce7ed6b42be910fedc289fe6a004f5212ec3c005c6b7262642`
- Certificate SHA-256: `6ff47774fbd873410db97aba2e76d9d460dcf271db288845bc85376dce3d7903`
- Android APK Signature Scheme v2/v3 verified; the certificate matches existing installations.
- Packaged update notes and connection guide match the current source exactly.

# Development

The car app uses the head unit's existing SDK and genuine native RHMI menu widgets. Only the iDrive picture uses GPU rendering. Proprietary BMW SDKs, firmware, signing keys and donor bundles must stay outside this repository.

## Layout

| Path | Purpose |
| --- | --- |
| `android/app/src/main` | Android capture, encoder, local pairing/discovery and companion UI |
| `car/src` | Native BMW menu lifecycle, display control, pairing and video reception |
| `car/maxmods_hud_mirror@<version>` | Generated RHMI package resources |
| `tools/Video` | Adapter for the separately installed Waze hardware decoder |
| `tools/Display60` | Optional 60 Hz shared-renderer profile |
| `native/jpeg-decoder` | Bounded JPEG decoder source and build inputs |
| `tests` | Host regression and Java/Node transport checks |

## Car package

Edit `release_notes.json` with only the current release, including compatible phone version and concise user-facing changes. Run:

```sh
python tools/generate_car_ui.py
node tests/test_package.js
MGU_STORE_CHECKOUT=/path/to/mgu-store node tests/test_store_source.js
```

The Store's `build: unit` links the car's already-installed SDK. Keep the community `robertnisipeanu/mgu-store` and `robertnisipeanu/idrive-apps` sources available for the renderer/deployer dependencies. The app source is `Max-Mods-LTD/max-mods-hud-mirror`; its displayed source name is Max Mods iDrive Apps.

The home page contains essential actions only. Configuration, connection help, diagnostics, current notes, display tests and reset belong in Settings. Native page loads and navigation have independent deadlines/recovery; they never hold the vehicle-signal queue.

Full iDrive mode uses a foreground-protected `layer` at the physical screen rectangle. Compact uses the normal `embed` rectangle. Never disable the renderer's foreground/camera protection or grab the native BMW controller. Tap/Back hides the layer and returns to native menus.

## Android build

Requires Android SDK 35, Android build-tools 35.0.0, Java and ECJ. Increment both Android version fields for phone changes, then build with the original private update key:

```sh
ANDROID_SDK_ROOT=/path/to/sdk ECJ_JAR=/path/to/ecj.jar \
  HUD_MIRROR_KEYSTORE=/private/path/update-signing.p12 \
  python tools/build_android.py
```

The builder publishes `downloads/MaxModsHudMirror.apk` and its `.sha256` file. Keep this stable filename and download URL; keep only the current APK in the checkout. Preserve normal Git history. Existing installations require the same signing certificate.

Never publish the keystore, its password, build caches or proprietary firmware/SDK files. The current certificate fingerprint and test boundaries are in [validation](VALIDATION.md).

## Behaviour

Fresh, genuine zero-speed/Park readings gate output. Connection liveness, captured pixel age and vehicle-signal age are separate. Cached readings and timers must not manufacture permission. Each session owns one display only; switching/Stop/reset releases its output first.

Capture owns frame timing. Socket pacing limits bytes, not a second JPEG fps clock. Real capture/send/receive counters must count frames, never heartbeats. Keep queues bounded, cancel late callbacks and distinguish host throughput from actual hardware projection.

The phone app stores a private reconnect key; the car saves only that key and the last private Wi-Fi address. Six-digit pairing uses bounded local discovery. Manual pairing remains available without any discovery/firewall setup.

See [protocol](PROTOCOL.md) and [validation](VALIDATION.md) for implementation and test details.

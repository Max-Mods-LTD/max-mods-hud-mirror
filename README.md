# Max Mods iDrive Apps

A growing Max Mods app source for BMW iDrive 7. The current app is **HUD
Mirror 0.4.0**, with its Android companion and two optional display/connection
tools. The app keeps its existing ID so this installs over earlier versions.

The source contents and branding now use **MaxModsIdriveApps**. The GitHub
repository URL is still `Max-Mods-LTD/max-mods-hud-mirror`; renaming that URL
requires GitHub repository settings. Keep the existing Store source for this
update. A new URL is not live until that separate rename is completed.

## Install or update

1. In the car Store, keep the `robertnisipeanu/idrive-apps` and
   `robertnisipeanu/mgu-store` sources enabled. Refresh/check for updates,
   then install **Max Mods HUD Mirror 0.4.0**. The Store resolves its renderer
   dependencies. The current Max Mods source remains
   `Max-Mods-LTD/max-mods-hud-mirror`, branch **main**.
2. Install [Android companion 0.4.0](https://raw.githubusercontent.com/Max-Mods-LTD/max-mods-hud-mirror/main/downloads/Max_Mods_HUD_Mirror_Android_v0.4.0.apk)
   over the existing phone app. The signing key is unchanged. Stop the old
   sharing session; pair again after updating both apps.
3. For QR pairing, install **Max Mods Connect** from the same source.
   For the Smooth profile's 60 fps renderer clock, install **Max Mods
   Display60**. These are optional tools; manual pairing and the standard
   renderer clock remain available without them. Display60 restarts the
   shared renderer, so install it while parked with other display apps stopped.
4. Keep the vehicle stationary in **P**. Connect the phone to the BMW Wi-Fi
   network. Keep the working BMW Bluetooth or Android Auto sound route.
5. In the phone app, tap **Start sharing** and approve Android's screen
   capture prompt. In the car, select **Pair with QR**. On the phone, tap
   **Scan car QR**, grant camera access if asked and scan the car display.
   Camera images are decoded on the phone and are not uploaded or saved.
6. Select **Start mirror** in the car. **Display** chooses Head-up display
   or Instrument cluster, Compact or Full screen, and whether mirroring
   continues on other iDrive pages. Turn the phone landscape for a wider
   picture. The entire captured screen fits in either orientation.
7. Leave **Keep mirroring on other pages: On** to switch the main iDrive
   screen to Android Auto or another app. Vehicle checks continue. This
   supports hiding the app's page; shutting down or force-stopping an app
   ends its session. Switching phone Wi-Fi networks also ends sharing.

If QR cannot connect, show a fresh code and check that Max Mods Connect is
installed and both devices are on the same network. **Pair manually** still
accepts the phone's address/code. If the car has several private network
interfaces, the selected QR address may need a car-specific adjustment; report
that status rather than changing the car's network/firmware settings.

## Video and sound

| Phone profile | Fixed canvas | Target phone link rate | Car renderer |
| --- | --- | --- | --- |
| Sharp | 768 × 432 | 30 fps | Standard clock supports up to 30 fps |
| Smooth | 576 × 324 | 60 fps | Display60 requests a 60 fps clock |

JPEG encoding replaces the Java RGB/YUV conversion and raw-frame deflate
transport. Capture detail stays fixed at the selected profile; congestion
adapts pacing/frame rate instead of reducing the phone image to quarter
resolution and enlarging it. Android uses its native JPEG encoder; a small,
bounded, unprivileged native worker converts JPEGs to the renderer's YUV atlas.
Only one decode is active and one newest frame may wait. Old frames do not
form a playback queue. Short network failures retry at most three times,
with no cached picture shown after reconnect until a new live frame arrives.

**Received fps measures the phone link and decoder, not the projector.** A
host test reached about 58 fps in Smooth mode. Android capture, BMW Wi-Fi,
Bluetooth/Android Auto coexistence, the renderer's shared upload budget,
other display apps and the physical HUD/cluster determine the actual result.
Display60 changes only the supported renderer clock. It does not raise the
shared upload cap, change scene/slot IDs or take control of stock displays.
Native motion packing also has its own picture-quality limits. This build
has not been verified on the physical car.

Sound continues through the existing **BMW Bluetooth media or Android Auto**
route; the mirror stream carries video. The app requests no microphone,
audio focus or audio-routing control. Auto, Bluetooth priority and Quality
priority adjust JPEG quality/traffic pacing. This is not an embedded audio
stream or a claim that every wireless Android Auto network setup is compatible.

## Layout and controls

Both apps use the official Max Mods logo, a dark red/grey design and separate
Connection, Display and Updates pages. The native standard menu remains as
a fallback if the custom UI renderer is unavailable. Version and plain-language
release notes are visible inside both apps; history is in [CHANGELOG.md](CHANGELOG.md).

Compact reserves the lower HUD area for BMW information. Full screen uses
the available target rectangle while preserving the complete phone picture.
Cluster mode uses the renderer's central **map** target, leaving the full
panel/gauge target alone. Factory speed, traffic signs, warnings and display
arbitration still need checking on the car. The app does not recreate those
BMW graphics or override stock ownership.

## Session behaviour

- Live, fresh zero-speed and **P** signals are required. Motion, leaving
  Park, invalid/stale vehicle data, stopped capture or loss of the renderer
  clears the picture. Video remains Park-only.
- Stop is available in the car, phone app and Android notification. Sessions
  last ten minutes. Locking the phone or revoking capture ends sharing.
- The capture foreground service survives leaving the Android companion's
  screen. Android still requires consent for each session. Protected content
  may be blank.
- Still screens remain visible only while authenticated capture heartbeats
  confirm the projection is live. Hidden single-app capture clears output
  until a new image arrives. A timer never fabricates capture liveness.
- Pairing codes/tokens are ephemeral, screenshots stay in RAM, and no screen,
  QR camera frame, PIN or token is logged, saved or sent to an internet service.
  Local HTTP is authenticated but not encrypted; use a trusted BMW network.

Max Mods Connect grants only a temporary pairing-port lease: TCP 8477,
selected local interface and destination, source subnet restricted, at most
two minutes. Closing the QR page/socket or removing the helper removes its
rules. It does not carry phone screens, pairing keys or video. Display60
removes its own marked fps override on uninstall and preserves later
configuration edits. Both tools are removable through the Store.

## Source and validation

- [Feature coverage](FEATURES.md), [validation and limitations](VALIDATION.md),
  [wire protocol](STREAM_PROTOCOL.md), [third-party notices](THIRD_PARTY_NOTICES.md).
- `car/`: SDK-free OAP sources and generated native UI. The Store links the
  BMW SDK already on the car; no BMW SDK or firmware is distributed.
- `android/`: Java Android app, local QR decoder and dependency provenance.
- `native/jpeg-decoder/`: buildable JPEG worker source and licence.
- `tools/Display60/` and `tools/Connect/`: optional Store tool sources.
- `release_notes.json`: canonical release notes. Every app update regenerates
  the UI/version rows and changelog with `python3 tools/generate_car_ui.py`.

The earlier signed APKs remain in `downloads/` for rollback. Signing keys,
SDKs, firmware catalogs, build caches and proprietary donor apps are excluded.

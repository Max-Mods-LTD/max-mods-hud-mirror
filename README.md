# Max Mods HUD Mirror — car and Android prototype 0.3.0

Android screen mirroring to the **windscreen head-up display** on a BMW
with iDrive 7 and Robert Nisipeanu's `cluster-render` installed.

**Experimental build.** Max confirmed that 0.2.0 works, then reported severe
lag and eventual stopping after connecting BMW Bluetooth. Version 0.3.0
adds bandwidth adaptation, connection recovery and radio diagnostics.
The exact cause of that stop is unconfirmed; actual Bluetooth coexistence,
projected fps and factory speed/sign visibility still need a car check.

## What this version does

- Captures an Android screen or the single app selected in Android's
  permission dialog. Fits the entire image into a 768 × 432 canvas, with
  no crop or stretch, and follows portrait/landscape changes.
- Targets 30 fps over a continuous compressed video stream. This replaces
  400 × 240 screenshots and the old 250 ms polling delay. The car app
  reports received fps; Wi-Fi, the renderer's shared upload budget and
  projector behaviour determine the actual displayed rate.
- Keeps sound on **BMW Bluetooth media**. The mirror stream carries video.
  **Auto** detects an available Bluetooth output and uses a conservative
  profile on 2.4 GHz or an unknown band. Manual **Bluetooth priority** and
  **Quality priority** are available in the phone app. Detail or fps may
  reduce under load; Quality priority keeps capture detail. Quiet screens
  can refine back to full detail. No audio focus/routing is changed.
- Paces picture traffic, keeps a small socket send buffer and uses the
  latest frame rather than building a playback queue. A broken video link
  hides output and retries up to three times while live Park checks hold.
  Stop, leaving Park, invalid data and explicit capture-stop messages stop
  recovery. Session time limits continue through reconnects.
- Defaults to **Compact**, with the picture above a clear lower HUD area.
  **HUD size** toggles between Compact and Full screen while running.
  Factory speed and sign visibility must be checked on the car; this app
  does not recreate BMW's speed or traffic-sign graphics.
- Keeps a still screen visible while the phone confirms capture is live.
  A hidden shared app clears the image until a new picture arrives.
  A stopped capture or lost connection clears output.
- Includes the current version and a **What's new** section in the native
  car app. **Previous change / Next change** works with the touchscreen or
  iDrive controller. Release history is in [CHANGELOG.md](CHANGELOG.md).
- Draws on the existing renderer's `hud` target. It does not patch the
  CarPlay/Android Auto binaries or change firmware, slot IDs or scene IDs.
- Requires live zero-speed and Park readings. Leaving Park, movement,
  stale/invalid telemetry, a lost connection or leaving the car app's page
  stops output. Stop is also available on the phone's notification.
- Uses a local Wi-Fi pairing code and an ephemeral session token. The car
  opens the stream from the phone; no incoming car firewall port is opened.
- Keeps only the latest screenshot in RAM. No screenshot or pairing token
  is saved, uploaded to an internet service or written to a log.

There is no audio in the mirror stream, phone control, iPhone support or automatic
capture consent. Android requires approval for each capture session and
stops capture when the phone locks on recent versions. Protected content
can appear blank. Local Wi-Fi traffic is authenticated but not encrypted;
use a trusted BMW hotspot. A session expires after ten minutes.

## First test

**Upgrading:** update both apps to **0.3.0**. In the car Store open
**Settings > Check now** and install when **Available 0.3.0** appears.
Install the new APK over the existing phone app; the signing identity is
unchanged. Stop the old sharing session and pair again after updating.

1. Install the [Android companion app 0.3.0](https://raw.githubusercontent.com/Max-Mods-LTD/max-mods-hud-mirror/main/downloads/Max_Mods_HUD_Mirror_Android_v0.3.0.apk)
   on the Samsung phone. The old APK is retained only for rollback.
2. Keep Robert's `robertnisipeanu/idrive-apps` and
   `robertnisipeanu/mgu-store` sources enabled in the car's Store so
   dependencies can resolve. In **Settings > Add source**, enter
   `Max-Mods-LTD/max-mods-hud-mirror`, choose **main**, then install
   **Max Mods HUD Mirror**.
3. Keep the car stationary in **P**, turn its HUD on, then open **Max Mods
   HUD Mirror** in iDrive. Press **Test HUD (8 seconds)**. A border/cross
   should appear in the selected layout, then disappear. If it does not, stop
   here and report the exact status shown in the car app.
4. For sound, connect **BMW Bluetooth media first**, select the phone as
   the car's media source, verify audio, then return to HUD Mirror. Keep
   wireless Android Auto disconnected for this test if it launches on pairing.
   Connect the phone to the BMW's Wi-Fi hotspot. Open the Android app,
   press **Start sharing**, approve Android's capture prompt and read the
   address/code shown, e.g. `172.16.222.23/12345678`.
5. In the car app press **Pair phone** and enter that address/code. Press
   **Start mirror**. Leave the car app page open. Use the phone's Home
   button to show something else; landscape gives the wide panel in Max's
   reference. All four edges of the phone screen should remain visible.
   Use **HUD size** to compare Compact and Full screen. Check whether
   BMW's speed and limit sign remain visible in Compact.
6. Press **Stop mirror** in the car and **Stop sharing** on the phone when
   finished. Check that the original HUD content remains normal.

The car Store builds the car app with the BMW SDK already on the car;
no BMW SDK is included here.

## If the first test fails

- Bluetooth makes video lag: update both apps to 0.3.0, select **Bluetooth
  priority** on the phone and keep the car app open. Report the Wi-Fi band,
  received fps and exact last status. A Bluetooth output being available
  does not prove the car selected it for playback. If the BMW offers 5 GHz
  for that hotspot, it can avoid sharing 2.4 GHz with Bluetooth. See
  [Bluetooth SIG's coexistence explanation](https://www.bluetooth.com/learn-about-bluetooth/key-attributes/reliability/).
- `Sharing stopped: Wi-Fi connection changed`: Bluetooth pairing may have
  started another wireless connection such as Android Auto. Use ordinary
  Bluetooth media for the test and reconnect to the same BMW Wi-Fi first.
- `Video link lost - reconnecting`: the picture is hidden while the app
  opens a new stream. Sound remains under BMW/Android's control. If three
  retries fail, the final connection reason stays visible.
- Install fails at `generateSomeipInterfaces`: version 0.1.0 incorrectly
  requested getters on two notification-only gear fields. In the Store,
  open **Settings > Check now**, confirm **Available 0.3.0**, and retry.
- `Phone frames stopped` on 0.1.x: the old app confused a still picture
  with a dead capture. Update **both** apps to 0.3.0. The new health checks
  use capture-worker heartbeats independently of image changes.
- Low fps: read the **receiving ... fps** status while something on the
  phone is actually moving. A still picture legitimately produces no new
  pictures. Received fps does not prove the projector displayed every one.
- Compact hides BMW's speed/signs: report a HUD photograph. A reserved
  empty area alone does not prove the factory elements share that slot.
- `Waiting for live speed and Park signals`: the read-only vehicle
  interfaces have not supplied valid readings. It stays blocked. Send
  the exact message and the car's model/software version.
- `HUD: parked` / `HUD: waiting`: the stock HUD or another renderer client
  owns that slot. This prototype yields; it does not force a takeover.
- `HUD renderer did not respond`: check that the Store installed the
  declared `cluster-render` dependency.
- Picture absent but status says shown: report that distinction. Mapping
  a HUD slot does not prove the physical projector rendered the image.
- Phone pairing timeout: make sure the phone is on the BMW Wi-Fi and the
  displayed address is unchanged. Android's local-network access prompt,
  if shown by the device, must permit the connection.
- Small portrait picture: the prototype preserves the phone's aspect
  ratio. Rotate the phone to landscape; enlarging portrait content while
  keeping the complete tall screen necessarily leaves space at the sides.

## Remove

Stop sharing on the phone. In the car Store remove **Max Mods HUD Mirror**.
Its renderer dependency can stay installed for Waze and other apps.
Uninstall the Android companion app if no longer needed.

## Build and checks

The repository carries an SDK-free source package under `car/` and a
root `mgu-repo.json`. It can be published as a normal GitHub repository.
Do not publish `build/`, a signing key or a firmware-derived SDK bundle.

```sh
python3 tools/generate_car_ui.py       # needs Pillow; generated UI is already included
node tools/pack_car.js                 # SDK-free source package
node tests/test_car.js
node tests/test_vehicle_signals.js
node tests/test_package.js
node tests/test_stream_decoder.js
```

`tools/build_android.py` builds with Android SDK platform 35, build tools
35.0.0, a Java runtime and Eclipse ECJ 3.39.0. Set `ANDROID_SDK_ROOT` and
`ECJ_JAR`; optionally supply your own `HUD_MIRROR_KEYSTORE` and
`HUD_MIRROR_STORE_PASSWORD`. The resulting APK supports Android 8/API 26
and newer and targets API 35. It uses Android framework APIs only.

See `VALIDATION.md` for what was actually checked and what needs hardware.
See `STREAM_PROTOCOL.md` for the bounded video transport and capture states.
The initial test signing key is retained privately for follow-up builds.

## Credits

Built on Robert Nisipeanu and IterioDev's public MGU Store and cluster
renderer interfaces. Their code made the installation/rendering route
possible. Full source attribution and licences are in
`THIRD_PARTY_NOTICES.md`, `LICENSE` and `licenses/`.

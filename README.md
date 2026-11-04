# Max Mods HUD Mirror — car prototype 0.1.1

Android screen mirroring to the **windscreen head-up display** on a BMW
with iDrive 7 and Robert Nisipeanu's `cluster-render` installed.

**Experimental build. No successful hardware run yet.** The APK is
compiled and signed; protocol and stop conditions are tested on the host.
The first on-car check is an eight-second HUD test pattern. The renderer's
800 × 480 HUD canvas is its current default, whose exact size remains
unverified on this M4.

## What this version does

- Captures an Android screen or the single app selected in Android's
  permission dialog. Sends a 400 × 240 RGBA picture at up to 4 frames/s.
- Draws on the existing renderer's `hud` target. It does not patch the
  CarPlay/Android Auto binaries or change firmware, slot IDs or scene IDs.
- Requires live zero-speed and Park readings. Leaving Park, movement,
  stale/invalid telemetry, a lost connection or leaving the car app's page
  stops output. Stop is also available on the phone's notification.
- Uses a local Wi-Fi pairing code and an ephemeral session token. The car
  pulls frames from the phone; no incoming car firewall port is opened.
- Keeps only the latest screenshot in RAM. No screenshot or pairing token
  is saved, uploaded to an internet service or written to a log.

This is display-only: no audio, phone control, iPhone support or automatic
capture consent. Android requires approval for each capture session and
stops capture when the phone locks on recent versions. Protected content
can appear blank. Local Wi-Fi traffic is authenticated but not encrypted;
use a trusted BMW hotspot. A session expires after ten minutes.

## First test

1. Install the [Android companion app](https://github.com/Max-Mods-LTD/max-mods-hud-mirror/raw/refs/heads/main/downloads/Max_Mods_HUD_Mirror_Android_v0.1.0.apk)
   on the Samsung phone.
2. Keep Robert's `robertnisipeanu/idrive-apps` and
   `robertnisipeanu/mgu-store` sources enabled in the car's Store so
   dependencies can resolve. In **Settings > Add source**, enter
   `Max-Mods-LTD/max-mods-hud-mirror`, choose **main**, then install
   **Max Mods HUD Mirror**.
3. Keep the car stationary in **P**, turn its HUD on, then open **Max Mods
   HUD Mirror** in iDrive. Press **Test HUD (8 seconds)**. A border/cross
   should appear on the windscreen, then disappear. If it does not, stop
   here and report the exact status shown in the car app.
4. Connect the phone to the BMW's Wi-Fi hotspot. Open the Android app,
   press **Start sharing**, approve Android's capture prompt and read the
   address/code shown, e.g. `172.16.222.23/12345678`.
5. In the car app press **Pair phone** and enter that address/code. Press
   **Start mirror**. Leave the car app page open. Use the phone's Home
   button to show something else; landscape usually fills more of the HUD.
6. Press **Stop mirror** in the car and **Stop sharing** on the phone when
   finished. Check that the original HUD content remains normal.

The car Store builds the car app with the BMW SDK already on the car;
no BMW SDK is included here.

## If the first test fails

- Install fails at `generateSomeipInterfaces`: version 0.1.0 incorrectly
  requested getters on two notification-only gear fields. In the Store,
  open **Settings > Check now**, confirm **Available 0.1.1**, and retry.
  The Android companion stays at 0.1.0; it does not need reinstalling.
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
  ratio. Rotate the phone to landscape. Cropping/zoom is a later refinement.

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
```

`tools/build_android.py` builds with Android SDK platform 35, build tools
35.0.0, a Java runtime and Eclipse ECJ 3.39.0. Set `ANDROID_SDK_ROOT` and
`ECJ_JAR`; optionally supply your own `HUD_MIRROR_KEYSTORE` and
`HUD_MIRROR_STORE_PASSWORD`. The resulting APK supports Android 8/API 26
and newer and targets API 35. It uses Android framework APIs only.

See `VALIDATION.md` for what was actually checked and what needs hardware.
The initial test signing key is retained privately for follow-up builds.

## Credits

Built on Robert Nisipeanu and IterioDev's public MGU Store and cluster
renderer interfaces. Their code made the installation/rendering route
possible. Full source attribution and licences are in
`THIRD_PARTY_NOTICES.md`, `LICENSE` and `licenses/`.

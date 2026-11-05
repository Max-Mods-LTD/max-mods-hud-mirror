# Max Mods iDrive Apps

**HUD Mirror 0.5.1** for BMW iDrive 7, with Android companion 0.5.0.
This source can hold more Max Mods apps in future. Its catalog name is
**MaxModsIdriveApps**. Keep the working source URL
**Max-Mods-LTD/max-mods-hud-mirror**, branch **main**; the GitHub repository
itself has not been renamed.

## Update and connect

Version 0.5.1 fixes the Store error saying no source has maxmods-connect 0.2.0.
The three helpers were incorrectly given an app build flag, which made the
Store omit them. They are now listed and installed as tools. In the car, use
Store > Settings > Check now, then install HUD Mirror 0.5.1. Keep Android 0.5.0;
this hotfix does not require another phone download.

1. Keep the robertnisipeanu/idrive-apps and robertnisipeanu/mgu-store sources
   enabled. Refresh the car Store and update **Max Mods HUD Mirror to 0.5.1**.
   Its dependencies include **Max Mods Connect 0.2.0** and **Max Mods GPU Video
   0.1.0**. The latter is an adapter; it does not install or patch Waze.
2. Install [Android companion 0.5.0](https://raw.githubusercontent.com/Max-Mods-LTD/max-mods-hud-mirror/main/downloads/Max_Mods_HUD_Mirror_Android_v0.5.0.apk)
   over the existing app. It uses the same update-signing certificate.
   Stop the old sharing session and pair once after updating both apps.
3. Keep the car stationary in **P**, connect the phone to BMW Wi-Fi, and keep
   the working BMW Bluetooth or Android Auto audio connection.
4. On the phone, tap **Start sharing** and accept Android's capture prompt.
   In the car, choose **Pair with QR**. On the phone, choose **Scan car QR**.
   Pairing starts the selected display automatically. Manual pairing remains
   available if camera/network pairing fails.
5. After that first pairing, starting sharing on the linked phone automatically
   starts the selected car display. No second Start is needed. Android still
   requires capture consent on the phone for each new session. The car's Start
   button can start an already-consented phone session; it cannot remotely
   approve Android's permission prompt.
6. In **Display**, open the BMW selection menu and choose **HUD**, **Instrument
   cluster**, or **iDrive screen**. Only one destination runs at a time.
   Choose **Compact** or **Full screen** in its separate BMW menu. Choices
   survive reopening the app. The whole phone picture keeps its aspect ratio.
7. Leave **Keep mirroring on other pages: On** to use Android Auto/maps on the
   main screen while HUD or cluster mirroring continues. An iDrive-screen
   picture occupies that app page and is hidden when another page covers it.

**Force close** releases this app's output and exits it. Reopen the app to
reconnect to the still-sharing linked phone. It does not reset the head unit
or stop the car's existing Waze, Android Auto or audio services.

## Video paths and frame rate

| Selection | Phone transport | Car path |
| --- | --- | --- |
| Automatic, HUD / cluster, compatible Waze decoder installed | Hardware AVC, 1280 × 720 capture with whole-screen fit | Separate Waze hardware-decoder process, then the shared cluster renderer |
| JPEG compatibility, unavailable/failed GPU decoder | Native JPEG, selected profile canvas | Bounded native JPEG worker, then cluster renderer |
| iDrive screen | Native JPEG, selected profile canvas | Native decode to a RAM-only I420 surface, GPU-drawn by mgu-render |

The hardware adapter uses the already-installed Waze-on-cluster executable.
It starts a separate process with its own FIFO, control socket and settings.
AVB, UDP and alternate CarPlay input are disabled in that process. It never
runs Waze's patch installer or changes the existing Waze/Android Auto setup.
Missing/incompatible native code, failed startup, a stalled writer or decoder
error falls back to JPEG. **The hardware path has not been tested on the car.**

| Phone profile | Renderer canvas | Requested capture/link rate |
| --- | --- | --- |
| Sharp | 768 × 432 | Up to 30 fps |
| Smooth | 576 × 324 | Up to 60 fps |

The AVC capture retains the 1280 × 720 source; the hardware decoder scales it
to the selected renderer canvas. Hardware AVC requires Android 12L or later for uniform whole-screen fit; older
phones use JPEG. Hardware encoder support may limit capture to 30 fps. For HUD/cluster, the optional **Display60** tool requests the shared
renderer's 60 fps clock. It restarts that renderer when installed; install it
while parked with other display apps stopped. A 60 Hz clock alone cannot fix
a slow encoder, decoder or Wi-Fi link.

The current host JPEG integration received **29.0 fps** and **57.5 fps** from
synthetic 30/60-fps producers. **Received fps is not projector fps.** Phone
capture, radio coexistence, native motion packing, renderer budget, display
ownership and physical hardware still determine quality and speed. No stable
30/60-fps car result is claimed. Landscape uses more of the available width;
portrait remains fully visible with side space.

Sound uses the existing **BMW Bluetooth media / Android Auto** route. The
mirror transport carries video and takes no audio focus, microphone access or
routing control. Coexistence modes adjust JPEG traffic; AVC lowers link load.
Wireless Android Auto compatibility still depends on the car's network setup.

## Interface and display behaviour

The iDrive dashboard sends GPU drawing commands for text/buttons instead of
a full-screen software bitmap. It scales to the actual app area. The phone
keeps its charcoal background and has a transparent **MAX / MODS** stacked
logo, larger text, pressed feedback and a green active Start button.

Rotary control has native focus/action buttons and the FrontCCU fallback used
by the Store. Display/layout/video options use BMW's own menu pages. Test
display uses the selected destination for eight seconds. Current release
notes are visible in both apps, with Previous/Next on the car.

Display > Video and background options > Connection diagnostics shows the
active video path, received/target fps, signal ages and last issue. Reconnect
linked phone retries without entering its code. Connecting has a Cancel
start action; codec compatibility changes apply immediately.

Compact reserves the lower HUD area; Full uses the available target rectangle.
Cluster uses the central map target and requests its slot like Waze. It does
not select the full gauge panel. Factory speed, signs, gauges, warnings and
display arbitration still require a physical check.

## Sessions and privacy

- Fresh zero-speed and **P** readings remain required. Powertrain CRC events
  and genuine subscription renewals address quiet-selector expiry. Missing,
  stale or invalid readings still clear output; no Park override was added.
- Leaving the companion's screen keeps its foreground capture service running.
  Locking/force-stopping the phone, changing its Wi-Fi address, capture expiry
  and the ten-minute session limit end sharing.
- Stop in the car stays stopped for the same phone capture session. A newly
  consented phone sharing session can start automatically. Hidden single-app
  captures clear output; share the whole screen for normal background use.
- The linked phone address and a long-lived reconnect credential are saved in
  private app storage: mode 0600 on the car, Android private preferences with
  backup disabled on the phone. **Forget linked car** rotates/removes the
  phone credential; the car also has **Forget paired phone**.
- Session bearer tokens/PINs are ephemeral. Screens/video remain in RAM/FIFOs;
  screen pixels, QR camera frames, credentials and PINs are not logged or sent
  to an internet service. Local HTTP is authenticated, without encryption:
  use a trusted BMW Wi-Fi network.
- If the phone's address changes, pair again. Automatic reconnect does not
  scan arbitrary networks.

Connect opens TCP 8477 only while a QR is shown, for at most two minutes, on
validated local interfaces/destinations and their source subnets. It removes
only its own marked rules. It receives no PIN, QR key or video. GPU Video's
lease kills only its own decoder process on close/timeout and removes its RAM
files. Display60 restores its own settings on uninstall.

## Source and validation

See [feature coverage](FEATURES.md), [validation](VALIDATION.md),
[protocol](STREAM_PROTOCOL.md), [changelog](CHANGELOG.md) and
[third-party notices](THIRD_PARTY_NOTICES.md). The preview images under
docs/images are host renderings, not car screenshots.

The Store links the car's existing BMW SDK. No BMW SDK, firmware, signing key
or proprietary donor is distributed. Earlier signed APKs remain in downloads
for rollback. Every app update regenerates its visible release notes from
release_notes.json.

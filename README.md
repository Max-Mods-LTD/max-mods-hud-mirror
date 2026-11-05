# Max Mods iDrive Apps

**HUD Mirror 0.6.0** for BMW iDrive 7, with Android companion 0.6.0.
This source can hold more Max Mods apps in future. Its catalog name is
**MaxModsIdriveApps**. Keep the working source URL
**Max-Mods-LTD/max-mods-hud-mirror**, branch **main**; the GitHub repository
itself has not been renamed.

## Update and connect

Version 0.6.0 adapts hardware-video bitrate to audio use and measured link
congestion, caps frames before encoding and avoids unnecessary 720p pixels
when the selected canvas is supported. It removes QR pairing and adds a
connection guide to both apps. **Update both apps.** The Bluetooth/audio
changes have passed host checks; their effect still needs a car test.

1. Keep the robertnisipeanu/idrive-apps and robertnisipeanu/mgu-store sources
   enabled. Use **Store > Settings > Check now** and update **Max Mods HUD
   Mirror to 0.6.0**. Its GPU Video 0.1.0 dependency is an adapter; it does not
   install or patch Waze. Max Mods Connect is no longer required or offered.
2. Install [Android companion 0.6.0](https://raw.githubusercontent.com/Max-Mods-LTD/max-mods-hud-mirror/main/downloads/Max_Mods_HUD_Mirror_Android_v0.6.0.apk)
   over the existing app. It uses the same update-signing certificate.
   Stop the old sharing session and pair once after updating both apps.
3. Keep the car stationary in **P**, connect the phone to BMW Wi-Fi, and keep
   the working BMW Bluetooth or Android Auto audio connection.
4. On the phone, tap **Start sharing** and accept Android's capture prompt.
   In the car, choose **Pair phone** and enter the phone's address/code exactly
   as shown, including the slash. Pairing starts the selected display
   automatically. There is no QR scanner or camera permission.
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

### Connection guide

Open **Setup guide** on the car's Connect page, or **Connection guide** on the
phone. The phone guide includes Wi-Fi and Bluetooth settings shortcuts.
Both guides use the same steps from connection_guide.json:

- In iDrive, open **COM / Communication > Mobile devices**, move the controller
  right and open **Settings** to enable Wi-Fi. Menu labels vary by software.
- Under **New device > Internet, apps**, find the BMW network name/password
  if equipped. Some versions show these in Mobile devices > Settings.
- On Samsung, use **Settings > Connections > Wi-Fi** to join that network.
  Choose **Stay connected** if warned about no Internet. Keep the existing
  BMW Wi-Fi link if Android Auto already uses it.
- Connect BMW Bluetooth media and select it under MEDIA / Radio, or keep
  the working Android Auto sound route. Wi-Fi carries the mirror picture.
- Start sharing, approve the entire screen and pair once in the car. The
  pairing code is separate from the Wi-Fi password. After a Wi-Fi/IP change,
  restart sharing and pair the new address.

The mirror uses local Wi-Fi. Internet/data service for online videos is
separate. If sound slows the picture, select **Phone > Display > Sound
coexistence > Audio priority**. Use 5 GHz only if the factory BMW menu offers
it; the app does not change channels or audio routes. BMW references are
listed in connection_guide.json.

## Video paths and frame rate

| Selection | Phone transport | Car path |
| --- | --- | --- |
| Automatic, HUD / cluster, compatible Waze decoder installed | Hardware AVC, selected canvas when supported; 1280 × 720 fallback, whole-screen fit | Separate Waze hardware-decoder process, then the shared cluster renderer |
| JPEG compatibility, unavailable/failed GPU decoder | Native JPEG, selected profile canvas | Bounded native JPEG worker, then cluster renderer |
| iDrive screen | Native JPEG, selected profile canvas | Native decode to a RAM-only I420 surface, GPU-drawn by mgu-render |

The hardware adapter uses the already-installed Waze-on-cluster executable.
It starts a separate process with its own FIFO, control socket and settings.
AVB, UDP and alternate CarPlay input are disabled in that process. It never
runs Waze's patch installer or changes the existing Waze/Android Auto setup.
Missing/incompatible native code, failed startup, a stalled writer or decoder
error falls back to JPEG. Hardware path compatibility and timing depend on
the installed decoder and the car.

| Phone profile | Renderer canvas | Requested capture/link rate |
| --- | --- | --- |
| Sharp | 768 × 432 | Up to 30 fps |
| Smooth | 576 × 324 | Up to 60 fps |

AVC first tries the selected canvas and falls back to 1280 × 720 if needed.
Android fits the whole phone into it; the decoder scales to the renderer
canvas. Hardware AVC requires Android 12L or later for uniform whole-screen
fit; older phones use JPEG. An encoder input cap enforces the selected maximum
before compression. Hardware support may limit capture to 30 fps.
For HUD/cluster, the optional **Display60** tool requests the shared
renderer's 60 fps clock. It restarts that renderer when installed; install it
while parked with other display apps stopped. A 60 Hz clock alone cannot fix
a slow encoder, decoder or Wi-Fi link.

Host JPEG integration checks use synthetic 30/60-fps producers; results are
recorded in VALIDATION.md. **Received fps is not projector fps.** Phone
capture, radio coexistence, native motion packing, renderer budget, display
ownership and physical hardware still determine quality and speed. No stable
30/60-fps car result is claimed. Landscape uses more of the available width;
portrait remains fully visible with side space.

Sound uses the existing **BMW Bluetooth media / Android Auto** route. The
mirror transport carries video and takes no audio focus, microphone access or
routing control. Auto limits AVC to 1.2 Mbps with audio on a shared/unknown
Wi-Fi band, 1.8 Mbps with audio on 5 GHz, or 2.4 Mbps without audio. Manual
Audio priority uses the 1.2 Mbps ceiling; Quality allows 3 Mbps. Measured
congestion lowers the target to a 0.6 Mbps floor, then recovers gradually.
These are requested encoder rates, not measured output. Backlogs older than
300 ms skip references and request an IDR. JPEG reduces compressed quality
before lowering fps and keeps the canvas dimensions fixed. Wireless Android
Auto and audio performance still require a physical test.

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
  screen pixels, credentials and PINs are not logged or sent
  to an internet service. Local HTTP is authenticated, without encryption:
  use a trusted BMW Wi-Fi network.
- If the phone's address changes, pair again. Automatic reconnect does not
  scan arbitrary networks.

Manual pairing pulls video from phone TCP 8476 and needs no inbound car
pairing listener or temporary firewall rule. The old Connect tool's source
is retained for historical uninstall/rollback; this version never contacts
it. GPU Video's lease kills only its own decoder on close/timeout and removes
its RAM files. Display60 restores its own settings on uninstall.

## Source and validation

See [feature coverage](FEATURES.md), [validation](VALIDATION.md),
[protocol](STREAM_PROTOCOL.md), [changelog](CHANGELOG.md) and
[third-party notices](THIRD_PARTY_NOTICES.md). The preview images under
docs/images are host renderings, not car screenshots.

The Store links the car's existing BMW SDK. No BMW SDK, firmware, signing key
or proprietary donor is distributed. Earlier signed APKs remain in downloads
for rollback. Every app update regenerates its visible release notes from
release_notes.json.

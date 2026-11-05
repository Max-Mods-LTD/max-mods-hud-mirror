<p align="center">
  <img src="assets/max-mods-logo-stacked.png" alt="Max Mods" width="250">
</p>

# Max Mods iDrive Apps

**HUD Mirror · Your Android phone on your BMW display.**

### [Download the Android app](https://raw.githubusercontent.com/Max-Mods-LTD/max-mods-hud-mirror/main/downloads/MaxModsHudMirror.apk)

[Visit Max Mods](https://www.max-mods.co.uk/) · [Install in the car](#install-in-the-car) · [Connect your phone](#connect-your-phone)

Mirror your phone to the **head-up display, instrument cluster or main iDrive screen**. Choose one screen, keep the whole phone picture visible, and control the app through BMW's own menus and iDrive controller.

## Made to fit your BMW

- **Actual BMW menus and buttons.** Native layouts, fonts, selection highlights and rotary-controller focus.
- **A clean home page.** Start/Stop, Pair when needed, View picture and Settings. The extra controls are in Settings.
- **Six-digit pairing.** Enter the code from your phone; the car finds it on BMW Wi-Fi and remembers the link. Manual pairing is available if discovery is blocked.
- **Compact or Full display.** Compact leaves room for BMW information. Full uses the entire main screen area while preserving the whole phone picture and its proportions.
- **Your existing sound connection.** Keep BMW Bluetooth media or your working Android Auto connection for audio.
- **Background sharing.** Use other phone apps while sharing the entire screen. HUD/cluster mirroring can continue when you switch car apps.
- **A built-in setup guide.** Connection help, display options, diagnostics, current update notes and app reset are together in Settings.

Turn your phone landscape for the largest movie picture. Different phone/car screen shapes require black bars to keep every phone pixel visible. Android-protected video may appear black.

## Install in the car

Requires **BMW iDrive 7 / MGU with the community Store already installed**, plus an Android phone running Android 8 or newer. Use the mirror while stationary in **P**.

1. In the car's Store, add this source:

   ```text
   Max-Mods-LTD/max-mods-hud-mirror
   ```

2. Refresh the Store and install **Max Mods HUD Mirror**. Keep the standard community sources enabled so the Store can find its required renderer tools.
3. Install the [Android app](https://raw.githubusercontent.com/Max-Mods-LTD/max-mods-hud-mirror/main/downloads/MaxModsHudMirror.apk) on your phone. Allow installation from your browser when Android asks. It updates the existing Max Mods app.

The source appears as **Max Mods iDrive Apps**, ready for more Max Mods apps. New to the community Store? Start with the [Store project's installation guide](https://github.com/robertnisipeanu/mgu-store).

## Connect your phone

1. **Switch on BMW Wi-Fi.** In iDrive, open **COM / Communication → Mobile devices**, move the controller right, then open **Settings → Wi-Fi**. Labels vary by BMW software. The network name/password may appear under **New device → Internet, apps** if equipped.
2. **Join that network on your phone.** Choose **Stay connected** if Android warns that it has no Internet. If Android Auto already connects you to BMW Wi-Fi, keep that connection. Keep Bluetooth media or Android Auto connected for sound.
3. **Start sharing on the phone.** Open HUD Mirror, tap **Start sharing** and approve sharing the **entire screen**. The phone shows a six-digit code.
4. **Pair once in the car.** Open HUD Mirror → **Pair phone** and enter only those six digits. Once linked, starting sharing on the phone starts the selected car display automatically.
5. **Choose your display.** Open **Settings → Display settings → Destination** and choose HUD, instrument cluster or iDrive screen. Under **Picture size**, choose Compact or Full display. Only one destination runs at a time.

**Phone not found?** Check both devices are on BMW Wi-Fi. Some networks block discovery: on the phone choose **Manual pairing address**, then in the car choose **Settings → Manual pairing** and enter the displayed address/code. A remembered phone can reconnect after an address change when discovery is available.

**Back from the picture:** press BMW Back or tap the picture. Use **View iDrive picture** to return. **Settings → Force close / reset app** closes the app so you can reopen it after a glitch.

**Picture slows when sound plays:** try **Phone → Display → Sound coexistence → Audio priority**. For a faster link, choose **Smooth** in Video quality; it targets 60 fps at 576 × 324. **Sharp** targets 30 fps at 768 × 432. These are targets; actual performance depends on the phone, Wi-Fi and car. Full-screen presentation and automatic discovery need verification on your head unit.

Android requires capture permission for each sharing session. Locking or force-stopping the phone ends sharing; sessions currently last up to ten minutes. Online videos need a separate working Internet connection.

## Max Mods

OEM-style upgrades, CarPlay and Android Auto retrofits, ambient lighting and vehicle customisation.

**[Explore Max Mods and enquire about installation](https://www.max-mods.co.uk/)**

Independent Max Mods software, built on community work by Robert Nisipeanu, IterioDev and other contributors. BMW supplies the native menu widgets on the head unit; this is not an official BMW product.

[Developer guide](docs/development/README.md) · [Protocol](docs/development/PROTOCOL.md) · [Validation](docs/development/VALIDATION.md) · [Credits and licences](THIRD_PARTY_NOTICES.md)

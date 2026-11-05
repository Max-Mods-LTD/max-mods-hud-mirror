# Project instructions

- Every app update must include plain-language release notes visible inside
  the car's HUD Mirror app. This is an explicit requirement from Max.
- Replace the current entry in `release_notes.json`, increment the car version,
  and record the compatible phone version. Run `tools/generate_car_ui.py` to
  regenerate the native UI version/What's new rows. Keep only current notes
  and the current signed APK in the checkout; do not rewrite Git history.
- Keep README a concise Max Mods product showcase, with the stable Android
  download link near the top. Put technical references under docs/development.
- If the phone changes, increment Android's versionCode/versionName, rebuild
  and sign with the existing private update key, and publish the new APK.
  Never commit a signing key, firmware catalog, proprietary SDK or build cache.
- Keep the complete phone picture in both layouts; never crop or stretch it.
  Compact is the default and reserves the lower HUD area for BMW's displays.
  Do not claim factory speed/sign coexistence until checked on the car.
- Keep live zero-speed/Park checks and fail-closed cleanup. Capture liveness
  and connection health are distinct from whether screen pixels changed.
- Use BMW's native RHMI templates/widgets for car menus and controller focus.
  Only the iDrive picture uses a GPU embed or foreground-gated full-screen layer; do not paint an imitation OEM UI.
  Menu requests must have recovery and must not block the vehicle-signal queue.
- Capture owns the frame-rate clock. Transport may pace bytes; avoid a second
  JPEG fps timer. Measured capture/sent/received rates must come from real frames.
- Validate changes with the relevant car, vehicle-signal, package, stream
  and Java/Node integration checks. State the distinction between host test
  results, received fps and actual projector performance.

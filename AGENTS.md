# Project instructions

- Every app update must include plain-language release notes visible inside
  the car's HUD Mirror app. This is an explicit requirement from Max.
- Add a new entry to `release_notes.json`, increment the car version, and
  record the compatible phone version. Run `tools/generate_car_ui.py` to
  regenerate the native UI's version/What's new rows and `CHANGELOG.md`.
- If the phone changes, increment Android's versionCode/versionName, rebuild
  and sign with the existing private update key, and publish the new APK.
  Never commit a signing key, firmware catalog, proprietary SDK or build cache.
- Keep the complete phone picture in both layouts; never crop or stretch it.
  Compact is the default and reserves the lower HUD area for BMW's displays.
  Do not claim factory speed/sign coexistence until checked on the car.
- Keep live zero-speed/Park checks and fail-closed cleanup. Capture liveness
  and connection health are distinct from whether screen pixels changed.
- Validate changes with the relevant car, vehicle-signal, package, stream
  and Java/Node integration checks. State the distinction between host test
  results, received fps and actual projector performance.

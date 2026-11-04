# Release notes

## Car 0.3.0 / Android 0.3.0

- Sound uses BMW Bluetooth media; video stays on Wi-Fi.
- Auto reduces video load on a congested Bluetooth/Wi-Fi link, targeting up to 30 fps.
- Phone video modes: Auto, Bluetooth priority and Quality priority. Detail/fps may adapt.
- Phone shows Wi-Fi band and Bluetooth output availability without changing audio routing.
- Brief video link failures retry up to three times. Stop and live Park checks still apply.
- Connect Bluetooth media first, then open HUD Mirror. Update both apps to 0.3.0.

## Car 0.2.0 / Android 0.2.0

- Continuous stream targeting 30 fps; the app shows the received frame rate.
- Sharper 768 x 432 picture; the whole phone screen fits without cropping.
- Portrait and landscape sizing follows phone rotation.
- HUD size switches between Compact and Full screen. Compact leaves space below for BMW.
- Fixed false stops on still screens; capture and connection health are checked separately.
- Update both apps to 0.2.0. Actual HUD fps and BMW speed/sign visibility need a car check.

## Car 0.1.1 / Android 0.1.0

- Fixed installation requests for unsupported BMW gear getters.
- Subscribed to both Park-signal variants and displayed vehicle setup errors.

## Car 0.1.0 / Android 0.1.0

- Initial parked HUD test and Android screen-mirroring prototype.
- Local pairing, Stop controls and live stationary/Park checks.

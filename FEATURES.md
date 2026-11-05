# Requested feature coverage — 0.4.0

| Request | Delivered behaviour | Remaining check |
| --- | --- | --- |
| Less pixelation | Native JPEG encoding and decoding; fixed capture resolution instead of quarter-size adaptive capture | Compare moving video on the car; native renderer motion packing still limits detail |
| 30 / 60 fps | Sharp 30 and Smooth 60 targets; optional reversible Display60 renderer clock | Physical projector/cluster rate and RF performance |
| Bluetooth / Android Auto sound | Existing working audio route remains in charge; lower video bandwidth and selectable coexistence modes | Actual simultaneous wireless playback |
| Full phone image | Aspect-fit capture, letterbox, portrait/landscape resize; no crop/stretch | Physical edges/rotation |
| Smaller HUD / speed and signs | Compact by default, lower HUD area reserved; Full screen toggle | Verify BMW speed, signs and warnings remain visible |
| HUD or cluster | Select HUD or the cluster's central map target; never the full gauge panel | Cluster ownership and actual rendering |
| Leave app page / use Android Auto | Background mirroring option on by default; Android capture foreground service; vehicle guards still run | Real iDrive lifecycle and AA network routing; force-stop still ends capture |
| No manual IP typing | Car QR and local phone scanner; optional temporary QR network helper; manual fallback | Camera and BMW network on the device |
| Proper Max Mods UI/logo | Official wordmark, dark red/grey dashboards, Connection/Display/Updates pages, standard native fallback | Touch/controller and physical screen scaling |
| Changes visible in app | Current version and all current release notes in both apps, car Previous/Next | Physical HMI presentation |
| Generic source name | MaxModsIdriveApps catalog/README branding and multi-component source | GitHub URL rename needs repository settings; current URL kept functional |
| Video while driving / disclaimer checkbox | Video remains Park-only; no waiver checkbox or moving-video override | Not included |

Host tests exercise the implementations. They do not certify physical car or
phone operation. See VALIDATION.md for exactly what passed and what needs testing.

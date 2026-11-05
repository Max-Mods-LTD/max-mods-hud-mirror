# Requested feature coverage — 0.5.0

| Request | Implementation | Physical check / limit |
| --- | --- | --- |
| Less lag / pixelation; use Waze GPU path | Automatic hardware AVC with a separate installed Waze decoder; no level rounding; JPEG fallback | New hardware path untested; shared packing/budget still apply |
| 30 / 60 fps | Sharp/Smooth targets, hardware encoder negotiation, optional Display60 clock | Host link 29.0/57.5 fps; no measured car fps |
| BMW Bluetooth / Android Auto audio | Existing audio route, low-bandwidth AVC or JPEG coexistence modes | Actual wireless audio/network coexistence |
| Complete phone / smaller or Full picture | Aspect fit in both orientations; Compact / Full; saved layout | Check all edges and BMW speed/sign visibility |
| HUD, cluster or iDrive | One renderer instance; release old output before new output; central I420/GPU video surface | Display ownership/physical presentation |
| Cluster failed | Map slot contention now follows Waze | Check actual cluster slot and stock warnings |
| Keep mirroring while on other pages / Android Auto | Background option and phone foreground service | Main-screen mirroring itself needs its app page; force-stop ends capture |
| Press Start once | Trusted reconnect; phone Start auto-starts selected car display; Stop suppresses same-session restart | First pairing and Android consent still required; changed IP needs re-pair |
| QR failed | Same-subnet address selection, up to four car addresses, longer helper startup, clear errors; manual fallback | Real camera, firewall and BMW network |
| Vehicle signals stale | Changing powertrain CRC subscription plus real quiet-field subscription renewal | Still fails closed if real speed/P events stop |
| Slow iDrive UI / fill display | Native GPU text/buttons, actual embed area sizing, no full-screen bitmap updates | Physical compositor/performance |
| iDrive controller | Renderer CCU, native focus/action proxies, FrontCCU fallback | Actual rotary/press handling |
| Bigger text and stacked logo | Transparent MAX over MODS logo, larger type in both apps | Phone retains its charcoal background per the corrected request |
| Selected button feedback | Press color and green sharing-active phone button | Device appearance |
| OEM dropdown box | Separate destination box and BMW-native display/layout/video menus | Physical HMI presentation |
| Force close / Test display | Own-process reset; eight-second test on selected screen | Actual renderer release and projected pattern |
| Extra reliability tools | OEM diagnostics, signal ages, last error, reconnect, cancellable Start and immediate codec switching | Host workflow checked |
| Update notes inside app | Version and all current notes in both apps | Host packaging checked |
| Generic source name | MaxModsIdriveApps catalog, multi-component source | GitHub repository URL rename remains pending |
| Driving / waiver checkbox | Park checks retained; no moving-video override | Not included |

These implementations passed the host checks in VALIDATION.md. They are not
a claim that the reported car faults have been physically verified as fixed.

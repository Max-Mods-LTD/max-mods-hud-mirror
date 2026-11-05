# Requested feature coverage — 0.7.0

| Request | Implementation | Physical check / limit |
| --- | --- | --- |
| Missing Connect / helpers blocked update | Connect removed with QR; actual Store parser lists app, GPU Video and Display60 with valid tool metadata | Current upgrade still needs car acceptance |
| Less lag / pixelation; use Waze GPU path | Automatic hardware AVC with a separate installed Waze decoder; no level rounding; JPEG fallback | New hardware path untested; shared packing/budget still apply |
| 30 / 60 fps | Sharp/Smooth targets, hardware encoder negotiation, optional Display60 clock | Host link 29.5/57.5 fps; no measured car fps |
| BMW Bluetooth / Android Auto audio slowdown | Live AVC bitrate control, audio-aware ceilings, capped encoder input, selected-canvas capture and stale backlog discard; JPEG quality before fps | Actual wireless audio/network coexistence; no promised 60 fps |
| Complete phone / smaller or Full picture | Aspect fit in both orientations; Compact / Full; saved layout | Check all edges and BMW speed/sign visibility |
| HUD, cluster or iDrive | One renderer instance; release old output before new output; central I420/GPU video surface | Display ownership/physical presentation |
| Cluster failed | Map slot contention now follows Waze | Check actual cluster slot and stock warnings |
| Keep mirroring while on other pages / Android Auto | Background option and phone foreground service | Main-screen mirroring itself needs its app page; force-stop ends capture |
| Press Start once | Trusted reconnect; phone Start auto-starts selected car display; Stop suppresses same-session restart | First pairing and Android consent still required; changed IP needs re-pair |
| Remove broken QR | Scanner, camera permission, QR generator and current Connect dependency removed; remembered manual pairing | Enter address/code once; changed IP needs pairing |
| Explain connections in app | Shared seven-step BMW Wi-Fi / password / Samsung / audio / pairing guide, native car pages and phone settings shortcuts | BMW labels vary by software/equipment |
| Vehicle signals stale | Changing powertrain CRC subscription plus real quiet-field subscription renewal | Still fails closed if real speed/P events stop |
| OEM BMW UI / black settings screen | Actual BMW native list/button/label widgets, preloaded pages, bounded navigation recovery and independent vehicle-signal queue; video-only embed | Exact physical presentation and failed-navigation recovery |
| iDrive controller | BMW owns native rotary focus, selection and Back; no custom controller grab | Physical rotary/press handling |
| Bigger text and stacked logo | Transparent MAX over MODS logo, larger type in both apps | Phone retains its charcoal background per the corrected request |
| Selected button feedback | Press color and green sharing-active phone button | Device appearance |
| OEM display settings | Native display-settings page with destination and picture-size selectors | Physical HMI presentation |
| Force close / Test display | Own-process reset; eight-second test on selected screen | Actual renderer release and projected pattern |
| FPS diagnostics and recovery | Separate phone capture/sent and car received counters; bounded JPEG copies; burst recovery without the old 15 fps requested floor | Actual throughput may be lower than the requested 30/60 rate |
| Update notes inside app | Version and all current notes in both apps | Host packaging checked |
| Generic source name | MaxModsIdriveApps catalog, multi-component source | GitHub repository URL rename remains pending |
| Driving / waiver checkbox | Park checks retained; no moving-video override | Not included |

These implementations passed the host checks in VALIDATION.md. They are not
a claim that the reported car faults have been physically verified as fixed.

// SPDX-License-Identifier: GPL-3.0-or-later
// Generated from release_notes.json.
'use strict';
module.exports = {
  "version": "0.6.0",
  "phoneVersion": "0.6.0",
  "changes": [
    "Removed QR pairing from both apps. Pair once with the phone address/code; the link is remembered.",
    "Added a connection guide in both apps: BMW Wi-Fi, its menu and password, phone setup, audio and pairing.",
    "The phone guide has shortcuts to Wi-Fi and Bluetooth settings.",
    "Hardware video now adapts its bitrate to audio use and measured link congestion.",
    "Hardware capture uses the display canvas when supported, reducing work and traffic without cropping.",
    "Added a real encoder frame-rate cap so high-refresh phones do not send more frames than requested.",
    "Late hardware-video queues skip to a fresh keyframe instead of building up delayed playback.",
    "JPEG congestion handling tries smaller compressed frames before reducing the frame rate.",
    "The QR connection helper is no longer required or offered by the current source.",
    "Update both apps to 0.6.0. Audio coexistence still needs testing on the car."
  ],
  "lines": [
    [
      "Removed QR pairing from both apps. Pair once with the phone",
      "address/code; the link is remembered."
    ],
    [
      "Added a connection guide in both apps: BMW Wi-Fi, its menu",
      "and password, phone setup, audio and pairing."
    ],
    [
      "The phone guide has shortcuts to Wi-Fi and Bluetooth",
      "settings."
    ],
    [
      "Hardware video now adapts its bitrate to audio use and",
      "measured link congestion."
    ],
    [
      "Hardware capture uses the display canvas when supported,",
      "reducing work and traffic without cropping."
    ],
    [
      "Added a real encoder frame-rate cap so high-refresh phones",
      "do not send more frames than requested."
    ],
    [
      "Late hardware-video queues skip to a fresh keyframe instead",
      "of building up delayed playback."
    ],
    [
      "JPEG congestion handling tries smaller compressed frames",
      "before reducing the frame rate."
    ],
    [
      "The QR connection helper is no longer required or offered by",
      "the current source."
    ],
    [
      "Update both apps to 0.6.0. Audio coexistence still needs",
      "testing on the car."
    ]
  ]
};

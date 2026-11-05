// SPDX-License-Identifier: GPL-3.0-or-later
// Generated from release_notes.json.
'use strict';
module.exports = {
  "version": "0.7.0",
  "phoneVersion": "0.7.0",
  "changes": [
    "Car menus now use BMW native pages, buttons, fonts, red selection and controller focus.",
    "All menu resources load before entry. Failed or timed-out page changes recover to the main menu.",
    "iDrive video has a separate page. Use BMW Back or tap the picture to return to native settings.",
    "HUD and cluster sessions no longer run a custom iDrive menu renderer or controller grab.",
    "JPEG decoding copies each output chunk once, avoiding repeated large frame-buffer allocations.",
    "JPEG uses one capture clock and burst-tolerant recovery. Its requested rate no longer falls to 15 fps.",
    "Hardware capture requests real-time encoder priority and the selected operating rate.",
    "Diagnostics show phone capture, phone send and car received fps separately, plus video traffic.",
    "BMW display, picture size, video, guide, update notes, test and reset controls remain available.",
    "Update both apps to 0.7.0. Actual car frame rate and native menu presentation still need testing."
  ],
  "lines": [
    [
      "Car menus now use BMW native pages, buttons, fonts, red",
      "selection and controller focus."
    ],
    [
      "All menu resources load before entry. Failed or timed-out",
      "page changes recover to the main menu."
    ],
    [
      "iDrive video has a separate page. Use BMW Back or tap the",
      "picture to return to native settings."
    ],
    [
      "HUD and cluster sessions no longer run a custom iDrive menu",
      "renderer or controller grab."
    ],
    [
      "JPEG decoding copies each output chunk once, avoiding",
      "repeated large frame-buffer allocations."
    ],
    [
      "JPEG uses one capture clock and burst-tolerant recovery. Its",
      "requested rate no longer falls to 15 fps."
    ],
    [
      "Hardware capture requests real-time encoder priority and the",
      "selected operating rate."
    ],
    [
      "Diagnostics show phone capture, phone send and car received",
      "fps separately, plus video traffic."
    ],
    [
      "BMW display, picture size, video, guide, update notes, test",
      "and reset controls remain available."
    ],
    [
      "Update both apps to 0.7.0. Actual car frame rate and native",
      "menu presentation still need testing."
    ]
  ]
};

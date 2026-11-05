# Third-party code

This project is licensed under GPL-3.0-or-later. No BMW SDK, firmware,
VIN, vehicle key or proprietary donor bundle is included.

- `car/src/cluster_render_client.js`: Robert Nisipeanu, 2026,
  MPL-2.0. Unmodified from `robertnisipeanu/idrive-apps`.
  The complete MPL text is in `licenses/MPL-2.0.txt`.
- `car/src/speller.js`: Robert Nisipeanu and IterioDev, 2026,
  GPL-3.0-or-later, from `robertnisipeanu/mgu-store`.
- `tools/oap_link.js` and `tools/oap_pack.js`: Robert Nisipeanu,
  2026, GPL-3.0-or-later, from `robertnisipeanu/idrive-apps`.
- `tests/synthetic_donor.js`: Robert Nisipeanu and IterioDev,
  GPL-3.0-or-later, from `robertnisipeanu/mgu-store`. It contains
  made-up SDK stubs and Browserify's MIT-licensed loader, not BMW code.
- The RHMI entry-point lifecycle and native UI package follow the public
  examples in those projects. Vehicle speed scaling (1/64 km/h) and selector
  enum interpretation follow `cauliflowermossgrape/idrive7-apps` (MIT).
  No source from that project's runtime is copied into the app.

The complete GPL-3.0 text is in `LICENSE`. The head unit links the
app against its own existing BMW SDK during installation.

- `native/jpeg-decoder/stb_image.h`: Sean Barrett and contributors, stb_image 2.30,
  commit f0569113c93ad095470c54bf34a17b36646bbbb5. JPEG-only build; the
  complete MIT/public-domain dual licence is retained at the end of the header.
- `car/src/mgu_render_client.js`: Robert Nisipeanu/IterioDev community renderer
  client from robertnisipeanu/mgu-store, based on IterioDev's MIT-licensed
  transport (Copyright 2026 cauliflowermossgrape); original attribution retained.
- The app icon includes DejaVu Sans glyph pixels. Bitstream/DejaVu notices
  are in `assets/DejaVu-LICENSE.txt`, also included in the car package. The
  current native menus use BMW's own fonts; the old custom atlas is removed.
- `assets/max-mods-logo.png`: official Max Mods artwork used at the director's
  request. Source/provenance in `assets/README.md`; brand rights remain with
  Max Mods. `assets/max-mods-logo-stacked.png` is the requested transparent
  two-line adaptation.
- Native RHMI menu templates/lifecycle and cluster slot contention follow
  the public Store and Waze examples. BMW renders its own widgets; no
  proprietary widget code, fonts or SDK is redistributed. The optional GPU adapter starts a separate
  instance of the user's installed GPL Waze-on-cluster executable from
  `robertnisipeanu/idrive-apps/native/waze-on-cluster`. That executable and
  its proprietary system libraries are not redistributed here. The adapter
  never runs its firmware patch installer.

Earlier 0.4/0.5 releases included Kazuhiko Arase's MIT QR generator and ZXing
core 3.5.3 (Apache-2.0). They are removed from the current app/build. Historical
source provenance remains in git; licenses/Apache-2.0.txt and the following
MIT notice are retained for earlier downloadable releases.

MIT-licensed portions (original renderer transport and historical QR generator):

Copyright (c) 2009 Kazuhiko Arase.
Copyright (c) 2026 cauliflowermossgrape.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

The JPEG worker statically links musl libc 1.2.5 (MIT), commit
0784374d561435f7c787a555aeab8ede699ed298. Its full COPYRIGHT is in
`licenses/musl-COPYRIGHT.txt` and the car package decoder-source directory.

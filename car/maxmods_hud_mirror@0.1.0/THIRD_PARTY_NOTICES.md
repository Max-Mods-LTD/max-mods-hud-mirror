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

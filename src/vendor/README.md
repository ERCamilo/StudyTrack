# Vendored third-party libraries

These files are bundled locally (served from the app's own origin) so they work
under the strict Content-Security-Policy (`script-src 'self'`), which forbids
loading scripts from a CDN.

## qrcode.min.js

- **Library:** qrcode-generator v1.4.4
- **Author:** Kazuhiko Arase
- **License:** MIT
- **Source:** https://github.com/kazuhikoarase/qrcode-generator
- **Obtained from:** https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js
- **Used by:** `src/app.js` (renders the student-card share QR to a canvas)
- **CSP note:** pure array math, no `eval`/`Function` constructor — safe without `unsafe-eval`.

## jsqr.min.js

- **Library:** jsQR v1.4.0 (minified by jsDelivr / Terser)
- **Author:** Cosmo Wolfe
- **License:** Apache-2.0
- **Source:** https://github.com/cozmo/jsQR
- **Obtained from:** https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js
- **Used by:** `src/app.js` (decodes a QR from a photo so a card can be read without a live camera / camera permission)
- **CSP note:** no `eval`/`Function` constructor — safe without `unsafe-eval`.

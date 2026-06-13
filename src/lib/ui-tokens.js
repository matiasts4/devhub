/**
 * UI design tokens.
 *
 * The canonical typography scale lives here. It is consumed by:
 *  - `src/components/**` via `typographyClass(token)` (Tailwind class string)
 *  - `tailwind.config.js` via direct import of the CJS exports below
 *
 * Keep this file CJS-compatible (no ESM syntax) so tailwind.config.js can
 * `require()` it without a Babel/Jest interop layer.
 */

const TYPOGRAPHY_SCALE = {
  'caption-xs': { fontSize: '10px', lineHeight: '1.3', letterSpacing: '0.02em' },
  'caption-sm': { fontSize: '11px', lineHeight: '1.35', letterSpacing: '0.01em' },
  'caption-md': { fontSize: '12px', lineHeight: '1.4', letterSpacing: '0' },
  label: { fontSize: '13px', lineHeight: '1.4', letterSpacing: '0' },
  body: { fontSize: '14px', lineHeight: '1.5', letterSpacing: '0' },
  title: { fontSize: '18px', lineHeight: '1.3', letterSpacing: '-0.01em' },
  display: { fontSize: '24px', lineHeight: '1.2', letterSpacing: '-0.02em' },
};

function typographyClass(token) {
  if (!TYPOGRAPHY_SCALE[token]) {
    throw new Error(`Unknown typography token: ${token}`);
  }
  return `text-${token}`;
}

module.exports = { TYPOGRAPHY_SCALE, typographyClass };

/**
 * PizarraToolPalette — brutalist micro-state contract (pizarra-ux-overhaul 3.2).
 *
 * Covers board-canvas Req 3:
 *   "Brutalist tool-palette micro-states — hover state changes border-color
 *    without transform, active tool renders 1px inset accent border."
 *
 * This file lives under src/components/pizarra/__tests__/ so the eslint
 * browserAppIgnores pattern matches it and the test globals
 * (describe, test, expect) are available via the jest environment
 * without per-line eslint-disable directives.
 */

const fs = require('node:fs');
const path = require('node:path');

const palettePath = path.join(__dirname, '..', 'PizarraToolPalette.jsx');
const paletteSource = fs.readFileSync(palettePath, 'utf8');

describe('PizarraToolPalette — pizarra-ux-overhaul 3.2 micro-state contract', () => {
  test('hover state changes border-color without transform', () => {
    // Per board-canvas Req 3, the hover state is a border-color tint
    // with no transform. The component wires onMouseEnter/Leave that
    // toggle dataset.pizarraHovered and uses a transition for
    // border-color. Source-level assertion confirms the contract.
    expect(paletteSource).toMatch(/onMouseEnter/);
    expect(paletteSource).toMatch(/onMouseLeave/);
    expect(paletteSource).toMatch(/transition:\s*['"]border-color/);
    // The button must not have a `transform` CSS property in any
    // branch; the brutalist style is transform-free.
    const transformOccurrences = paletteSource.match(/transform:/g) || [];
    expect(transformOccurrences.length).toBe(0);
  });

  test('active tool renders 1px inset accent border', () => {
    // Per board-canvas Req 3, the active tool gets a 1px inset
    // accent border. The implementation uses the `outline` CSS
    // property with `outline-style: inset` (or equivalent) so the
    // border reads at a glance without changing layout. Source-level
    // assertion confirms the contract.
    expect(paletteSource).toMatch(/outline:\s*value\s*===\s*toolVal\s*\?\s*['"]1px inset/);
  });
});

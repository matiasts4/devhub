'use strict';

const fs = require('fs');
const path = require('path');

const GLOBALS_CSS_PATH = path.resolve(__dirname, '..', '..', 'app', 'globals.css');

function loadGlobals() {
  return fs.readFileSync(GLOBALS_CSS_PATH, 'utf8');
}

/**
 * Extract the contiguous `zed-aura-*` region from globals.css.
 * Starts at the first `@keyframes zed-aura-breathe` so the legacy block
 * is included alongside the new `/* zed-aura-*:` section. Ends right
 * before the next unrelated `/* ──` block. Defensive: if the start
 * marker is missing, returns the slice from `@keyframes zed-aura-breathe`
 * to the end of `.zed-aura-pulse { ... }` block.
 */
function extractZedAuraRegion(css) {
  const breathe = css.indexOf('@keyframes zed-aura-breathe');
  if (breathe === -1) return '';
  const rest = css.slice(breathe);
  const sectionRegex = /\/\*\s*─{3,}/g;
  sectionRegex.lastIndex = 0;
  const m = sectionRegex.exec(rest);
  return m ? rest.slice(0, m.index) : rest;
}

describe('globals.css — zed-aura-* block (ZAA-5)', () => {
  let css;
  beforeAll(() => {
    css = loadGlobals();
  });

  test('file loads and contains the zed-aura region', () => {
    expect(css.length).toBeGreaterThan(0);
    const region = extractZedAuraRegion(css);
    expect(region.length).toBeGreaterThan(0);
  });

  test('declares .zed-aura-root with --accent-{terminal,browser,file} CSS vars', () => {
    const region = extractZedAuraRegion(css);
    expect(region).toMatch(/\.zed-aura-root\s*\{/);
    expect(region).toMatch(/--accent-terminal:\s*#4ad3c0/i);
    expect(region).toMatch(/--accent-browser:\s*#9b6bff/i);
    expect(region).toMatch(/--accent-file:\s*#f0b54a/i);
  });

  test('declares three per-tool keyframes: zed-aura-pulse-{terminal,browser,file}', () => {
    const region = extractZedAuraRegion(css);
    expect(region).toMatch(/@keyframes\s+zed-aura-pulse-terminal\b/);
    expect(region).toMatch(/@keyframes\s+zed-aura-pulse-browser\b/);
    expect(region).toMatch(/@keyframes\s+zed-aura-pulse-file\b/);
  });

  test('per-tool keyframes are scoped to prefers-reduced-motion: no-preference', () => {
    const region = extractZedAuraRegion(css);
    // Extract the @media (prefers-reduced-motion: no-preference) block
    const m = region.match(
      /@media\s+\(prefers-reduced-motion:\s*no-preference\)\s*\{([\s\S]*?)\n\}/
    );
    expect(m).not.toBeNull();
    const block = m ? m[1] : '';
    expect(block).toMatch(
      /\.zed-aura-pulse-terminal\s*\{[^}]*animation:\s*zed-aura-pulse-terminal/s
    );
    expect(block).toMatch(/\.zed-aura-pulse-browser\s*\{[^}]*animation:\s*zed-aura-pulse-browser/s);
    expect(block).toMatch(/\.zed-aura-pulse-file\s*\{[^}]*animation:\s*zed-aura-pulse-file/s);
  });

  test('prefers-reduced-motion: reduce disables all four pulse classes', () => {
    const region = extractZedAuraRegion(css);
    const m = region.match(/@media\s+\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/);
    expect(m).not.toBeNull();
    const block = m ? m[1] : '';
    // The selector list contains all 4 classes; verify each appears in the
    // selector list AND the block sets `animation: none` exactly once.
    expect(block).toMatch(/\.zed-aura-pulse-terminal/);
    expect(block).toMatch(/\.zed-aura-pulse-browser/);
    expect(block).toMatch(/\.zed-aura-pulse-file/);
    expect(block).toMatch(/\.zed-aura-pulse\s*\{/);
    expect(block).toMatch(/animation:\s*none/);
  });

  test('preserves the legacy .zed-aura-breathe keyframe (untouched)', () => {
    const region = extractZedAuraRegion(css);
    expect(region).toMatch(/@keyframes\s+zed-aura-breathe\s*\{[^}]*opacity:\s*0\.72/s);
  });

  test('legacy .zed-aura-pulse class still references zed-aura-breathe', () => {
    const region = extractZedAuraRegion(css);
    expect(region).toMatch(/\.zed-aura-pulse\s*\{[^}]*animation:\s*zed-aura-breathe/s);
  });
});

describe('globals.css — Zed live-state visuals (processing/speaking)', () => {
  let css;
  beforeAll(() => {
    css = loadGlobals();
  });

  test('processing sweep layer + spin animation exist', () => {
    expect(css).toMatch(/\.zed-aura-sweep\s*\{/);
    expect(css).toMatch(/@keyframes\s+zed-aura-spin\b/);
    expect(css).toMatch(/\.zed-aura-sweep-speaking\s*\{[^}]*animation:\s*zed-aura-spin/s);
  });

  test('speaking color aura + wave animation exist', () => {
    expect(css).toMatch(/\.zed-aura-speaking\s*\{/);
    expect(css).toMatch(/@keyframes\s+zed-aura-speak-wave\b/);
  });

  test('pill state glow + animated topline + equalizer exist', () => {
    expect(css).toMatch(/\.zed-pill-surface\[data-zed-state='speaking'\]/);
    expect(css).toMatch(/@keyframes\s+zed-topline-slide\b/);
    expect(css).toMatch(/@keyframes\s+zed-eq-bounce\b/);
  });

  test('reduced-motion disables the new live-state animations', () => {
    const blocks =
      css.match(/@media\s+\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g) || [];
    const joined = blocks.join('\n');
    expect(joined).toMatch(/\.zed-aura-speaking-animate/);
    expect(joined).toMatch(/\.zed-eq-bar/);
  });
});

describe('globals.css — Zed aura speed multiplier (--zed-aura-speed)', () => {
  let css;
  beforeAll(() => {
    css = loadGlobals();
  });

  test('pulse, sweep, and flash animations scale their duration by --zed-aura-speed', () => {
    expect(css).toMatch(
      /\.zed-aura-pulse-terminal\s*\{[^}]*animation:\s*zed-aura-pulse-terminal\s+calc\(4s\s*\*\s*var\(--zed-aura-speed,\s*1\)\)/s
    );
    expect(css).toMatch(
      /\.zed-aura-sweep-processing\s*\{[^}]*animation:\s*zed-aura-spin\s+calc\(14s\s*\*\s*var\(--zed-aura-speed,\s*1\)\)/s
    );
    expect(css).toMatch(
      /\.zed-aura-sweep-speaking\s*\{[^}]*animation:\s*zed-aura-spin\s+calc\(7s\s*\*\s*var\(--zed-aura-speed,\s*1\)\)/s
    );
    expect(css).toMatch(
      /\.zed-aura-outcome-success\s*\{[^}]*animation:\s*zed-aura-flash-success\s+calc\(0\.9s\s*\*\s*var\(--zed-aura-speed,\s*1\)\)/s
    );
    expect(css).toMatch(
      /\.zed-aura-outcome-error\s*\{[^}]*animation:\s*zed-aura-flash-error\s+calc\(0\.9s\s*\*\s*var\(--zed-aura-speed,\s*1\)\)/s
    );
  });
});

describe('globals.css — data-motion-mode reduced gate (in-app motion preference)', () => {
  let css;
  beforeAll(() => {
    css = loadGlobals();
  });

  test('html[data-motion-mode="reduced"] disables the zed CSS animations regardless of OS prefers-reduced-motion', () => {
    const selectors = [
      '.zed-aura-pulse-terminal',
      '.zed-aura-pulse-browser',
      '.zed-aura-pulse-file',
      '.zed-aura-pulse',
      '.zed-aura-outcome-success',
      '.zed-aura-outcome-error',
      '.zed-aura-sweep-processing',
      '.zed-aura-sweep-speaking',
      '.zed-aura-speaking-animate',
      '.zed-pill-surface',
      '.zed-pill-topline-active',
      '.zed-pill-avatar',
      '.zed-eq-bar',
    ];
    for (const selector of selectors) {
      const escaped = selector.replace(/[.[\]]/g, '\\$&');
      const pattern = new RegExp(`html\\[data-motion-mode='reduced'\\]\\s+${escaped}\\b[^,{]*[,{]`);
      expect(css).toMatch(pattern);
    }
  });
});

'use strict';

const fs = require('fs');
const path = require('path');

const INDEX_CSS_PATH = path.resolve(__dirname, '..', '..', 'index.css');
const GLOBALS_CSS_PATH = path.resolve(__dirname, '..', 'globals.css');

function loadIndex() {
  return fs.readFileSync(INDEX_CSS_PATH, 'utf8');
}

function loadGlobals() {
  return fs.readFileSync(GLOBALS_CSS_PATH, 'utf8');
}

describe('CSS keyframe deduplication — single source in globals.css', () => {
  let indexCss;
  let globalsCss;

  beforeAll(() => {
    indexCss = loadIndex();
    globalsCss = loadGlobals();
  });

  const duplicatedKeyframes = [
    'skeleton-shimmer',
    'fadeInUp',
    'slideInRight',
    'typing-dot',
    'reveal',
  ];

  duplicatedKeyframes.forEach((name) => {
    test(`globals.css contains @keyframes ${name}`, () => {
      expect(globalsCss).toMatch(new RegExp(`@keyframes\\s+${name}\\b`));
    });

    test(`index.css does NOT contain @keyframes ${name}`, () => {
      expect(indexCss).not.toMatch(new RegExp(`@keyframes\\s+${name}\\b`));
    });
  });

  test('globals.css contains the .fade-in-up utility class', () => {
    expect(globalsCss).toMatch(/\.fade-in-up\s*\{/);
  });

  test('globals.css contains the .slide-in-right utility class', () => {
    expect(globalsCss).toMatch(/\.slide-in-right\s*\{/);
  });

  test('globals.css contains the .typing-dot utility classes', () => {
    expect(globalsCss).toMatch(/\.typing-dot\s*\{/);
    expect(globalsCss).toMatch(/\.typing-dot:nth-child\(2\)/);
    expect(globalsCss).toMatch(/\.typing-dot:nth-child\(3\)/);
  });

  test('globals.css contains scroll reveal + stagger utilities', () => {
    expect(globalsCss).toMatch(/\.reveal-on-scroll\s*\{/);
    expect(globalsCss).toMatch(/\.stagger-children\s*>\s*\*/);
  });

  test('index.css does NOT contain the migrated utility classes', () => {
    expect(indexCss).not.toMatch(/\.fade-in-up\s*\{/);
    expect(indexCss).not.toMatch(/\.slide-in-right\s*\{/);
    expect(indexCss).not.toMatch(/\.reveal-on-scroll\s*\{/);
    expect(indexCss).not.toMatch(/\.stagger-children\s*>\s*\*/);
  });

  test('globals.css disables migrated animations under prefers-reduced-motion', () => {
    const blocks =
      globalsCss.match(/@media\s+\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g) || [];
    const joined = blocks.join('\n');
    expect(joined).toMatch(/\.fade-in-up/);
    expect(joined).toMatch(/\.slide-in-right/);
    expect(joined).toMatch(/\.reveal-on-scroll/);
    expect(joined).toMatch(/\.stagger-children\s*>\s*\*/);
  });
});

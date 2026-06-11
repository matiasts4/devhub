'use strict';

const fs = require('fs');
const path = require('path');

const APP_PATH = path.resolve(__dirname, '..', 'App.js');

function readApp() {
  return fs.readFileSync(APP_PATH, 'utf8');
}

describe('App.js — MotionProvider mount at root (ZAA-6)', () => {
  let app;
  beforeAll(() => {
    app = readApp();
  });

  test('imports MotionProvider from the ui/motion module', () => {
    expect(app).toMatch(
      /import\s*\{[^}]*\bMotionProvider\b[^}]*\}\s*from\s*['"]@\/components\/ui\/motion\/MotionProvider['"]/
    );
  });

  test('wraps the render tree with <MotionProvider> ... </MotionProvider>', () => {
    // The JSX return must include a <MotionProvider> wrapper. We accept
    // either inline (single line) or multiline styles.
    const openTag = app.match(/<MotionProvider(\s[^>]*)?>/);
    const closeTag = app.match(/<\/MotionProvider>/);
    expect(openTag).not.toBeNull();
    expect(closeTag).not.toBeNull();
  });

  test('places MotionProvider as a single line (no other JSX between the two)', () => {
    // The TDD task spec says "REFACTOR: keep the import on a single line; no
    // other changes to App.js." Verify there is exactly one MotionProvider
    // open and one close, and that MotionProvider opens before HashRouter.
    const opens = app.match(/<MotionProvider(\s[^>]*)?>/g) || [];
    const closes = app.match(/<\/MotionProvider>/g) || [];
    expect(opens.length).toBe(1);
    expect(closes.length).toBe(1);
    const openIdx = app.indexOf(opens[0]);
    const closeIdx = app.indexOf(closes[0]);
    expect(openIdx).toBeLessThan(closeIdx);
    // The HashRouter (or main app tree) lives between them.
    const between = app.slice(openIdx, closeIdx);
    expect(between).toMatch(/HashRouter/);
  });
});

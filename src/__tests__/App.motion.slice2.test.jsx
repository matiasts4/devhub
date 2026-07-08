'use strict';

const fs = require('fs');
const path = require('path');

const APP_PATH = path.resolve(__dirname, '..', 'App.js');

function readApp() {
  return fs.readFileSync(APP_PATH, 'utf8');
}

describe('App.js — Slice 2 motion migrations', () => {
  let app;

  beforeAll(() => {
    app = readApp();
  });

  describe('3.1 Sidebar transform migration', () => {
    test('imports useMotionMode from the global motion context', () => {
      expect(app).toMatch(
        /import\s*\{[^}]*\buseMotionMode\b[^}]*\}\s*from\s+['"]@\/components\/ui\/motion\/MotionModeContext['"]/
      );
    });

    test('imports getTransition from motion-tokens', () => {
      expect(app).toMatch(
        /import\s*\{[^}]*\bgetTransition\b[^}]*\}\s*from\s+['"]@\/components\/ui\/system\/motion-tokens['"]/
      );
    });

    test('sidebar wrapper uses translateX (x) instead of width animation', () => {
      expect(app).toMatch(/animate=\{\{[^}]*\bx:\s*0[^}]*\}\}/);
      expect(app).toMatch(/initial=\{\{[^}]*\bx:/);
      expect(app).toMatch(/exit=\{\{[^}]*\bx:/);
    });

    test('sidebar motion wrapper no longer animates width', () => {
      const sidebarMatch = app.match(/key=["']workspace-sidebar-wrapper["'][\s\S]*?>/m);
      expect(sidebarMatch).not.toBeNull();
      const sidebarBlock = sidebarMatch[0];
      expect(sidebarBlock).not.toMatch(/animate=\{\{[^}]*\bwidth:/);
      expect(sidebarBlock).not.toMatch(/initial=\{\{[^}]*\bwidth:/);
      expect(sidebarBlock).not.toMatch(/exit=\{\{[^}]*\bwidth:/);
    });

    test('sidebar transition comes from getTransition with nav intent', () => {
      expect(app).toMatch(/getTransition\(['"]nav['"],\s*motionMode\)/);
    });
  });

  describe('3.2 Route transitions', () => {
    test('routes use instant swap (no AnimatePresence mode=wait / scale FOUC)', () => {
      // Page transitions previously used mode="wait" + scale+opacity which left a
      // blank/background-only frame in the Tauri webview. Routes must be instant.
      expect(app).not.toMatch(/<AnimatePresence\s+mode=["']wait["']\s*>/);
      expect(app).not.toMatch(/scale:\s*routeScale/);
      expect(app).toMatch(/key=\{location\.pathname\}/);
      expect(app).toMatch(/<Outlet\s+context=\{\{\s*project\s*\}\}\s*\/>/);
    });

    test('terminal container is not wrapped by route motion', () => {
      // Terminal shell must remain a sibling of main content, not inside a
      // route transition wrapper that unmounts on navigation.
      expect(app).toMatch(/data-terminal-container/);
      const mainMatch = app.match(
        /\{\/\* Main Routed Content \*\/\}[\s\S]*?\{\/\* Persistent Terminal/
      );
      expect(mainMatch).not.toBeNull();
      expect(mainMatch[0]).not.toMatch(/data-terminal-container/);
    });

    test('terminal container remains rendered as a sibling', () => {
      expect(app).toMatch(/data-terminal-container/);
    });
  });
});

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
      // The sidebar motion wrapper must animate x and opacity, not width.
      expect(app).toMatch(/animate=\{\{[^}]*\bx:\s*0[^}]*\}\}/);
      expect(app).toMatch(/initial=\{\{[^}]*\bx:/);
      expect(app).toMatch(/exit=\{\{[^}]*\bx:/);
    });

    test('sidebar motion wrapper no longer animates width', () => {
      // We still allow a parent div to set width as a layout snap, but the
      // motion.div itself must not have width in its animate/initial/exit.
      const sidebarMatch = app.match(/key=["']workspace-sidebar-wrapper["'][\s\S]*?\u003e/m);
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
    test('imports useRouteDirection hook', () => {
      expect(app).toMatch(
        /import\s*\{[^}]*\buseRouteDirection\b[^}]*\}\s*from\s+['"]@\/hooks\/useRouteDirection['"]/
      );
    });

    test('wraps Outlet inside AnimatePresence mode="wait"', () => {
      expect(app).toMatch(/\u003cAnimatePresence\s+mode=["']wait["']\s*\u003e/);
    });

    test('keys the route motion wrapper by location pathname', () => {
      expect(app).toMatch(/key=\{location\.pathname\}/);
    });

    test('route motion wrapper uses scale + opacity variants (no lateral slide)', () => {
      expect(app).toMatch(/variants=\{routeVariants\}/);
      expect(app).toMatch(/initial=["']enter["']/);
      expect(app).toMatch(/animate=["']center["']/);
      expect(app).toMatch(/exit=["']exit["']/);
      // Variants must use scale, not x (no lateral slide on desktop)
      expect(app).toMatch(/scale:\s*routeScale/);
      expect(app).not.toMatch(/x:\s*direction/);
    });

    test('route transition comes from getTransition with nav intent', () => {
      expect(app).toMatch(/transition=\{routeTransition\}/);
      expect(app).toMatch(
        /const\s+routeTransition\s*=\s*getTransition\(['"]nav["'],\s*motionMode\)/
      );
    });

    test('terminal container is not inside the route AnimatePresence wrapper', () => {
      const animatePresenceMatch = app.match(
        /\u003cAnimatePresence\s+mode=["']wait["']\s*\u003e[\s\S]*?\u003c\/AnimatePresence\u003e/
      );
      expect(animatePresenceMatch).not.toBeNull();
      expect(animatePresenceMatch[0]).not.toMatch(/data-terminal-container/);
    });

    test('terminal container remains rendered as a sibling', () => {
      expect(app).toMatch(/data-terminal-container/);
    });
  });
});

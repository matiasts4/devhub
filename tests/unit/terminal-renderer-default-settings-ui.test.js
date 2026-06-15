/**
 * Settings → Appearance → Terminal renderer select contract for
 * `terminal-renderer-default-xterm-webgl`.
 *
 * Specs: openspec/changes/terminal-renderer-default-xterm-webgl/specs/terminal-renderer-default/spec.md
 *   - TRD-4: Surface xterm-webgl as pre-selected option; vte-experimental and
 *     xterm remain selectable; subtitle references the WebGL renderer.
 *
 * Source of truth is now `src/views/Ajustes.jsx` (the Apariencia tab) — the
 * deprecated `src/app/settings/appearance/page.jsx` was removed in PR-2 of
 * `ajustes-cursor-restyle`. PR-1 ported the terminal sub-controls into
 * Ajustes behind the `devhub:terminal-settings-in-ajustes` localStorage
 * flag (default off in production, but the renderer marker strings live in
 * the source regardless of flag state).
 *
 * The assertions scan Ajustes.jsx source as a string. This is a coarse but
 * deterministic regression net — it would fail if the production code
 * stops exposing xterm-webgl as the pre-selected option, removes the
 * vte-experimental opt-in, or reverts the subtitle copy to the GTK/VTE
 * phrasing.
 */

const fs = require('fs');
const path = require('path');

const pageSource = fs.readFileSync(
  path.resolve(__dirname, '../../src/views/Ajustes.jsx'),
  'utf8'
);

describe('Settings Appearance — terminal renderer select (terminal-renderer-default)', () => {
  test('TRD-S8: select exposes xterm-webgl, vte-experimental, and xterm options; xterm-webgl is the pre-selected default', () => {
    // 1. All three options are exposed in the <select>.
    expect(pageSource).toMatch(/value="xterm-webgl"/);
    expect(pageSource).toMatch(/value="vte-experimental"/);
    expect(pageSource).toMatch(/value="xterm"/);

    // 2. The useState initializer falls back to 'xterm-webgl' for fresh users.
    //    Ajustes uses the function form (SSR-safe), so the assertion matches
    //    either direct `useState('xterm-webgl')` or `useState(() => ... return 'xterm-webgl' ...)`.
    expect(pageSource).toMatch(/useState\((['"]xterm-webgl['"]|\(\)\s*=>\s*\{[\s\S]{0,200}return\s+['"]xterm-webgl['"])/);
  });

  test('TRD-S9: subtitle copy references the WebGL renderer (not GTK/VTE as the default)', () => {
    // The new subtitle must mention the WebGL renderer as the default.
    expect(pageSource).toMatch(/xterm-webgl is the only active renderer/);
    // The OLD subtitle phrasing "GTK VTE stays as the preferred Linux/Tauri path"
    // must be gone.
    expect(pageSource).not.toMatch(/GTK VTE stays as the preferred Linux\/Tauri path/);
  });

  test('Active option label exposes vte-experimental and references xterm-webgl', () => {
    // The label for the legacy opt-in is present in the <option> text,
    // and the default is still xterm-webgl.
    expect(pageSource).toMatch(/vte-experimental \(legacy Linux\/Tauri opt-in\)/);
    expect(pageSource).toMatch(/xterm-webgl \(always active\)/);
  });
});

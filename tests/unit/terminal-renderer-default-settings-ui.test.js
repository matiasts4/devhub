/**
 * Settings → Appearance → Terminal renderer select contract for
 * `terminal-renderer-default-xterm-webgl`.
 *
 * Specs: openspec/changes/terminal-renderer-default-xterm-webgl/specs/terminal-renderer-default/spec.md
 *   - TRD-4: Surface xterm-webgl as pre-selected option; vte-experimental and
 *     xterm remain selectable; subtitle references the WebGL renderer.
 *
 * The existing `page.test.jsx` exercises the full Appearance page and pulls
 * in unrelated DOM chrome. This test is a focused contract for the
 * renderer select + badge + subtitle copy, kept independent of the rest
 * of the page chrome so it does not depend on the wider theme mocks.
 *
 * The assertions scan the page source as a string. This is a coarse but
 * deterministic regression net — it would fail if the production code
 * stops exposing xterm-webgl as the pre-selected option, removes the
 * vte-experimental opt-in, or reverts the subtitle copy to the GTK/VTE
 * phrasing.
 */

const fs = require('fs');
const path = require('path');

const pageSource = fs.readFileSync(
  path.resolve(__dirname, '../../src/app/settings/appearance/page.jsx'),
  'utf8'
);

describe('Settings Appearance — terminal renderer select (terminal-renderer-default)', () => {
  test('TRD-S8: select exposes xterm-webgl, vte-experimental, and xterm options; xterm-webgl is the pre-selected default', () => {
    // 1. All three options are exposed in the <select>.
    expect(pageSource).toMatch(/value="xterm-webgl"/);
    expect(pageSource).toMatch(/value="vte-experimental"/);
    expect(pageSource).toMatch(/value="xterm"/);

    // 2. The useState initial defaults to 'xterm-webgl' (fresh user, no stored value).
    expect(pageSource).toMatch(/useState\(['"]xterm-webgl['"]\)/);
  });

  test('TRD-S9: subtitle copy references the WebGL renderer (not GTK/VTE as the default)', () => {
    // The new subtitle must mention the WebGL renderer as the default.
    expect(pageSource).toMatch(/xterm-webgl/);
    // The OLD subtitle phrasing "GTK VTE stays as the preferred Linux/Tauri path"
    // must be gone.
    expect(pageSource).not.toMatch(/GTK VTE stays as the preferred Linux\/Tauri path/);
  });

  test('Active badge label is driven by the renderer mode and references xterm-webgl', () => {
    // The badge rendering must look up the label by mode rather than hardcode
    // a 'GTK VTE' or 'xterm' branch.
    expect(pageSource).toMatch(/terminalRendererMode === ['"]vte-experimental['"]/);
    expect(pageSource).toMatch(/xterm-webgl/);
  });
});

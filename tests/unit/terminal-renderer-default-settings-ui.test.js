/**
 * Settings → Appearance terminal renderer contract for `terminal-engine-v2` Phase 0.
 *
 * VTE (vte-experimental) is removed; the settings UI must not expose it as a
 * selectable renderer and must not reference GTK/VTE copy.
 */

const fs = require('fs');
const path = require('path');

const pageSource = fs.readFileSync(path.resolve(__dirname, '../../src/views/Ajustes.jsx'), 'utf8');

describe('Settings Appearance — terminal renderer select (terminal-engine-v2)', () => {
  test('TRD-S8: settings UI does not expose vte-experimental as a renderer option', () => {
    expect(pageSource).not.toMatch(/value="vte-experimental"/);
    expect(pageSource).not.toMatch(/vte-experimental \(legacy Linux\/Tauri opt-in\)/);
  });

  test('TRD-S9: subtitle copy does not reference GTK/VTE as the default renderer', () => {
    expect(pageSource).not.toMatch(/GTK VTE stays as the preferred Linux\/Tauri path/);
    expect(pageSource).not.toMatch(/GTK VTE/);
  });
});

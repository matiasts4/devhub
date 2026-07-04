/**
 * Session restore + swarm contract for `terminal-renderer-default-xterm-webgl`.
 *
 * Specs: openspec/changes/terminal-engine-v2/specs/terminal-renderer-default/spec.md
 *   - Legacy `vte-experimental` defaults are normalized to xterm-webgl (VTE removed).
 *
 * Swarm agent terminals inherit the new default via the INHERIT_MODE
 * plumbing — they call resolveRequestedRenderer which routes through
 * readTerminalRendererDefaultModeSetting, so legacy VTE values are normalized.
 */

const path = require('path');

const {
  readTerminalRendererDefaultModeSetting,
  readTerminalRendererPreferences,
  writeTerminalRendererPreferences,
  setPanelRendererPreference,
  TERMINAL_RENDERER_DEFAULT_MODE,
} = require(path.resolve(__dirname, '../../src/components/terminal/terminalRendererPreferences'));

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: jest.fn((key) => (values.has(key) ? values.get(key) : null)),
    setItem: jest.fn((key, value) => values.set(key, value)),
    removeItem: jest.fn((key) => values.delete(key)),
  };
}

function createWorkspace(id, panelIds) {
  return {
    id,
    columns: [
      {
        id: `c-${id}`,
        panels: panelIds.map((panelId) => ({ id: panelId })),
      },
    ],
  };
}

describe('terminal-renderer-default — session restore + soft roll-out', () => {
  test('TRF-DELTA-S1: stored vte-experimental is normalized to xterm-webgl when reading the default', () => {
    const storage = createStorage({
      devhub_terminal_renderer_default_mode: 'vte-experimental',
    });

    expect(readTerminalRendererDefaultModeSetting(storage)).toBe('xterm-webgl');
  });

  test('TRF-DELTA-S2: readTerminalRendererDefaultModeSetting is a pure read — no setItem call', () => {
    const storage = createStorage({
      devhub_terminal_renderer_default_mode: 'vte-experimental',
    });

    readTerminalRendererDefaultModeSetting(storage);

    // The read path MUST NOT write back the new default on first load.
    // Soft roll-out: existing users keep their stored choice.
    expect(storage.setItem).not.toHaveBeenCalledWith(
      'devhub_terminal_renderer_default_mode',
      expect.anything()
    );
  });

  test('TRF-DELTA-S2: empty storage returns the new default and does NOT auto-persist', () => {
    const storage = createStorage();

    const result = readTerminalRendererDefaultModeSetting(storage);
    expect(result).toBe('xterm-webgl');
    // No auto-persist on empty storage: the soft roll-out requires an
    // explicit user action to record the default.
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test('TRD-S6: readTerminalRendererPreferences normalizes stored vte-experimental default to xterm-webgl', () => {
    const storage = createStorage({
      devhub_terminal_renderer_default_mode: 'vte-experimental',
    });

    const prefs = readTerminalRendererPreferences(storage, 'proj-1', [
      createWorkspace('ws-1', ['p1']),
    ]);
    expect(prefs.defaultMode).toBe('xterm-webgl');
  });

  test('TRD-S7: new panels during restore inherit xterm-webgl when no per-panel value is stored', () => {
    const storage = createStorage();
    const next = setPanelRendererPreference(
      { version: 1, defaultMode: 'xterm-webgl', workspaces: {} },
      'ws-1',
      'p1',
      'xterm-webgl'
    );
    writeTerminalRendererPreferences(storage, 'proj-1', next, [createWorkspace('ws-1', ['p1'])]);

    const fresh = readTerminalRendererPreferences(storage, 'proj-1', [
      createWorkspace('ws-1', ['p1']),
    ]);

    expect(fresh.defaultMode).toBe('xterm-webgl');
    expect(fresh.workspaces['ws-1'].panels.p1).toBe('xterm-webgl');
  });

  test('TRD-1: global default constant is the source of truth for new users', () => {
    expect(TERMINAL_RENDERER_DEFAULT_MODE).toBe('xterm-webgl');
  });
});

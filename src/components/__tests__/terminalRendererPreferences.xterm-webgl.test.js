/**
 * terminal-renderer-xterm-webgl preference contract.
 *
 * Specs: openspec/changes/terminal-renderer-xterm-webgl/specs/terminal-restore-preferences/spec.md
 *
 * - TRP-XW-1-SCEN-1: setPanelRendererPreference(..., 'xterm-webgl') round-trips through storage
 * - TRP-XW-1-SCEN-2: setWorkspaceDefaultRenderer(..., 'xterm-webgl') round-trips
 * - TRP-XW-2-SCEN-1: survives a fresh read after restart
 * - TRP-XW-3-SCEN-1: existing panel override persists a workspace default change
 */

const {
  readTerminalRendererPreferences,
  setPanelRendererPreference,
  setWorkspaceDefaultRenderer,
  writeTerminalRendererPreferences,
} = require('../terminal/terminalRendererPreferences');

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

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: jest.fn((key) => (values.has(key) ? values.get(key) : null)),
    setItem: jest.fn((key, value) => values.set(key, value)),
    removeItem: jest.fn((key) => values.delete(key)),
  };
}

describe('terminalRendererPreferences.xterm-webgl', () => {
  test('setPanelRendererPreference(..., "xterm-webgl") round-trips through write/read (TRP-XW-1 SCEN-1)', () => {
    const storage = createStorage();
    const next = setPanelRendererPreference(
      { version: 1, defaultMode: 'xterm-webgl', workspaces: {} },
      'ws1',
      'p1',
      'xterm-webgl'
    );

    writeTerminalRendererPreferences(storage, 'proj-A', next, [createWorkspace('ws1', ['p1'])]);

    expect(
      readTerminalRendererPreferences(storage, 'proj-A', [createWorkspace('ws1', ['p1'])])
    ).toEqual(
      expect.objectContaining({
        defaultMode: 'xterm-webgl',
        workspaces: {
          ws1: expect.objectContaining({
            panels: { p1: 'xterm-webgl' },
          }),
        },
      })
    );
  });

  test('setWorkspaceDefaultRenderer(..., "xterm-webgl") round-trips the workspace default (TRP-XW-1 SCEN-2)', () => {
    const storage = createStorage();
    // Start from a non-xterm-webgl baseline so the sanitizer keeps the workspace
    // (the sanitizer drops workspaces whose defaultMode matches the global default
    // AND have no explicit panel overrides).
    const next = setWorkspaceDefaultRenderer(
      { version: 1, defaultMode: 'vte-experimental', workspaces: {} },
      'ws1',
      'xterm-webgl'
    );

    writeTerminalRendererPreferences(storage, 'proj-A', next, [createWorkspace('ws1', ['p1'])]);

    expect(
      readTerminalRendererPreferences(storage, 'proj-A', [createWorkspace('ws1', ['p1'])])
    ).toEqual(
      expect.objectContaining({
        workspaces: {
          ws1: expect.objectContaining({
            defaultMode: 'xterm-webgl',
          }),
        },
      })
    );
  });

  test('a fresh read after restart preserves the xterm-webgl panel override (TRP-XW-2 SCEN-1)', () => {
    const storage = createStorage();
    const next = setPanelRendererPreference(
      { version: 1, defaultMode: 'xterm-webgl', workspaces: {} },
      'ws1',
      'p1',
      'xterm-webgl'
    );

    writeTerminalRendererPreferences(storage, 'proj-A', next, [createWorkspace('ws1', ['p1'])]);

    // Simulate a restart: discard the in-memory `next` reference and re-read.
    const fresh = readTerminalRendererPreferences(storage, 'proj-A', [
      createWorkspace('ws1', ['p1']),
    ]);

    expect(fresh.workspaces.ws1.panels.p1).toBe('xterm-webgl');
  });

  test('a panel override survives a workspace default change (TRP-XW-3 SCEN-1)', () => {
    const storage = createStorage();
    const seed = setPanelRendererPreference(
      { version: 1, defaultMode: 'xterm-webgl', workspaces: {} },
      'ws1',
      'p1',
      'xterm-webgl'
    );
    const withDefault = setWorkspaceDefaultRenderer(seed, 'ws1', 'xterm-webgl');

    writeTerminalRendererPreferences(storage, 'proj-A', withDefault, [
      createWorkspace('ws1', ['p1']),
    ]);

    // Now flip the workspace default and re-persist; the explicit panel override MUST persist.
    const flipped = setWorkspaceDefaultRenderer(withDefault, 'ws1', 'vte-experimental');
    writeTerminalRendererPreferences(storage, 'proj-A', flipped, [createWorkspace('ws1', ['p1'])]);

    const fresh = readTerminalRendererPreferences(storage, 'proj-A', [
      createWorkspace('ws1', ['p1']),
    ]);

    expect(fresh.workspaces.ws1.defaultMode).toBe('vte-experimental');
    expect(fresh.workspaces.ws1.panels.p1).toBe('xterm-webgl');
  });
});

const {
  createDefaultTerminalRendererPreferences,
  getPanelRendererPreferenceMode,
  getRuntimeDefaultTerminalRendererMode,
  getTerminalRendererPreferencesStorageKey,
  readTerminalRendererDefaultModeSetting,
  readTerminalRendererPreferences,
  resolveRequestedRenderer,
  sanitizeTerminalRendererPreferences,
  shouldAvoidWebglOnThisRuntime,
  writeTerminalRendererDefaultModeSetting,
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

describe('terminalRendererPreferences', () => {
  test('returns project-scoped storage key when project id exists', () => {
    expect(getTerminalRendererPreferencesStorageKey('proj-1')).toBe(
      'devhub_terminal_renderer_preferences:proj-1'
    );
    expect(getTerminalRendererPreferencesStorageKey()).toBe('devhub_terminal_renderer_preferences');
  });

  test('sanitizes unknown workspaces, stale panels, and invalid modes back to baseline', () => {
    const workspaces = [createWorkspace('ws-1', ['p1', 'p2'])];

    expect(
      sanitizeTerminalRendererPreferences(
        {
          version: 99,
          workspaces: {
            'ws-1': {
              defaultMode: 'not-a-renderer',
              panels: {
                p1: 'ghostty-experimental',
                p999: 'vte-experimental',
              },
            },
            stale: {
              defaultMode: 'ghostty-experimental',
              panels: { p1: 'ghostty-experimental' },
            },
          },
        },
        { workspaces }
      )
    ).toEqual({
      version: 1,
      defaultMode: 'xterm-webgl',
      workspaces: {
        'ws-1': {
          defaultMode: 'xterm-webgl',
          panels: {
            p1: 'xterm',
          },
        },
      },
    });
  });

  test('resolves panel inherit from workspace default and falls back to xterm-webgl for missing prefs', () => {
    const prefs = {
      version: 1,
      workspaces: {
        'ws-1': {
          defaultMode: 'xterm',
          panels: {
            p1: 'inherit',
            p2: 'xterm-webgl',
          },
        },
      },
    };

    expect(resolveRequestedRenderer({ workspaceId: 'ws-1', panelId: 'p1', prefs })).toBe('xterm');
    expect(resolveRequestedRenderer({ workspaceId: 'ws-1', panelId: 'p2', prefs })).toBe(
      'xterm-webgl'
    );
    expect(resolveRequestedRenderer({ workspaceId: 'ws-unknown', panelId: 'p-x', prefs })).toBe(
      'xterm-webgl'
    );
  });

  test('returns raw panel preference so UI can distinguish inherit from explicit overrides', () => {
    const prefs = {
      version: 1,
      workspaces: {
        'ws-1': {
          defaultMode: 'xterm',
          panels: {
            p1: 'inherit',
            p2: 'vte-experimental',
          },
        },
      },
    };

    expect(getPanelRendererPreferenceMode({ workspaceId: 'ws-1', panelId: 'p1', prefs })).toBe(
      'inherit'
    );
    expect(getPanelRendererPreferenceMode({ workspaceId: 'ws-1', panelId: 'p2', prefs })).toBe(
      'vte-experimental'
    );
    expect(getPanelRendererPreferenceMode({ workspaceId: 'ws-1', panelId: 'p999', prefs })).toBe(
      'inherit'
    );
  });

  test('reads stored prefs through scoped key and sanitizes them against live workspace ids', () => {
    const storage = {
      getItem: jest.fn((key) => {
        if (key === 'devhub_terminal_renderer_preferences:proj-1') {
          return JSON.stringify({
            version: 1,
            workspaces: {
              'ws-1': {
                defaultMode: 'xterm',
                panels: { p1: 'inherit' },
              },
              stale: {
                defaultMode: 'vte-experimental',
                panels: { p9: 'xterm' },
              },
            },
          });
        }
        return null;
      }),
    };

    expect(
      readTerminalRendererPreferences(storage, 'proj-1', [createWorkspace('ws-1', ['p1'])])
    ).toEqual({
      version: 1,
      defaultMode: 'xterm-webgl',
      workspaces: {
        'ws-1': {
          defaultMode: 'xterm',
          panels: { p1: 'inherit' },
        },
      },
    });
  });

  test('uses settings default mode as the baseline when no workspace override exists', () => {
    const storage = {
      getItem: jest.fn((key) => {
        if (key === 'devhub_terminal_renderer_default_mode') return 'xterm';
        return null;
      }),
    };

    expect(
      readTerminalRendererPreferences(storage, 'proj-1', [createWorkspace('ws-1', ['p1'])])
    ).toEqual({
      version: 1,
      defaultMode: 'xterm',
      workspaces: {},
    });
  });

  test('writes and reads renderer default mode for Settings while migrating legacy ghostty to xterm', () => {
    const values = new Map([['devhub_terminal_renderer_default_mode', 'ghostty-experimental']]);
    const storage = {
      getItem: jest.fn((key) => values.get(key) ?? null),
      setItem: jest.fn((key, value) => values.set(key, value)),
    };

    expect(readTerminalRendererDefaultModeSetting(storage)).toBe('xterm');

    writeTerminalRendererDefaultModeSetting(storage, 'vte-experimental');

    expect(storage.setItem).toHaveBeenCalledWith(
      'devhub_terminal_renderer_default_mode',
      'vte-experimental'
    );
    expect(readTerminalRendererDefaultModeSetting(storage)).toBe('vte-experimental');
  });

  test('creates baseline xterm-webgl preferences when storage is empty or invalid', () => {
    const fallback = createDefaultTerminalRendererPreferences();
    const storage = {
      getItem: jest.fn(() => '{broken-json'),
    };

    expect(
      readTerminalRendererPreferences(storage, 'proj-1', [createWorkspace('ws-1', ['p1'])])
    ).toEqual(fallback);
  });

  test('demotes xterm-webgl to xterm on packaged Tauri Linux runtimes', () => {
    const previous = global.window;
    global.window = {
      __TAURI_INTERNALS__: {},
      navigator: { platform: 'Linux x86_64', userAgent: 'Linux' },
    };
    try {
      expect(shouldAvoidWebglOnThisRuntime()).toBe(true);
      expect(getRuntimeDefaultTerminalRendererMode()).toBe('xterm');
      expect(
        resolveRequestedRenderer({
          workspaceId: 'ws-unknown',
          panelId: 'p1',
          prefs: { defaultMode: 'xterm-webgl', workspaces: {} },
        })
      ).toBe('xterm');
    } finally {
      global.window = previous;
    }
  });
});

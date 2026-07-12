/**
 * ttyServer.captureFallback.test.js — capture must survive agent TUI mode.
 *
 * Agent TUI detection sets `historyEnabled = false` and clears `history`
 * (so WS reconnects never replay stale TUI frames), but the Zed assistant
 * reads panels through getSessionOutput → /api/terminal/session/:id/capture.
 * Before the fix, that returned '' for every agent panel and Zed could not
 * answer "¿qué respondió el agente?".
 *
 * Fix: fall back to the always-appending scrollbackStore tail.
 */

describe('ttyServer — getSessionOutput scrollback fallback', () => {
  let getSessionOutput;
  let createScrollbackStore;

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ getSessionOutput } = require('../ttyServer.js'));
      ({ createScrollbackStore } = require('../terminalScrollbackStore.js'));
    });
    globalThis.__DEVHUB_TTY_SESSIONS__ = new Map();
  });

  afterEach(() => {
    delete globalThis.__DEVHUB_TTY_SESSIONS__;
  });

  test('returns history when historyEnabled (shell session)', () => {
    globalThis.__DEVHUB_TTY_SESSIONS__.set('shell-1', {
      id: 'shell-1',
      history: 'user@host$ ls\nfile.txt\n',
      historyEnabled: true,
      scrollbackStore: createScrollbackStore('shell-1'),
    });
    expect(getSessionOutput('shell-1')).toBe('user@host$ ls\nfile.txt\n');
  });

  test('agent TUI session (history cleared) serves the scrollbackStore tail', () => {
    const store = createScrollbackStore('tui-1');
    store.append('kimi TUI frame\nEl agente respondió: tarea completada\n');
    globalThis.__DEVHUB_TTY_SESSIONS__.set('tui-1', {
      id: 'tui-1',
      history: '', // applyAgentTuiDetection clears it
      historyEnabled: false,
      scrollbackStore: store,
    });
    const out = getSessionOutput('tui-1');
    expect(out).toContain('El agente respondió: tarea completada');
  });

  test('fallback caps at the last 32KB of scrollback', () => {
    const store = createScrollbackStore('tui-2');
    store.append('OLD'.repeat(20000)); // 60KB of old bytes
    store.append('\nFIN DEL BUFFER');
    globalThis.__DEVHUB_TTY_SESSIONS__.set('tui-2', {
      id: 'tui-2',
      history: '',
      historyEnabled: false,
      scrollbackStore: store,
    });
    const out = getSessionOutput('tui-2');
    expect(out.length).toBeLessThanOrEqual(32 * 1024);
    expect(out).toContain('FIN DEL BUFFER');
  });

  test('unknown session still returns null; empty session returns empty string', () => {
    expect(getSessionOutput('nope')).toBeNull();
    globalThis.__DEVHUB_TTY_SESSIONS__.set('empty-1', {
      id: 'empty-1',
      history: '',
      historyEnabled: true,
      scrollbackStore: createScrollbackStore('empty-1'),
    });
    expect(getSessionOutput('empty-1')).toBe('');
  });
});

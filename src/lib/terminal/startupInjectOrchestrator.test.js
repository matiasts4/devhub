const {
  normalizeInjectCommand,
  resolvePanelStartupInjectIntent,
} = require('./startupInjectOrchestrator');
const {
  markPanelInitialCommandDispatched,
  clearPanelInitialCommandLifecycle,
} = require('./panelInitialCommandLifecycle');

describe('startupInjectOrchestrator', () => {
  beforeEach(() => {
    clearPanelInitialCommandLifecycle('p1');
    clearPanelInitialCommandLifecycle('p2');
  });

  test('normalizeInjectCommand strips recovery suffix', () => {
    expect(normalizeInjectCommand('opencode --session abc #recovery-123')).toBe(
      'opencode --session abc'
    );
  });

  test('resolvePanelStartupInjectIntent skips when lifecycle already dispatched same command', () => {
    markPanelInitialCommandDispatched('p1', 'opencode --session abc');
    const intent = resolvePanelStartupInjectIntent({
      panelId: 'p1',
      panel: { id: 'p1', initialCommand: 'opencode --session abc' },
      proposedCommand: 'opencode --session abc',
      phase: 'startup-relaunch',
      runtimeTerminal: null,
      restorePolicy: 'auto',
    });
    expect(intent.action).toBe('skip');
    expect(intent.reason).toBe('already-dispatched');
  });

  test('resolvePanelStartupInjectIntent skips when runtime terminal is alive', () => {
    const intent = resolvePanelStartupInjectIntent({
      panelId: 'p1',
      panel: { id: 'p1', initialCommand: 'grok' },
      proposedCommand: 'grok',
      phase: 'startup-relaunch',
      runtimeTerminal: { alive: true, socketCount: 1 },
      restorePolicy: 'auto',
    });
    expect(intent.action).toBe('skip');
    expect(intent.reason).toBe('runtime-live');
  });

  test('resolvePanelStartupInjectIntent inject on hydrate when no dispatch yet', () => {
    const intent = resolvePanelStartupInjectIntent({
      panelId: 'p1',
      panel: { id: 'p1', initialCommand: 'grok' },
      proposedCommand: 'grok',
      phase: 'hydrate',
      runtimeTerminal: null,
      restorePolicy: 'auto',
    });
    expect(intent.action).toBe('inject');
    expect(intent.command).toBe('grok');
  });

  test('resolvePanelStartupInjectIntent skips policy manual on startup-relaunch', () => {
    const intent = resolvePanelStartupInjectIntent({
      panelId: 'p1',
      panel: { id: 'p1', initialCommand: 'opencode --session x' },
      proposedCommand: 'opencode --session x',
      phase: 'startup-relaunch',
      runtimeTerminal: null,
      restorePolicy: 'manual',
    });
    expect(intent.action).toBe('skip');
    expect(intent.reason).toBe('policy-manual');
  });

  test('resolvePanelStartupInjectIntent skips policy off', () => {
    const intent = resolvePanelStartupInjectIntent({
      panelId: 'p1',
      panel: { id: 'p1', initialCommand: 'opencode' },
      proposedCommand: 'opencode --session z',
      phase: 'startup-relaunch',
      runtimeTerminal: null,
      restorePolicy: 'off',
    });
    expect(intent.action).toBe('skip');
    expect(intent.reason).toBe('policy-off');
  });

  test('startup-relaunch skips when hydrate phase already satisfied same command', () => {
    markPanelInitialCommandDispatched('p1', 'opencode --session oc-1');
    const intent = resolvePanelStartupInjectIntent({
      panelId: 'p1',
      panel: { id: 'p1', initialCommand: 'opencode --session oc-1' },
      proposedCommand: 'opencode --session oc-1',
      phase: 'startup-relaunch',
      runtimeTerminal: null,
      restorePolicy: 'auto',
    });
    expect(intent.action).toBe('skip');
    expect(intent.reason).toBe('already-dispatched');
  });
});

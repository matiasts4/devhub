const {
  PANEL_STATUS,
  normalizePanelStatus,
  derivePanelStatus,
  isTerminalRecentlyActive,
  getPanelStatusLabel,
  getPanelStatusStyle,
  shouldShowPanelStatus,
} = require('../panelStatusHelpers');

describe('panelStatusHelpers', () => {
  describe('normalizePanelStatus', () => {
    test.each([
      ['running', PANEL_STATUS.RUNNING],
      ['working', PANEL_STATUS.RUNNING],
      ['thinking', PANEL_STATUS.RUNNING],
      ['busy', PANEL_STATUS.RUNNING],
      ['active', PANEL_STATUS.ACTIVE],
      ['idle', PANEL_STATUS.IDLE],
      ['waiting', PANEL_STATUS.WAITING],
      ['pending', PANEL_STATUS.WAITING],
      ['paused', PANEL_STATUS.WAITING],
      ['connecting', PANEL_STATUS.WAITING],
      ['suspended', PANEL_STATUS.WAITING],
      ['error', PANEL_STATUS.ERROR],
      ['aborted', PANEL_STATUS.ERROR],
      ['failed', PANEL_STATUS.ERROR],
      ['disconnected', PANEL_STATUS.ERROR],
      ['terminated', PANEL_STATUS.ERROR],
      ['agent-exited', PANEL_STATUS.ERROR],
      ['completed', PANEL_STATUS.COMPLETED],
      ['succeeded', PANEL_STATUS.COMPLETED],
      ['done', PANEL_STATUS.COMPLETED],
      ['', PANEL_STATUS.UNKNOWN],
      [null, PANEL_STATUS.UNKNOWN],
      ['weird-status', PANEL_STATUS.UNKNOWN],
    ])('maps %j to %s', (input, expected) => {
      expect(normalizePanelStatus(input)).toBe(expected);
    });
  });

  describe('derivePanelStatus', () => {
    test('api status wins over connection state', () => {
      expect(
        derivePanelStatus({
          connectionState: 'connecting',
          agentRun: { selectedAgent: 'opencode' },
          apiStatus: 'running',
        })
      ).toBe(PANEL_STATUS.RUNNING);
    });

    test('falls back to connection state when no api status', () => {
      expect(
        derivePanelStatus({
          connectionState: 'connecting',
          agentRun: null,
          apiStatus: null,
        })
      ).toBe(PANEL_STATUS.WAITING);
    });

    test('no agent run and no connection state returns idle', () => {
      expect(
        derivePanelStatus({
          connectionState: null,
          agentRun: null,
          apiStatus: null,
        })
      ).toBe(PANEL_STATUS.IDLE);
    });

    test('agent run with no other signal returns active', () => {
      expect(
        derivePanelStatus({
          connectionState: null,
          agentRun: { selectedAgent: 'opencode' },
          apiStatus: null,
        })
      ).toBe(PANEL_STATUS.ACTIVE);
    });

    test('terminal connection state returns error even with agent run', () => {
      expect(
        derivePanelStatus({
          connectionState: 'agent-exited',
          agentRun: { selectedAgent: 'opencode' },
          apiStatus: null,
        })
      ).toBe(PANEL_STATUS.ERROR);
    });

    test('agent TUI command without agentRun returns active', () => {
      expect(
        derivePanelStatus({
          connectionState: null,
          agentRun: null,
          initialCommand: 'opencode --session abc-123',
          apiStatus: null,
        })
      ).toBe(PANEL_STATUS.ACTIVE);
    });

    test.each([
      ['kimi', PANEL_STATUS.ACTIVE],
      ['hermes --task fix-auth', PANEL_STATUS.ACTIVE],
      ['grok', PANEL_STATUS.ACTIVE],
      ['codex', PANEL_STATUS.ACTIVE],
      ['bash', PANEL_STATUS.IDLE],
      ['ls -la', PANEL_STATUS.IDLE],
      ['', PANEL_STATUS.IDLE],
      [null, PANEL_STATUS.IDLE],
    ])('initial command %j → %s', (initialCommand, expected) => {
      expect(
        derivePanelStatus({
          connectionState: null,
          agentRun: null,
          initialCommand,
          apiStatus: null,
        })
      ).toBe(expected);
    });

    test('recent PTY activity makes agent TUI running', () => {
      expect(
        derivePanelStatus({
          connectionState: 'connected',
          agentRun: null,
          initialCommand: 'kimi',
          apiStatus: null,
          terminalActivity: {
            lastActivityAt: new Date().toISOString(),
            isActive: true,
          },
        })
      ).toBe(PANEL_STATUS.RUNNING);
    });

    test('stale PTY activity keeps agent TUI active', () => {
      expect(
        derivePanelStatus({
          connectionState: 'connected',
          agentRun: null,
          initialCommand: 'kimi',
          apiStatus: null,
          terminalActivity: {
            lastActivityAt: new Date(Date.now() - 30000).toISOString(),
            isActive: false,
          },
        })
      ).toBe(PANEL_STATUS.ACTIVE);
    });

    test('recent PTY activity without agent command stays idle', () => {
      expect(
        derivePanelStatus({
          connectionState: 'connected',
          agentRun: null,
          initialCommand: 'bash',
          apiStatus: null,
          terminalActivity: {
            lastActivityAt: new Date().toISOString(),
            isActive: true,
          },
        })
      ).toBe(PANEL_STATUS.IDLE);
    });

    test('api status wins over recent PTY activity', () => {
      expect(
        derivePanelStatus({
          connectionState: 'connected',
          agentRun: null,
          initialCommand: 'kimi',
          apiStatus: 'completed',
          terminalActivity: {
            lastActivityAt: new Date().toISOString(),
            isActive: true,
          },
        })
      ).toBe(PANEL_STATUS.COMPLETED);
    });
  });

  describe('isTerminalRecentlyActive', () => {
    test('returns true for activity within default threshold', () => {
      expect(isTerminalRecentlyActive({ lastActivityAt: new Date().toISOString() })).toBe(true);
    });

    test('returns false for stale activity', () => {
      expect(
        isTerminalRecentlyActive(
          { lastActivityAt: new Date(Date.now() - 10000).toISOString() },
          3000
        )
      ).toBe(false);
    });

    test('returns false when lastActivityAt is missing', () => {
      expect(isTerminalRecentlyActive({})).toBe(false);
      expect(isTerminalRecentlyActive(null)).toBe(false);
    });

    test('returns false for invalid timestamp', () => {
      expect(isTerminalRecentlyActive({ lastActivityAt: 'not-a-date' })).toBe(false);
    });
  });

  describe('getPanelStatusLabel', () => {
    test.each([
      [PANEL_STATUS.RUNNING, 'Running'],
      [PANEL_STATUS.ACTIVE, 'Activo'],
      [PANEL_STATUS.WAITING, 'Esperando'],
      [PANEL_STATUS.IDLE, 'Inactivo'],
      [PANEL_STATUS.ERROR, 'Error'],
      [PANEL_STATUS.COMPLETED, 'Completado'],
      [PANEL_STATUS.UNKNOWN, 'Desconocido'],
    ])('maps %s to %s', (status, label) => {
      expect(getPanelStatusLabel(status)).toBe(label);
    });
  });

  describe('getPanelStatusStyle', () => {
    test('running pulses and is emerald', () => {
      const style = getPanelStatusStyle(PANEL_STATUS.RUNNING);
      expect(style.pulse).toBe(true);
      expect(style.dot).toContain('emerald');
    });

    test('waiting pulses and is amber', () => {
      const style = getPanelStatusStyle(PANEL_STATUS.WAITING);
      expect(style.pulse).toBe(true);
      expect(style.dot).toContain('amber');
    });

    test('error is rose and does not pulse', () => {
      const style = getPanelStatusStyle(PANEL_STATUS.ERROR);
      expect(style.pulse).toBe(false);
      expect(style.dot).toContain('rose');
    });
  });

  describe('shouldShowPanelStatus', () => {
    test('hides idle and unknown by default', () => {
      expect(shouldShowPanelStatus(PANEL_STATUS.IDLE)).toBe(false);
      expect(shouldShowPanelStatus(PANEL_STATUS.UNKNOWN)).toBe(false);
    });

    test('shows running, active, waiting, error, completed', () => {
      expect(shouldShowPanelStatus(PANEL_STATUS.RUNNING)).toBe(true);
      expect(shouldShowPanelStatus(PANEL_STATUS.ACTIVE)).toBe(true);
      expect(shouldShowPanelStatus(PANEL_STATUS.WAITING)).toBe(true);
      expect(shouldShowPanelStatus(PANEL_STATUS.ERROR)).toBe(true);
      expect(shouldShowPanelStatus(PANEL_STATUS.COMPLETED)).toBe(true);
    });

    test('alwaysShow bypasses hide logic', () => {
      expect(shouldShowPanelStatus(PANEL_STATUS.IDLE, { alwaysShow: true })).toBe(true);
    });
  });
});

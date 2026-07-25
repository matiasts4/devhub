const {
  STARTUP_RESTORE_PHASE,
  countWorkspacePanels,
  summarizeStartupRestorePlan,
  buildStartupRestoreBannerMessage,
} = require('../startupRestoreProgress');
const { RESTORE_ACTION } = require('../startupRestoreCoordinator');

describe('startupRestoreProgress', () => {
  test('countWorkspacePanels totals panels across workspaces', () => {
    expect(
      countWorkspacePanels([
        {
          id: 'ws1',
          columns: [{ panels: [{ id: 'p1' }, { id: 'p2' }] }, { panels: [{ id: 'p3' }] }],
        },
        { id: 'ws2', columns: [{ panels: [{ id: 'p4' }] }] },
      ])
    ).toBe(4);
  });

  test('summarizeStartupRestorePlan counts relaunch, reattach, and manual actions', () => {
    const summary = summarizeStartupRestorePlan([
      { action: RESTORE_ACTION.RESUME_OPENCODE_SESSION, terminalId: 'p1' },
      { action: RESTORE_ACTION.RESTORE_SHELL_EMERGENT, terminalId: 'p2' },
      { action: RESTORE_ACTION.REATTACH_LIVE_TERMINAL, terminalId: 'p3' },
      {
        action: RESTORE_ACTION.TERMINATED,
        terminalId: 'p4',
        reason: 'restore-policy-manual',
      },
    ]);

    expect(summary).toEqual({
      panelCount: 4,
      relaunchCount: 2,
      reattachCount: 1,
      manualCount: 1,
      workloadTotal: 3,
    });
  });

  test('buildStartupRestoreBannerMessage describes running relaunch progress', () => {
    expect(
      buildStartupRestoreBannerMessage({
        status: 'running',
        phase: STARTUP_RESTORE_PHASE.RELAUNCHING,
        completed: 2,
        total: 5,
        panelCount: 5,
      })
    ).toBe('Restaurando 2/5 terminales…');
  });

  test('buildStartupRestoreBannerMessage describes discovery phase', () => {
    expect(
      buildStartupRestoreBannerMessage({
        status: 'running',
        phase: STARTUP_RESTORE_PHASE.DISCOVERING,
        panelCount: 3,
      })
    ).toBe('Buscando sesiones OpenCode guardadas…');
  });

  test('buildStartupRestoreBannerMessage describes completion', () => {
    expect(
      buildStartupRestoreBannerMessage({
        status: 'done',
        completed: 5,
        total: 5,
      })
    ).toBe('Restauradas 5 de 5 terminales');
  });
});

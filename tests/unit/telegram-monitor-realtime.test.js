const {
  TELEGRAM_BUSY_POLLING_MS,
  TELEGRAM_IDLE_POLLING_MS,
  getTelegramPollingInterval,
  getWorkspaceOutcomeDisplay,
  shouldShowRealtimeBadge,
  getCurrentToolDisplay,
} = require('../../src/views/telegramMonitorRealtime');

describe('telegram monitor realtime helpers', () => {
  it('uses a 3s polling interval while the agent is busy', () => {
    expect(getTelegramPollingInterval({ is_busy: true })).toBe(TELEGRAM_BUSY_POLLING_MS);
  });

  it('uses a 30s polling interval while the agent is idle or status is missing', () => {
    expect(getTelegramPollingInterval({ is_busy: false })).toBe(TELEGRAM_IDLE_POLLING_MS);
    expect(getTelegramPollingInterval(null)).toBe(TELEGRAM_IDLE_POLLING_MS);
  });

  it('shows the EN VIVO badge only when the agent is busy', () => {
    expect(shouldShowRealtimeBadge({ is_busy: true })).toBe(true);
    expect(shouldShowRealtimeBadge({ is_busy: false })).toBe(false);
  });

  it('exposes the current tool only when one is available', () => {
    expect(getCurrentToolDisplay({ current_tool: 'bash' })).toBe('bash');
    expect(getCurrentToolDisplay({ current_tool: null })).toBe(null);
  });

  it('prefers durable workspace/run outcomes and evidence refs for downstream consumers', () => {
    expect(
      getWorkspaceOutcomeDisplay({
        workspace_status: 'conflicted',
        evidence_ref: 'evidence://workspace-conflict-1',
      })
    ).toEqual({
      workspaceStatus: 'conflicted',
      evidenceRef: 'evidence://workspace-conflict-1',
      label: 'CONFLICTED',
    });
  });

  it('hides git verbs from the realtime tool badge', () => {
    expect(getCurrentToolDisplay({ current_tool: 'git checkout -b task/sw-2-2' })).toBe(null);
    expect(getCurrentToolDisplay({ current_tool: 'worktree add .worktrees/ws-1' })).toBe(null);
  });
});

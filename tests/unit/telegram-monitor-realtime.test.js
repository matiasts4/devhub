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
        workspace_status: 'cleanup_pending',
        run_status: 'succeeded',
        terminal_reason_class: 'qa_approved',
        latest_artifact_kind: 'qa.result',
        latest_artifact_evidence_ref: 'artifact://run-1/qa/2',
        artifact_count: 2,
      })
    ).toEqual({
      workspaceStatus: 'cleanup_pending',
      runStatus: 'succeeded',
      terminalReasonClass: 'qa_approved',
      artifactKind: 'qa.result',
      artifactCount: 2,
      evidenceRef: 'artifact://run-1/qa/2',
      label: 'SUCCEEDED',
    });
  });

  it('falls back to workspace evidence when no durable artifact projection exists', () => {
    expect(
      getWorkspaceOutcomeDisplay({
        workspace_status: 'conflicted',
        evidence_ref: 'evidence://workspace-conflict-1',
      })
    ).toEqual({
      workspaceStatus: 'conflicted',
      runStatus: null,
      terminalReasonClass: null,
      artifactKind: null,
      artifactCount: 0,
      evidenceRef: 'evidence://workspace-conflict-1',
      label: 'CONFLICTED',
    });
  });

  it('hides git verbs from the realtime tool badge', () => {
    expect(getCurrentToolDisplay({ current_tool: 'git checkout -b task/sw-2-2' })).toBe(null);
    expect(getCurrentToolDisplay({ current_tool: 'worktree add .worktrees/ws-1' })).toBe(null);
  });
});

import { buildTmuxDisableStatusFragment, buildTmuxPanelAttachCommand } from '../tmuxStatusBar.js';

describe('tmuxStatusBar', () => {
  test('buildTmuxDisableStatusFragment disables global and per-session status', () => {
    const fragment = buildTmuxDisableStatusFragment('devhub-p1');
    expect(fragment).toContain('tmux set -g status off');
    expect(fragment).toContain("tmux set-option -t 'devhub-p1' status off");
  });

  test('buildTmuxPanelAttachCommand wraps new-session with status disabled', () => {
    const command = buildTmuxPanelAttachCommand('devhub-p1', '/tmp/ws');
    expect(command).toContain("tmux new-session -A -s 'devhub-p1' -c '/tmp/ws'");
    expect(command).toContain('tmux refresh-client');
  });
});

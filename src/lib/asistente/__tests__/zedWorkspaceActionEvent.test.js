/**
 * @jest-environment jsdom
 */

const {
  dispatchZedWorkspaceActionFromToolResults,
  subscribeZedWorkspaceAction,
} = require('../zedWorkspaceActionEvent');

describe('zedWorkspaceActionEvent', () => {
  test('dispatches open_restore_settings event from tool results', (done) => {
    const unsubscribe = subscribeZedWorkspaceAction((detail) => {
      expect(detail).toEqual({ action: 'open_restore_settings', section: 'terminal' });
      unsubscribe();
      done();
    });

    dispatchZedWorkspaceActionFromToolResults([
      {
        tool: 'workspace_action',
        result: { action: 'open_restore_settings', section: 'terminal' },
      },
    ]);
  });

  test('ignores non-workspace_action tools', () => {
    const handler = jest.fn();
    const unsubscribe = subscribeZedWorkspaceAction(handler);

    dispatchZedWorkspaceActionFromToolResults([
      { tool: 'open_terminal', result: { opened: true } },
    ]);

    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('ignores string results with errors', () => {
    const handler = jest.fn();
    const unsubscribe = subscribeZedWorkspaceAction(handler);

    dispatchZedWorkspaceActionFromToolResults([
      { tool: 'workspace_action', result: JSON.stringify({ error: 'invalid_action' }) },
    ]);

    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('unsubscribe removes listener', () => {
    const handler = jest.fn();
    const unsubscribe = subscribeZedWorkspaceAction(handler);
    unsubscribe();

    dispatchZedWorkspaceActionFromToolResults([
      { tool: 'workspace_action', result: { action: 'toggle_pizarra' } },
    ]);

    expect(handler).not.toHaveBeenCalled();
  });
});

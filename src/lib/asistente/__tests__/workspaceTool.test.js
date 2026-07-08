/**
 * @jest-environment node
 */

const { workspaceActionTool } = require('../tools/workspace');

describe('workspaceActionTool', () => {
  test('accepts open_restore_settings', async () => {
    const result = await workspaceActionTool.execute({ action: 'open_restore_settings' });
    expect(result).toMatchObject({
      success: true,
      action: 'open_restore_settings',
    });
  });

  test('accepts close_restore_settings', async () => {
    const result = await workspaceActionTool.execute({ action: 'close_restore_settings' });
    expect(result).toMatchObject({
      success: true,
      action: 'close_restore_settings',
    });
  });

  test('accepts toggle_pizarra', async () => {
    const result = await workspaceActionTool.execute({ action: 'toggle_pizarra' });
    expect(result).toMatchObject({
      success: true,
      action: 'toggle_pizarra',
    });
  });

  test('accepts arrange_pizarra', async () => {
    const result = await workspaceActionTool.execute({ action: 'arrange_pizarra' });
    expect(result).toMatchObject({
      success: true,
      action: 'arrange_pizarra',
    });
  });

  test('list_workspace_windows reads client context', async () => {
    const result = await workspaceActionTool.execute(
      { action: 'list_workspace_windows' },
      {
        workspace_windows: [
          { id: 'v1', name: 'V1', index: 1, active: false },
          { id: 'v2', name: 'V2', index: 2, active: true },
        ],
      }
    );
    expect(result).toMatchObject({
      success: true,
      action: 'list_workspace_windows',
      count: 2,
      active_window: { id: 'v2', index: 2, active: true },
    });
  });

  test('switch_workspace_window resolves index from context', async () => {
    const result = await workspaceActionTool.execute(
      { action: 'switch_workspace_window', window_index: 2 },
      {
        workspace_windows: [
          { id: 'v1', name: 'V1', index: 1, active: true },
          { id: 'v2', name: 'V2', index: 2, active: false },
        ],
      }
    );
    expect(result).toMatchObject({
      success: true,
      action: 'switch_workspace_window',
      window_id: 'v2',
      window_index: 2,
    });
  });

  test('switch_workspace_window errors when index missing', async () => {
    const result = await workspaceActionTool.execute(
      { action: 'switch_workspace_window', window_index: 9 },
      { workspace_windows: [{ id: 'v1', index: 1, active: true }] }
    );
    expect(result.error).toBe('window_not_found');
  });

  test('rejects invalid action', async () => {
    const result = await workspaceActionTool.execute({ action: 'invalid_action' });
    expect(result).toMatchObject({
      error: 'invalid_action',
    });
  });

  test('preserves section', async () => {
    const result = await workspaceActionTool.execute({
      action: 'open_restore_settings',
      section: 'voice',
    });
    expect(result.section).toBe('voice');
  });
});

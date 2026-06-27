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

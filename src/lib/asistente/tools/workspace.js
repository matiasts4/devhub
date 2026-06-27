/**
 * Workspace-level actions for Zed.
 *
 * These tools do not operate on terminals directly; they return a declarative
 * result that the UI dispatches via zedWorkspaceActionEvent.
 */

export const workspaceActionTool = {
  name: 'workspace_action',
  description:
    'Perform a high-level workspace UI action: open/close the terminal restore settings modal, toggle the pizarra view, or arrange the active elements on the pizarra canvas. The UI listens for these results and applies the action.',
  parameters: {
    action: {
      type: 'string',
      description:
        'Action to perform: open_restore_settings, close_restore_settings, toggle_pizarra, arrange_pizarra.',
    },
    section: {
      type: 'string',
      description:
        'Optional section/key for modals that support sub-sections (e.g. "terminal", "pizarra", "voice", "shortcuts", "agents").',
    },
  },
  async execute(params) {
    const action = typeof params?.action === 'string' ? params.action.trim() : '';
    const validActions = new Set([
      'open_restore_settings',
      'close_restore_settings',
      'toggle_pizarra',
      'arrange_pizarra',
    ]);

    if (!validActions.has(action)) {
      return { error: 'invalid_action', message: `Acción no soportada: ${action}` };
    }

    return {
      success: true,
      action,
      section: typeof params?.section === 'string' ? params.section.trim() : undefined,
      message: `Workspace action ${action} dispatched.`,
    };
  },
};

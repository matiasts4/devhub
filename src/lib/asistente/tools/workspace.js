/**
 * Workspace-level actions for Zed.
 *
 * These tools do not operate on terminals directly; they return a declarative
 * result that the UI dispatches via zedWorkspaceActionEvent.
 */

function workspaceWindowsFromContext(context) {
  const list = context?.workspace_windows;
  return Array.isArray(list) ? list : [];
}

function resolveWorkspaceWindowTarget(params, context) {
  const windows = workspaceWindowsFromContext(context);
  if (windows.length === 0) {
    return {
      error: 'no_workspace_windows',
      message: 'No hay ventanas de workspace en el contexto del cliente.',
    };
  }

  const rawIndex = params?.window_index;
  const rawId = typeof params?.window_id === 'string' ? params.window_id.trim() : '';

  if (rawIndex !== undefined && rawIndex !== null && rawIndex !== '') {
    const index = Number(rawIndex);
    if (!Number.isFinite(index) || index < 1) {
      return { error: 'invalid_window_index', message: `Índice de ventana inválido: ${rawIndex}` };
    }
    const target = windows.find((w) => Number(w.index) === index) || windows[index - 1];
    if (!target) {
      return {
        error: 'window_not_found',
        message: `No existe la ventana ${index}. Hay ${windows.length} ventana(s).`,
        windows,
      };
    }
    return { target, windows };
  }

  if (rawId) {
    const normalized = rawId.toLowerCase();
    const target =
      windows.find((w) => String(w.id).toLowerCase() === normalized) ||
      windows.find((w) => String(w.name || '').toLowerCase() === normalized);
    if (!target) {
      return {
        error: 'window_not_found',
        message: `No encontré la ventana "${rawId}".`,
        windows,
      };
    }
    return { target, windows };
  }

  return {
    error: 'missing_window_target',
    message: 'Indicá window_index (1–5) o window_id (ej. v2).',
    windows,
  };
}

export const workspaceActionTool = {
  name: 'workspace_action',
  description:
    'Perform high-level workspace UI actions: settings modal, pizarra toggle/auto-arrange, list workspace windows (V1/V2…), or switch to another workspace window by index (1–5) or id (v2). The UI applies these declaratively via client events.',
  parameters: {
    action: {
      type: 'string',
      description:
        'Action: open_restore_settings, close_restore_settings, toggle_pizarra, arrange_pizarra, list_workspace_windows, switch_workspace_window.',
    },
    section: {
      type: 'string',
      description:
        'Optional section/key for modals (e.g. "terminal", "pizarra", "voice", "shortcuts", "agents").',
    },
    window_index: {
      type: 'number',
      description:
        'For switch_workspace_window: 1-based window number (1 = V1, 2 = V2). Preferred for voice commands like "cambia a ventana 2".',
    },
    window_id: {
      type: 'string',
      description: 'For switch_workspace_window: internal id (v2) or label (V2).',
    },
  },
  async execute(params, context = {}) {
    const action = typeof params?.action === 'string' ? params.action.trim() : '';
    const validActions = new Set([
      'open_restore_settings',
      'close_restore_settings',
      'toggle_pizarra',
      'arrange_pizarra',
      'list_workspace_windows',
      'switch_workspace_window',
    ]);

    if (!validActions.has(action)) {
      return { error: 'invalid_action', message: `Acción no soportada: ${action}` };
    }

    if (action === 'list_workspace_windows') {
      const windows = workspaceWindowsFromContext(context);
      const active = windows.find((w) => w.active) || null;
      return {
        success: true,
        action,
        windows,
        active_window: active,
        count: windows.length,
        message:
          windows.length > 0
            ? `Hay ${windows.length} ventana(s); activa: ${active?.index ?? active?.name ?? 'desconocida'}.`
            : 'No hay ventanas en el contexto del workspace.',
      };
    }

    if (action === 'switch_workspace_window') {
      const resolved = resolveWorkspaceWindowTarget(params, context);
      if (resolved.error) return resolved;
      const { target, windows } = resolved;
      if (target.active) {
        return {
          success: true,
          action,
          window_id: target.id,
          window_index: target.index,
          already_active: true,
          message: `La ventana ${target.index ?? target.name ?? target.id} ya está activa.`,
        };
      }
      return {
        success: true,
        action,
        window_id: target.id,
        window_index: target.index,
        window_name: target.name,
        windows,
        message: `Cambiando a ventana ${target.index ?? target.name ?? target.id}.`,
      };
    }

    return {
      success: true,
      action,
      section: typeof params?.section === 'string' ? params.section.trim() : undefined,
      message: `Workspace action ${action} dispatched.`,
    };
  },
};

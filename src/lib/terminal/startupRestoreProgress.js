import { RESTORE_ACTION } from './startupRestoreCoordinator';
import { RELAUNCH_RESTORE_ACTIONS } from './startupRestoreRunner';

export const STARTUP_RESTORE_PHASE = Object.freeze({
  PREPARING: 'preparing',
  DISCOVERING: 'discovering',
  RELAUNCHING: 'relaunching',
  REATTACHING: 'reattaching',
  DONE: 'done',
});

export function countWorkspacePanels(workspaces = []) {
  if (!Array.isArray(workspaces)) return 0;

  return workspaces.reduce((workspaceTotal, workspace) => {
    const columns = Array.isArray(workspace?.columns) ? workspace.columns : [];
    const columnTotal = columns.reduce((sum, column) => {
      const panels = Array.isArray(column?.panels) ? column.panels : [];
      return sum + panels.length;
    }, 0);
    return workspaceTotal + columnTotal;
  }, 0);
}

export function summarizeStartupRestorePlan(actions = []) {
  const safeActions = Array.isArray(actions) ? actions : [];

  const relaunchActions = safeActions.filter((action) =>
    RELAUNCH_RESTORE_ACTIONS.has(action?.action)
  );
  const reattachActions = safeActions.filter(
    (action) =>
      action?.action === RESTORE_ACTION.REATTACH_LIVE_TERMINAL ||
      action?.action === RESTORE_ACTION.RESTORE_READY
  );
  const manualActions = safeActions.filter(
    (action) =>
      action?.action === RESTORE_ACTION.TERMINATED &&
      action?.reason === 'restore-policy-manual'
  );

  const workloadTotal = relaunchActions.length + reattachActions.length;

  return {
    panelCount: safeActions.length,
    relaunchCount: relaunchActions.length,
    reattachCount: reattachActions.length,
    manualCount: manualActions.length,
    workloadTotal: workloadTotal > 0 ? workloadTotal : safeActions.length,
  };
}

export function buildStartupRestoreBannerMessage(progress = null) {
  if (!progress || typeof progress !== 'object') return null;

  const {
    status,
    phase,
    completed = 0,
    total = 0,
    panelCount = 0,
    manualCount = 0,
  } = progress;

  if (status === 'done') {
    if (total > 0) {
      return `Restauradas ${completed} de ${total} terminales`;
    }
    if (manualCount > 0) {
      return `${manualCount} sesión(es) en pausa — continuá manualmente`;
    }
    if (panelCount > 0) {
      return `${panelCount} terminales listas`;
    }
    return 'Terminales listas';
  }

  if (status !== 'running') return null;

  if (phase === STARTUP_RESTORE_PHASE.DISCOVERING) {
    return 'Buscando sesiones OpenCode guardadas…';
  }
  if (phase === STARTUP_RESTORE_PHASE.REATTACHING) {
    return total > 0
      ? `Reconectando ${completed}/${total} terminales…`
      : 'Reconectando terminales…';
  }
  if (total > 0) {
    return `Restaurando ${completed}/${total} terminales…`;
  }
  if (panelCount > 0) {
    return `Preparando ${panelCount} terminales…`;
  }
  return 'Restaurando terminales…';
}
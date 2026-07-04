/**
 * useWorkspaceLayoutState — reducer consolidating core workspace layout state.
 * Extracted from TerminalWorkspacesManager.jsx.
 */

import { useCallback, useReducer } from 'react';

export const LAYOUT_ACTION = {
  SET_WORKSPACES: 'SET_WORKSPACES',
  SET_ACTIVE_WS_ID: 'SET_ACTIVE_WS_ID',
  SET_ACTIVE_PANEL_IDS: 'SET_ACTIVE_PANEL_IDS',
  SET_FOCUSED_PANEL_BY_WORKSPACE: 'SET_FOCUSED_PANEL_BY_WORKSPACE',
  SELECT_WORKSPACE: 'SELECT_WORKSPACE',
  SET_FOCUSED_PANEL: 'SET_FOCUSED_PANEL',
  REMOVE_WORKSPACE: 'REMOVE_WORKSPACE',
  ADD_WORKSPACE: 'ADD_WORKSPACE',
};

function applyUpdater(current, updaterOrValue) {
  if (typeof updaterOrValue === 'function') {
    return updaterOrValue(current);
  }
  return updaterOrValue;
}

export function workspaceLayoutReducer(state, action) {
  switch (action.type) {
    case LAYOUT_ACTION.SET_WORKSPACES: {
      const workspaces = applyUpdater(state.workspaces, action.updater ?? action.workspaces);
      return workspaces === state.workspaces ? state : { ...state, workspaces };
    }
    case LAYOUT_ACTION.SET_ACTIVE_WS_ID: {
      const activeWsId = applyUpdater(state.activeWsId, action.updater ?? action.activeWsId);
      return activeWsId === state.activeWsId ? state : { ...state, activeWsId };
    }
    case LAYOUT_ACTION.SET_ACTIVE_PANEL_IDS: {
      const activePanelIds = applyUpdater(
        state.activePanelIds,
        action.updater ?? action.activePanelIds
      );
      return activePanelIds === state.activePanelIds ? state : { ...state, activePanelIds };
    }
    case LAYOUT_ACTION.SET_FOCUSED_PANEL_BY_WORKSPACE: {
      const focusedPanelByWorkspace = applyUpdater(
        state.focusedPanelByWorkspace,
        action.updater ?? action.focusedPanelByWorkspace
      );
      return focusedPanelByWorkspace === state.focusedPanelByWorkspace
        ? state
        : { ...state, focusedPanelByWorkspace };
    }
    case LAYOUT_ACTION.SELECT_WORKSPACE: {
      const wsId = action.wsId;
      if (!wsId || state.activeWsId === wsId) return state;
      return { ...state, activeWsId: wsId };
    }
    case LAYOUT_ACTION.SET_FOCUSED_PANEL: {
      const { wsId, panelId } = action;
      if (!wsId) return state;
      if (!panelId) {
        if (!state.focusedPanelByWorkspace[wsId]) return state;
        const next = { ...state.focusedPanelByWorkspace };
        delete next[wsId];
        return { ...state, focusedPanelByWorkspace: next };
      }
      if (state.focusedPanelByWorkspace[wsId] === panelId) return state;
      return {
        ...state,
        focusedPanelByWorkspace: { ...state.focusedPanelByWorkspace, [wsId]: panelId },
      };
    }
    case LAYOUT_ACTION.REMOVE_WORKSPACE: {
      const wsId = action.wsId;
      if (!wsId) return state;
      const workspaces = state.workspaces.filter((ws) => ws.id !== wsId);
      if (workspaces.length === state.workspaces.length) return state;
      const activePanelIds = { ...state.activePanelIds };
      delete activePanelIds[wsId];
      const focusedPanelByWorkspace = { ...state.focusedPanelByWorkspace };
      delete focusedPanelByWorkspace[wsId];
      let activeWsId = state.activeWsId;
      if (activeWsId === wsId) {
        activeWsId = workspaces[0]?.id || null;
      }
      return { ...state, workspaces, activeWsId, activePanelIds, focusedPanelByWorkspace };
    }
    case LAYOUT_ACTION.ADD_WORKSPACE: {
      const workspace = action.workspace;
      if (!workspace?.id) return state;
      return {
        ...state,
        workspaces: [...state.workspaces, workspace],
        activeWsId: action.select ? workspace.id : state.activeWsId,
      };
    }
    default:
      return state;
  }
}

export default function useWorkspaceLayoutState({
  initialWorkspaces,
  initialActiveWsId,
  initialActivePanelIds,
  initialFocusedPanelByWorkspace = {},
}) {
  const [layoutState, dispatchLayout] = useReducer(workspaceLayoutReducer, {
    workspaces: initialWorkspaces,
    activeWsId: initialActiveWsId,
    activePanelIds: initialActivePanelIds,
    focusedPanelByWorkspace: initialFocusedPanelByWorkspace,
  });

  const setWorkspaces = useCallback((updater) => {
    dispatchLayout({ type: LAYOUT_ACTION.SET_WORKSPACES, updater });
  }, []);

  const setActiveWsId = useCallback((updater) => {
    dispatchLayout({ type: LAYOUT_ACTION.SET_ACTIVE_WS_ID, updater });
  }, []);

  const setActivePanelIds = useCallback((updater) => {
    dispatchLayout({ type: LAYOUT_ACTION.SET_ACTIVE_PANEL_IDS, updater });
  }, []);

  const setFocusedPanelByWorkspace = useCallback((updater) => {
    dispatchLayout({ type: LAYOUT_ACTION.SET_FOCUSED_PANEL_BY_WORKSPACE, updater });
  }, []);

  return {
    layoutState,
    dispatchLayout,
    workspaces: layoutState.workspaces,
    activeWsId: layoutState.activeWsId,
    activePanelIds: layoutState.activePanelIds,
    focusedPanelByWorkspace: layoutState.focusedPanelByWorkspace,
    setWorkspaces,
    setActiveWsId,
    setActivePanelIds,
    setFocusedPanelByWorkspace,
  };
}

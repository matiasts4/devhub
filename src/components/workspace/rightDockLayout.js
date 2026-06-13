/* global module */

/** Workspace tools that share one pane (mutually exclusive). */
const WORKSPACE_DOCK_TABS = ['browser', 'editor', 'swarm', 'operator'];

function isWorkspaceDockTab(tab) {
  return WORKSPACE_DOCK_TABS.includes(tab);
}

function isRightDockWorkspacePaneVisible(dockState = {}) {
  if (dockState.visible !== true) return false;
  if (dockState.maximized === true && dockState.maximizedView === 'pizarra') return false;
  return isWorkspaceDockTab(dockState.activeTab);
}

/**
 * Apply a right-dock tab click. Workspace tabs replace each other.
 *
 * @param {object} currentState
 * @param {string} tab
 * @returns {object}
 */
function applyRightDockTabSelect(currentState, tab) {
  const state = currentState || {};

  if (tab === 'pizarra') {
    const isCurrentlyPizarra = state.maximized && state.maximizedView === 'pizarra';
    const nextEpoch = (Number(state.browserLayoutEpoch) || 0) + 1;
    if (isCurrentlyPizarra) {
      return {
        ...state,
        visible: false,
        maximized: false,
        maximizedView: 'browser',
        browserLayoutEpoch: nextEpoch,
      };
    }
    return {
      ...state,
      visible: true,
      activeTab: 'pizarra',
      maximized: true,
      maximizedView: 'pizarra',
      browserLayoutEpoch: nextEpoch,
    };
  }

  if (tab === 'zed') {
    return state;
  }

  if (isWorkspaceDockTab(tab)) {
    const sameWorkspaceTab =
      state.activeTab === tab && state.visible && isRightDockWorkspacePaneVisible(state);
    if (sameWorkspaceTab) {
      return { ...state, visible: false };
    }
    return {
      ...state,
      visible: true,
      activeTab: tab,
      maximized: false,
      maximizedView: tab,
    };
  }

  return state;
}

/**
 * Merge open_url focus navigation: enter pizarra canvas and surface the browser
 * there (auto-layout picks up terminals + browser card).
 *
 * @param {object} currentState
 * @param {object} [options]
 * @param {boolean} [options.focus]
 * @returns {object}
 */
function applyZedOpenUrlDockFocus(currentState, { focus = false } = {}) {
  if (focus !== true) return currentState;
  const state = currentState || {};
  const nextEpoch = (Number(state.browserLayoutEpoch) || 0) + 1;
  if (state.maximized && state.maximizedView === 'pizarra') {
    return {
      ...state,
      visible: true,
      activeTab: 'pizarra',
      browserLayoutEpoch: nextEpoch,
    };
  }
  return {
    ...state,
    visible: true,
    activeTab: 'pizarra',
    maximized: true,
    maximizedView: 'pizarra',
    browserLayoutEpoch: nextEpoch,
  };
}

/**
 * Apply URL navigation from `devhub:zed-open-url`. When focus is true, enters
 * pizarra mode and registers the URL for the workspace browser surface.
 *
 * @param {object} currentState
 * @param {{ url: string, focus?: boolean }} detail
 * @returns {object}
 */
function applyZedOpenUrlDockUpdate(currentState, { url, focus = false } = {}) {
  const state = currentState || {};
  const nextHistory = [...(state.browserHistory ?? []), url];
  const base = {
    ...state,
    browserUrl: url,
    browserHistory: nextHistory,
    browserHistoryIndex: nextHistory.length - 1,
  };
  if (focus !== true) return base;
  return applyZedOpenUrlDockFocus(base, { focus: true });
}

/**
 * Dock state after selecting a workspace window (V1, V2…).
 * Pizarra stays in pizarra — switching views must not bump to normal/window mode.
 *
 * @param {object} currentState
 * @returns {object}
 */
function applyWorkspaceWindowSelectDockState(currentState = {}) {
  if (currentState.maximized !== true) return currentState;
  if (currentState.maximizedView === 'pizarra') return currentState;
  return {
    ...currentState,
    visible: true,
    maximized: true,
    maximizedView: 'window',
  };
}

module.exports = {
  WORKSPACE_DOCK_TABS,
  applyRightDockTabSelect,
  applyZedOpenUrlDockFocus,
  applyZedOpenUrlDockUpdate,
  applyWorkspaceWindowSelectDockState,
  isRightDockWorkspacePaneVisible,
  isWorkspaceDockTab,
};

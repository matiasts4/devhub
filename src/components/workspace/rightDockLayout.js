/* global module */

/** Workspace tools that share one pane (mutually exclusive). */
const WORKSPACE_DOCK_TABS = ['browser', 'editor', 'swarm', 'operator'];

const DEFAULT_ZED_SPLIT_PERCENT = 42;

function isWorkspaceDockTab(tab) {
  return WORKSPACE_DOCK_TABS.includes(tab);
}

function isRightDockWorkspacePaneVisible(dockState = {}) {
  if (dockState.visible !== true) return false;
  if (dockState.maximized === true && dockState.maximizedView === 'pizarra') return false;
  return isWorkspaceDockTab(dockState.activeTab);
}

function isRightDockZedPaneVisible(dockState = {}) {
  if (dockState.visible !== true) return false;
  if (dockState.maximized === true && dockState.maximizedView === 'pizarra') return false;
  return dockState.zedVisible === true || dockState.activeTab === 'zed';
}

function isRightDockSplitLayout(dockState = {}) {
  return isRightDockWorkspacePaneVisible(dockState) && isRightDockZedPaneVisible(dockState);
}

/**
 * Apply a right-dock tab click. Zed stacks with browser/editor/swarm; workspace
 * tabs replace each other but do not hide Zed unless the user toggles Z off.
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
      // switching *off* pizarra → normal view becomes the host for the browser.
      // bump epoch so the dock's WorkspaceBrowserPane (and its iframe/native content)
      // re-syncs the latest tabs/url from the shared state (the one the pizarra card was using).
      // Helps "no se cargó la vida" on switch.
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
    const zedOn = isRightDockZedPaneVisible(state);
    const workspaceOn = isRightDockWorkspacePaneVisible(state);

    if (zedOn && workspaceOn) {
      return { ...state, zedVisible: false, activeTab: state.activeTab };
    }
    if (zedOn && !workspaceOn) {
      return {
        ...state,
        visible: false,
        zedVisible: false,
        activeTab: 'browser',
      };
    }
    return {
      ...state,
      visible: true,
      zedVisible: true,
      activeTab: workspaceOn ? state.activeTab : 'zed',
    };
  }

  if (isWorkspaceDockTab(tab)) {
    const sameWorkspaceTab = state.activeTab === tab && state.visible && isRightDockWorkspacePaneVisible(state);
    if (sameWorkspaceTab && isRightDockZedPaneVisible(state)) {
      return {
        ...state,
        activeTab: 'zed',
        maximized: false,
        maximizedView: 'zed',
      };
    }
    if (sameWorkspaceTab) {
      return { ...state, visible: false };
    }
    const keepZed = state.zedVisible === true || state.activeTab === 'zed';
    return {
      ...state,
      visible: true,
      activeTab: tab,
      maximized: false,
      maximizedView: tab,
      zedVisible: keepZed,
    };
  }

  return state;
}

/**
 * Merge open_url focus navigation: show browser, keep Zed visible when it was open.
 *
 * @param {object} currentState
 * @param {object} [options]
 * @param {boolean} [options.focus]
 * @returns {object}
 */
function applyZedOpenUrlDockFocus(currentState, { focus = false } = {}) {
  if (focus !== true) return currentState;
  const state = currentState || {};
  return {
    ...state,
    visible: true,
    activeTab: 'browser',
    zedVisible: true,
    maximized: false,
    maximizedView: 'browser',
    browserLayoutEpoch: (Number(state.browserLayoutEpoch) || 0) + 1,
  };
}

/**
 * Apply URL navigation from `devhub:zed-open-url`. When focus is true, opens the
 * browser dock automatically (even if only Zed was visible).
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

module.exports = {
  DEFAULT_ZED_SPLIT_PERCENT,
  WORKSPACE_DOCK_TABS,
  applyRightDockTabSelect,
  applyZedOpenUrlDockFocus,
  applyZedOpenUrlDockUpdate,
  isRightDockSplitLayout,
  isRightDockWorkspacePaneVisible,
  isRightDockZedPaneVisible,
  isWorkspaceDockTab,
};
/**
 * useWorkspaceAgentActivity — per-workspace aggregate agent activity.
 *
 * The top workspace tab strip needs to know, for each workspace, whether any
 * of its terminal panels currently has an *agent* doing work. This hook folds
 * the per-panel semantic agent-TUI state into a single
 * `{ [workspaceId]: 'running' | 'blocked' | null }` map.
 *
 * IMPORTANT: the signal is agent-exclusive. It only reads the semantic state
 * populated by `agent-state` WS frames, which the server emits solely for
 * detected agent TUIs (kimi, opencode, qodercli, claude, codex, hermes, agy…).
 * A plain command (e.g. a dev server) never produces those frames, so it must
 * NOT light the indicator — raw PTY output is deliberately ignored here.
 *
 * It subscribes to the module-level semantic store with a single
 * `useSyncExternalStore` (a version counter is the snapshot, so Object.is is
 * stable and we avoid per-panel hook calls, which would break the rules of
 * hooks as panels come and go).
 */

import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  getPanelSemanticState,
  subscribePanelSemanticState,
} from '../utils/panelSemanticStateStore';

const STATE_PRIORITY = { running: 2, blocked: 1 };

/**
 * Resolve a single panel's agent state from the semantic agent-TUI store.
 * Only agent panels ever have a semantic state (see module note), so this is
 * inherently agent-exclusive.
 * @returns {'running'|'blocked'|null}
 */
function resolvePanelAgentState(panelId) {
  const semantic = getPanelSemanticState(panelId);
  const semanticState = semantic?.agentTuiState || null;
  if (semanticState === 'running') return 'running';
  if (semanticState === 'blocked') return 'blocked';
  return null;
}

/**
 * Enumerate every panel id per workspace, including panels that live inside
 * dedicated workspace windows (V1/V2) when present.
 * @returns {Map<string, string[]>} workspaceId -> panelIds
 */
function collectWorkspacePanelIds(workspaces, workspaceWindows) {
  const byWorkspace = new Map();
  for (const ws of workspaces) {
    const windows = workspaceWindows?.[ws.id] || [];
    const columnSources =
      windows.length > 0 ? windows.flatMap((win) => win.columns || []) : ws.columns || [];
    const ids = [];
    for (const column of columnSources) {
      for (const panel of column.panels || []) {
        if (panel?.id) ids.push(panel.id);
      }
    }
    byWorkspace.set(ws.id, ids);
  }
  return byWorkspace;
}

/**
 * @param {Array} workspaces
 * @param {object} [workspaceWindows]
 * @returns {{ [workspaceId: string]: 'running'|'blocked'|null }}
 */
export default function useWorkspaceAgentActivity(workspaces, workspaceWindows) {
  const panelIdsByWorkspace = useMemo(
    () => collectWorkspacePanelIds(workspaces, workspaceWindows),
    [workspaces, workspaceWindows]
  );

  // Stable subscription key: only re-subscribe when the *set* of panels
  // changes, not when workspaces are reordered (the joined sorted string is
  // order-independent).
  const allPanelIdsKey = useMemo(() => {
    const set = new Set();
    for (const ids of panelIdsByWorkspace.values()) {
      for (const id of ids) set.add(id);
    }
    return [...set].sort().join('|');
  }, [panelIdsByWorkspace]);

  const versionRef = useRef(0);
  const subscribe = useCallback(
    (onChange) => {
      const ids = allPanelIdsKey ? allPanelIdsKey.split('|') : [];
      const bump = () => {
        versionRef.current += 1;
        onChange();
      };
      const unsubs = [];
      for (const pid of ids) {
        unsubs.push(subscribePanelSemanticState(pid, bump));
      }
      return () => {
        for (const unsub of unsubs) unsub();
      };
    },
    [allPanelIdsKey]
  );
  const getSnapshot = useCallback(() => versionRef.current, []);
  const version = useSyncExternalStore(subscribe, getSnapshot, () => 0);

  return useMemo(() => {
    const result = {};
    for (const [wsId, ids] of panelIdsByWorkspace.entries()) {
      let best = null;
      let bestPriority = 0;
      for (const pid of ids) {
        const state = resolvePanelAgentState(pid);
        if (!state) continue;
        const priority = STATE_PRIORITY[state] || 0;
        if (priority > bestPriority) {
          bestPriority = priority;
          best = state;
        }
        if (best === 'running') break;
      }
      result[wsId] = best;
    }
    return result;
    // `version` forces recomputation whenever any subscribed panel changes.
  }, [panelIdsByWorkspace, version]);
}

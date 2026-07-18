/**
 * Ensure a Files space panel exists and is focused when `devhub:open-file` fires.
 * FileExplorerEditorPane performs the actual load (live listener + pending consume).
 */

import { useEffect, useRef } from 'react';
import {
  OPEN_FILE_EVENT,
  isValidOpenFileEvent,
  reservePendingOpenFile,
} from '@/lib/workspace/openFileEvent';
import {
  getPanelsFromColumns,
  normalizePanelKind,
} from '@/components/terminal/models/workspaceStateModel';

/**
 * @param {object} params
 * @param {string|null|undefined} params.activeWsId
 * @param {React.MutableRefObject} params.activeWsIdRef
 * @param {React.MutableRefObject} params.workspacesRef
 * @param {React.MutableRefObject} [params.workspaceWindowsRef]
 * @param {React.MutableRefObject} [params.activeWindowIdsRef]
 * @param {(kind: string, sourcePanelId?: string|null, direction?: string) => string|null|undefined} params.splitWithKind
 * @param {(wsId: string, panelId: string) => void} [params.activateWorkspacePanel]
 * @param {(wsId: string, panelId: string) => void} [params.setFocusedPanelByWorkspace]
 * @param {(fn: (prev: object) => object) => void} [params.setActivePanelIds]
 */
export default function useOpenFileInWorkspace({
  activeWsId,
  activeWsIdRef,
  workspacesRef,
  workspaceWindowsRef = null,
  activeWindowIdsRef = null,
  splitWithKind,
  activateWorkspacePanel,
  setFocusedPanelByWorkspace,
  setActivePanelIds,
}) {
  const splitWithKindRef = useRef(splitWithKind);
  splitWithKindRef.current = splitWithKind;
  const activateRef = useRef(activateWorkspacePanel);
  activateRef.current = activateWorkspacePanel;
  const focusRef = useRef(setFocusedPanelByWorkspace);
  focusRef.current = setFocusedPanelByWorkspace;
  const setActivePanelIdsRef = useRef(setActivePanelIds);
  setActivePanelIdsRef.current = setActivePanelIds;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const findFilesPanelId = (wsId) => {
      const ws = (workspacesRef.current || []).find((entry) => entry?.id === wsId);
      if (!ws) return null;

      const windows = workspaceWindowsRef?.current?.[wsId];
      const activeWinId = activeWindowIdsRef?.current?.[wsId];
      let columns = ws.columns || [];
      if (Array.isArray(windows) && windows.length > 0) {
        const activeWin = windows.find((w) => w?.id === activeWinId) || windows[0];
        if (activeWin?.columns?.length) columns = activeWin.columns;
      }

      const panels = getPanelsFromColumns(columns);
      const filesPanel = panels.find((p) => normalizePanelKind(p?.kind) === 'files');
      return filesPanel?.id || null;
    };

    const handleOpenFile = (event) => {
      const detail = event?.detail;
      if (!isValidOpenFileEvent(detail)) return;

      const wsId = activeWsIdRef?.current || activeWsId;
      if (!wsId) return;

      reservePendingOpenFile(wsId, detail);
      // Also reserve a global key so explorer can consume even if workspace id remaps
      reservePendingOpenFile(`project:${wsId}`, detail);

      let filesPanelId = findFilesPanelId(wsId);
      if (!filesPanelId && typeof splitWithKindRef.current === 'function') {
        filesPanelId = splitWithKindRef.current('files') || null;
      }
      if (!filesPanelId) return;

      if (typeof activateRef.current === 'function') {
        activateRef.current(wsId, filesPanelId);
      } else if (typeof setActivePanelIdsRef.current === 'function') {
        setActivePanelIdsRef.current((prev) => ({ ...prev, [wsId]: filesPanelId }));
      }
      if (typeof focusRef.current === 'function') {
        focusRef.current(wsId, filesPanelId);
      }
    };

    window.addEventListener(OPEN_FILE_EVENT, handleOpenFile);
    return () => window.removeEventListener(OPEN_FILE_EVENT, handleOpenFile);
  }, [activeWsId, activeWsIdRef, workspacesRef, workspaceWindowsRef, activeWindowIdsRef]);
}

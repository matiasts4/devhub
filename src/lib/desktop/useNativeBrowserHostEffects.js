'use client';

import { useEffect, useRef } from 'react';
import {
  hideAllNativeBrowsers,
  isNativeBrowserRuntimeAvailable,
  showNativeBrowsersForWorkspace,
} from '@/lib/browser/nativeBrowserBridge';
import {
  buildHideAllPayload,
  buildWorkspaceVisibilityPayload,
  shouldHideBrowsersForOverlay,
} from '@/lib/desktop/browserOverlays';

/**
 * Host-level native browser effects (Host policy: filter, don't thrash).
 *
 * Workspace switch: ONE call to showWorkspace (strict filter).
 * Do NOT hideAll first — that blanks every panel and causes multi-flash.
 *
 * Overlay (modal): hideAll soft; restore with showWorkspace.
 */
export function useNativeBrowserHostEffects({
  workspaceId = null,
  modalOpen = false,
  commandPaletteOpen = false,
} = {}) {
  const lastOverlayHidden = useRef(false);
  const lastWorkspaceId = useRef(undefined);

  // Electron path uses DOM <webview> — no main-process browser panels to manage.
  const usesDomWebview =
    typeof window !== 'undefined' &&
    window.__DEVHUB_FORCE_DOM_WEBVIEW__ === true &&
    window.devhubDesktop?.isElectron === true;

  useEffect(() => {
    if (usesDomWebview) return undefined;
    if (!isNativeBrowserRuntimeAvailable()) return undefined;

    const hide = shouldHideBrowsersForOverlay({ modalOpen, commandPaletteOpen });
    if (hide) {
      lastOverlayHidden.current = true;
      hideAllNativeBrowsers(buildHideAllPayload({ reason: 'overlay' })).catch(() => {});
    } else if (lastOverlayHidden.current) {
      lastOverlayHidden.current = false;
      showNativeBrowsersForWorkspace(buildWorkspaceVisibilityPayload(workspaceId)).catch(() => {});
    }
    return undefined;
  }, [modalOpen, commandPaletteOpen, usesDomWebview, workspaceId]);

  useEffect(() => {
    if (usesDomWebview) return undefined;
    if (!isNativeBrowserRuntimeAvailable()) return undefined;
    if (lastWorkspaceId.current === workspaceId) return undefined;
    lastWorkspaceId.current = workspaceId;
    if (lastOverlayHidden.current) return undefined;

    // Single filter pass — matching panels stay visible, others setVisible(false).
    showNativeBrowsersForWorkspace(buildWorkspaceVisibilityPayload(workspaceId)).catch(() => {});
    return undefined;
  }, [usesDomWebview, workspaceId]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (usesDomWebview) return undefined;
    if (!isNativeBrowserRuntimeAvailable()) return undefined;

    const onOverlay = (event) => {
      const detail = event?.detail || {};
      const hide = shouldHideBrowsersForOverlay({
        modalOpen: detail.modalOpen,
        commandPaletteOpen: detail.commandPaletteOpen,
      });
      if (hide) {
        lastOverlayHidden.current = true;
        hideAllNativeBrowsers(
          buildHideAllPayload({ reason: detail.reason || 'overlay-event' })
        ).catch(() => {});
      } else if (lastOverlayHidden.current) {
        lastOverlayHidden.current = false;
        showNativeBrowsersForWorkspace(
          buildWorkspaceVisibilityPayload(detail.workspaceId ?? workspaceId)
        ).catch(() => {});
      }
    };

    const onWorkspace = (event) => {
      const id = event?.detail?.workspaceId ?? null;
      if (lastWorkspaceId.current === id) return;
      lastWorkspaceId.current = id;
      if (lastOverlayHidden.current) return;
      // One filter call only — never hideAll+show (that flashed 2–3 times).
      showNativeBrowsersForWorkspace(buildWorkspaceVisibilityPayload(id)).catch(() => {});
    };

    window.addEventListener('devhub:browser-overlay', onOverlay);
    window.addEventListener('devhub:browser-workspace', onWorkspace);
    return () => {
      window.removeEventListener('devhub:browser-overlay', onOverlay);
      window.removeEventListener('devhub:browser-workspace', onWorkspace);
    };
  }, [usesDomWebview, workspaceId]);
}

export default useNativeBrowserHostEffects;

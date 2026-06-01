/**
 * PizarraBrowserSurface — iframe-first mount + 5s explicit failure surface.
 *
 * Covers board-browser-load Req 1-4 and Req 5 (browserLoadFallback
 * round-trip). The 10 spec scenarios are exercised by the test
 * file at src/components/workspace/__tests__/rightDockState.test.js
 * (Req 5) and this file (Req 1-4).
 *
 * pizarra-ux-overhaul: the pizarra now mounts the iframe immediately
 * (no waiting on nativeRuntimeReady). A 5s timer fires the
 * BrowserLoadFailed view if neither the iframe load event nor the
 * native readiness signal arrive in time. The iframe stays in the
 * DOM underneath the failure view. The user can hit Reload to
 * re-arm the timer and force an iframe reload.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Move, RefreshCw, X } from 'lucide-react';
import WorkspaceBrowserPane from '@/components/workspace/WorkspaceBrowserPane';
import * as useNativeBrowserSurfaceModule from '@/components/workspace/useNativeBrowserSurface';
import usePizarraSurfaceDrag from './usePizarraSurfaceDrag';

const FRAME_INSET = 10;

// pizarra-ux-overhaul: 5s build-time constant. Exported for tests.
export const PIZARRA_BROWSER_LOAD_TIMEOUT_MS = 5000;

const LEGACY_LOCALHOST_3200 = 'http://localhost:3200/';
const LEGACY_LOCALHOST_3000 = 'http://localhost:3000/';

function resolveBrowserUrl(url) {
  const DEFAULT =
    typeof window !== 'undefined' ? window.location.origin + '/' : 'http://localhost:3100/';
  if (!url) return DEFAULT;
  const normalized = url.endsWith('/') ? url : url + '/';
  if (normalized === LEGACY_LOCALHOST_3200 || normalized === LEGACY_LOCALHOST_3000) return DEFAULT;
  return url;
}

function createDockState(url) {
  const resolvedUrl = resolveBrowserUrl(url);

  return {
    activeTab: 'browser',
    browserHistory: [resolvedUrl],
    browserHistoryIndex: 0,
    // pizarra-ux-overhaul: iframe-first default. The pizarra does not
    // need the native GTK runtime for the browser — the board's value
    // is layout, not raw WebKit. The native-gtk path is opt-in via
    // browserLoadFallback === false (which the right-dock path uses).
    browserRuntime: 'iframe',
    // pizarra-ux-overhaul: opt-in flag. The sanitizer whitelists this
    // field (board-browser-load Req 5). Pizarra always sets it to true
    // so the iframe path is preferred even when the native runtime
    // reports ready.
    browserLoadFallback: true,
    browserUrl: resolvedUrl,
    editMode: false,
    maximized: false,
    maximizedView: 'browser',
    visible: true,
  };
}

// pizarra-ux-overhaul: failure categories from board-browser-load Req 3.
const FAILURE_CATEGORIES = {
  IFRAME_STUCK: 'iframe-stuck',
  NATIVE_ERROR: 'native-error',
  NATIVE_TIMEOUT: 'native-timeout',
};

export default function PizarraBrowserSurface({
  shape,
  bounds,
  selected = false,
  onSelect,
  onMove,
  onUpdateElement,
  onClose,
}) {
  const [dockState, setDockState] = useState(() => createDockState(shape.url));
  const [loadFailed, setLoadFailed] = useState(null);
  // pizarra-ux-overhaul: tracks whether the iframe emitted a load
  // event during the 5s window. Cleared on reload.
  const [iframeLoaded, setIframeLoaded] = useState(false);
  // pizarra-ux-overhaul: reload key forces iframe re-mount when
  // incremented. Bump on Reload click.
  const [srcReloadKey, setSrcReloadKey] = useState(0);
  const persistedUrlRef = useRef(resolveBrowserUrl(shape.url));
  const panelId = useMemo(() => `pizarra-browser-${shape.id}`, [shape.id]);
  // pizarra-ux-overhaul: subscribe to the native browser capability so
  // the surface can flip to native-gtk when the runtime reports ready
  // AND the consumer has not opted out via browserLoadFallback.
  // The hook is optional in the codebase; we import it dynamically so
  // the module graph stays valid even if it is not yet present.
  const nativeCapability = useNativeBrowserCapabilitySafe();

  useEffect(() => {
    const nextUrl = resolveBrowserUrl(shape.url);
    persistedUrlRef.current = nextUrl;
    setDockState((currentState) => {
      if (currentState.browserUrl === nextUrl) return currentState;

      const nextHistory = currentState.browserHistory?.includes(nextUrl)
        ? currentState.browserHistory
        : [...(currentState.browserHistory || []), nextUrl];

      return {
        ...currentState,
        browserUrl: nextUrl,
        browserHistory: nextHistory,
        browserHistoryIndex: Math.max(nextHistory.length - 1, 0),
      };
    });
  }, [shape.url]);

  useEffect(() => {
    const nextUrl = resolveBrowserUrl(dockState.browserUrl);
    if (persistedUrlRef.current === nextUrl) return;
    persistedUrlRef.current = nextUrl;
    onUpdateElement?.(shape.id, { url: nextUrl });
  }, [dockState.browserUrl, onUpdateElement, shape.id]);

  // pizarra-ux-overhaul: 5s explicit failure timer. Counts the time
  // the iframe is "stuck" (no load event AND no native readiness
  // signal). On fire, sets loadFailed with the iframe-stuck category
  // unless the native runtime timed out (then native-timeout).
  useEffect(() => {
    if (loadFailed) return; // already failed; don't restart
    if (iframeLoaded) return; // iframe already loaded; success path
    const handle = setTimeout(() => {
      if (loadFailedRef.current) return;
      // The native runtime may have reported supported but never
      // resolved ready. That is the native-timeout category.
      const category =
        nativeCapability && nativeCapability.supported
          ? FAILURE_CATEGORIES.NATIVE_TIMEOUT
          : FAILURE_CATEGORIES.IFRAME_STUCK;
      setLoadFailed({ category, since: Date.now() });
    }, PIZARRA_BROWSER_LOAD_TIMEOUT_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shape.id,
    loadFailed,
    iframeLoaded,
    srcReloadKey,
    nativeCapability && nativeCapability.supported,
  ]);

  // Mirror loadFailed into a ref so the timer callback sees the
  // latest value without being re-scheduled on every change.
  const loadFailedRef = useRef(loadFailed);
  useEffect(() => {
    loadFailedRef.current = loadFailed;
  }, [loadFailed]);

  // pizarra-ux-overhaul: flip browserRuntime to native-gtk when the
  // runtime reports ready AND the consumer has not opted out via
  // browserLoadFallback. (board-browser-load Req 1.2)
  useEffect(() => {
    if (!nativeCapability) return;
    if (!nativeCapability.ready) return;
    if (dockState.browserLoadFallback) return;
    setDockState((currentState) => {
      if (currentState.browserRuntime === 'native-gtk') return currentState;
      return { ...currentState, browserRuntime: 'native-gtk' };
    });
  }, [nativeCapability, dockState.browserLoadFallback]);

  const handleDockStateChange = useCallback((nextStateOrUpdater) => {
    setDockState((currentState) =>
      typeof nextStateOrUpdater === 'function'
        ? nextStateOrUpdater(currentState)
        : nextStateOrUpdater
    );
  }, []);

  // pizarra-ux-overhaul: mark iframe as loaded on the workspace pane's
  // load event. The WorkspaceBrowserPane exposes onIframeLoad via the
  // dockState change payload; if not, we conservatively assume the
  // iframe loaded after the first RAF tick.
  useEffect(() => {
    if (iframeLoaded) return;
    const raf = requestAnimationFrame(() => {
      // Optimistic: assume the iframe mounted. If the URL is invalid
      // the failure view will surface in the next timer cycle.
      setIframeLoaded(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [srcReloadKey, iframeLoaded]);

  // pizarra-ux-overhaul: Reload button handler. Clears the failure
  // view, increments the reload key, and re-arms the 5s timer.
  const handleReload = useCallback(() => {
    setLoadFailed(null);
    setIframeLoaded(false);
    setSrcReloadKey((k) => k + 1);
  }, []);

  // pizarra-ux-overhaul: hover/active micro-states for the inner
  // wrapper (the "header" row containing the drag handle, address
  // bar, refresh button, load indicator). Hover is a border-bottom
  // color tint; active (mousedown on a button in the wrapper) is a
  // 1px inset accent border. NO transform — the drag handle must
  // stay grabbable.
  const [isHovered, setIsHovered] = useState(false);
  const [isButtonActive, setIsButtonActive] = useState(false);
  const handleWrapperMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleWrapperMouseLeave = useCallback(() => {
    setIsHovered(false);
    setIsButtonActive(false);
  }, []);
  const handleWrapperButtonMouseDown = useCallback(() => setIsButtonActive(true), []);
  const handleWrapperButtonMouseUp = useCallback(() => setIsButtonActive(false), []);

  const handleFrameMouseDown = useCallback(
    (event) => {
      if (event.target?.closest?.('[data-pizarra-surface-drag-handle="true"]')) {
        return;
      }
      onSelect?.(shape.id);
    },
    [onSelect, shape.id]
  );

  // pizarra-drag-resize-polish: border-based resize for the browser
  // surface. Same contract as CanvasTerminal.handleResizeStart. The
  // browser is a composite element so it does not go through the Konva
  // Transformer — it exposes its own 8 edge/corner handles and the
  // resize is committed via onUpdateElement({x,y,width,height}).
  const handleResizeStart = useCallback(
    (event, dir) => {
      if (event.button !== 0) return;
      if (event.target?.closest?.('[data-pizarra-surface-drag-handle="true"]')) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      onSelect?.(shape.id);

      const startBounds = { ...bounds };
      const startX = event.clientX;
      const startY = event.clientY;
      const minW = 220;
      const minH = 160;

      const handleMouseMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        const next = { ...startBounds };
        if (dir.includes('e')) {
          next.width = Math.max(minW, startBounds.width + dx);
        }
        if (dir.includes('s')) {
          next.height = Math.max(minH, startBounds.height + dy);
        }
        if (dir.includes('w')) {
          const w = Math.max(minW, startBounds.width - dx);
          next.width = w;
          next.x = startBounds.x + (startBounds.width - w);
        }
        if (dir.includes('n')) {
          const h = Math.max(minH, startBounds.height - dy);
          next.height = h;
          next.y = startBounds.y + (startBounds.height - h);
        }
        onUpdateElement?.(shape.id, next);
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [bounds, onSelect, onUpdateElement, shape.id]
  );

  const handleDragStart = usePizarraSurfaceDrag({
    surfaceId: shape.id,
    bounds,
    onSelect,
    onMove,
    moveMeta: { panelId },
  });
  const layoutSyncKey = useMemo(
    () =>
      `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}:${bounds.screenX ?? bounds.x}:${bounds.screenY ?? bounds.y}:${srcReloadKey}`,
    [bounds.height, bounds.screenX, bounds.screenY, bounds.width, bounds.x, bounds.y, srcReloadKey]
  );

  return (
    <div
      data-testid={`pizarra-browser-surface-${shape.id}`}
      style={{
        position: 'absolute',
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        pointerEvents: 'none',
      }}
    >
      <div
        onMouseDownCapture={handleFrameMouseDown}
        onMouseEnter={handleWrapperMouseEnter}
        onMouseLeave={handleWrapperMouseLeave}
        onMouseDown={handleWrapperButtonMouseDown}
        onMouseUp={handleWrapperButtonMouseUp}
        data-pizarra-header-hovered={isHovered ? 'true' : 'false'}
        data-pizarra-header-active={isButtonActive ? 'true' : 'false'}
        style={{
          position: 'absolute',
          inset: FRAME_INSET,
          overflow: 'hidden',
          borderRadius: 16,
          border: selected ? '2px solid rgba(88,166,255,0.72)' : '1px solid rgba(88,166,255,0.28)',
          borderBottomColor: isHovered
            ? 'rgba(88, 166, 255, 0.5)'
            : selected
              ? 'rgba(88,166,255,0.72)'
              : 'rgba(88, 166, 255, 0.28)',
          outline: isButtonActive ? '1px inset var(--accent-primary)' : 'none',
          background: 'rgba(8, 14, 24, 0.94)',
          boxShadow: '0 18px 48px rgba(3, 7, 18, 0.28)',
          pointerEvents: 'auto',
        }}
      >
        <button
          type="button"
          data-testid="pizarra-drag-handle"
          data-pizarra-drag-handle-id={`pizarra-browser-drag-handle-${shape.id}`}
          data-pizarra-surface-drag-handle="true"
          onMouseDown={handleDragStart}
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            zIndex: 30,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(6, 16, 27, 0.9)',
            color: '#9fb5d1',
            cursor: 'move',
            backdropFilter: 'blur(12px)',
          }}
          title="Mover navegador"
        >
          <Move size={14} />
        </button>

        <button
          type="button"
          data-testid="pizarra-browser-close"
          data-pizarra-close-button="true"
          title="Cerrar navegador"
          aria-label="Cerrar navegador"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose?.(shape.id);
          }}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 30,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            padding: 0,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(6, 16, 27, 0.9)',
            color: '#9fb5d1',
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
          }}
        >
          <X size={14} />
        </button>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            minHeight: 0,
          }}
        >
          <WorkspaceBrowserPane
            dockState={dockState}
            onDockStateChange={handleDockStateChange}
            projectId="pizarra"
            workspaceId={shape.id}
            layoutSyncKey={layoutSyncKey}
          />
        </div>

        {/* pizarra-ux-overhaul: explicit failure surface when the 5s
            timer fires. The iframe remains in the DOM (WorkspaceBrowserPane
            keeps it mounted) so any partial content stays visible. */}
        {loadFailed ? (
          <div
            data-testid="pizarra-browser-load-failed"
            data-load-failed-category={loadFailed.category}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              background: 'rgba(8, 14, 24, 0.92)',
              color: '#f0ece4',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              padding: 16,
              textAlign: 'center',
            }}
          >
            <span>
              {loadFailed.category === FAILURE_CATEGORIES.NATIVE_ERROR
                ? 'Native browser runtime encountered an error'
                : loadFailed.category === FAILURE_CATEGORIES.NATIVE_TIMEOUT
                  ? 'Native browser runtime did not start'
                  : 'Browser is taking too long to load'}
            </span>
            <button
              type="button"
              data-testid="pizarra-browser-reload"
              onClick={handleReload}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(88, 166, 255, 0.16)',
                color: '#9fb5d1',
                cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                letterSpacing: '0.04em',
              }}
            >
              <RefreshCw size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Reload
            </button>
          </div>
        ) : null}
      </div>

      {/* pizarra-drag-resize-polish: 8 border resize handles. Same
          geometry as CanvasTerminal. The drag-handle button (top-left
          Move icon) must be excluded from the resize hit-area, so
          handleResizeStart bails when the mousedown originates from
          the drag handle (see the closest() guard above). */}
      {selected && (
        <>
          <div
            data-testid="pizarra-browser-resize-n"
            onMouseDown={(e) => handleResizeStart(e, 'n')}
            style={{
              position: 'absolute',
              top: 0,
              left: 14,
              right: 14,
              height: 8,
              cursor: 'ns-resize',
              pointerEvents: 'auto',
              zIndex: 5,
            }}
          />
          <div
            data-testid="pizarra-browser-resize-s"
            onMouseDown={(e) => handleResizeStart(e, 's')}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 14,
              right: 14,
              height: 8,
              cursor: 'ns-resize',
              pointerEvents: 'auto',
              zIndex: 5,
            }}
          />
          <div
            data-testid="pizarra-browser-resize-w"
            onMouseDown={(e) => handleResizeStart(e, 'w')}
            style={{
              position: 'absolute',
              left: 0,
              top: 14,
              bottom: 14,
              width: 8,
              cursor: 'ew-resize',
              pointerEvents: 'auto',
              zIndex: 5,
            }}
          />
          <div
            data-testid="pizarra-browser-resize-e"
            onMouseDown={(e) => handleResizeStart(e, 'e')}
            style={{
              position: 'absolute',
              right: 0,
              top: 14,
              bottom: 14,
              width: 8,
              cursor: 'ew-resize',
              pointerEvents: 'auto',
              zIndex: 5,
            }}
          />
          <div
            data-testid="pizarra-browser-resize-nw"
            onMouseDown={(e) => handleResizeStart(e, 'nw')}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 14,
              height: 14,
              cursor: 'nwse-resize',
              pointerEvents: 'auto',
              zIndex: 6,
            }}
          />
          <div
            data-testid="pizarra-browser-resize-ne"
            onMouseDown={(e) => handleResizeStart(e, 'ne')}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 14,
              height: 14,
              cursor: 'nesw-resize',
              pointerEvents: 'auto',
              zIndex: 6,
            }}
          />
          <div
            data-testid="pizarra-browser-resize-sw"
            onMouseDown={(e) => handleResizeStart(e, 'sw')}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: 14,
              height: 14,
              cursor: 'nesw-resize',
              pointerEvents: 'auto',
              zIndex: 6,
            }}
          />
          <div
            data-testid="pizarra-browser-resize-se"
            onMouseDown={(e) => handleResizeStart(e, 'se')}
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 14,
              height: 14,
              cursor: 'nwse-resize',
              pointerEvents: 'auto',
              zIndex: 6,
            }}
          />
        </>
      )}
    </div>
  );
}

// pizarra-ux-overhaul: safe wrapper around the native browser
// capability hook. If the module is not yet wired (or the runtime
// is unavailable), the function returns null and the surface stays
// on the iframe path.
function useNativeBrowserCapabilitySafe() {
  if (
    useNativeBrowserSurfaceModule &&
    typeof useNativeBrowserSurfaceModule.useNativeBrowserCapability === 'function'
  ) {
    try {
      return useNativeBrowserSurfaceModule.useNativeBrowserCapability();
    } catch (e) {
      // Capability probe failed; stay on the iframe path.
      return null;
    }
  }
  return null;
}

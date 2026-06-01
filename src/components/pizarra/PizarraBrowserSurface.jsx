'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Move } from 'lucide-react';
import WorkspaceBrowserPane from '@/components/workspace/WorkspaceBrowserPane';
import usePizarraSurfaceDrag from './usePizarraSurfaceDrag';

const FRAME_INSET = 10;

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
    browserRuntime: 'native-gtk',
    browserUrl: resolvedUrl,
    editMode: false,
    maximized: false,
    maximizedView: 'browser',
    visible: true,
  };
}

export default function PizarraBrowserSurface({
  shape,
  bounds,
  selected = false,
  onSelect,
  onMove,
  onUpdateElement,
}) {
  const [dockState, setDockState] = useState(() => createDockState(shape.url));
  const persistedUrlRef = useRef(resolveBrowserUrl(shape.url));
  const panelId = useMemo(() => `pizarra-browser-${shape.id}`, [shape.id]);

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

  const handleDockStateChange = useCallback((nextStateOrUpdater) => {
    setDockState((currentState) =>
      typeof nextStateOrUpdater === 'function'
        ? nextStateOrUpdater(currentState)
        : nextStateOrUpdater
    );
  }, []);

  const handleFrameMouseDown = useCallback(
    (event) => {
      if (event.target?.closest?.('[data-pizarra-surface-drag-handle="true"]')) {
        return;
      }
      onSelect?.(shape.id);
    },
    [onSelect, shape.id]
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
      `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}:${bounds.screenX ?? bounds.x}:${bounds.screenY ?? bounds.y}`,
    [bounds.height, bounds.screenX, bounds.screenY, bounds.width, bounds.x, bounds.y]
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
        style={{
          position: 'absolute',
          inset: FRAME_INSET,
          overflow: 'hidden',
          borderRadius: 16,
          border: selected ? '2px solid rgba(88,166,255,0.72)' : '1px solid rgba(88,166,255,0.28)',
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
      </div>
    </div>
  );
}

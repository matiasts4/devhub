'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe, RefreshCw } from 'lucide-react';
import { focusNativeBrowser, reloadNativeBrowser } from '@/lib/browser/nativeBrowserBridge';
import {
  useNativeBrowserCapability,
  useNativeBrowserSurface,
} from '@/components/workspace/useNativeBrowserSurface';
import { resizeNativeBrowser } from '@/lib/browser/nativeBrowserBridge';

const FRAME_INSET = 10;
const HEADER_HEIGHT = 38;

function getMeasuredBounds(node) {
  const rect = node?.getBoundingClientRect?.();

  return {
    x: Number(rect?.x) || 0,
    y: Number(rect?.y) || 0,
    width: Math.max(Number(rect?.width) || 0, 1),
    height: Math.max(Number(rect?.height) || 0, 1),
  };
}

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

export default function PizarraBrowserSurface({
  shape,
  bounds,
  selected = false,
  onSelect,
  onMove,
  onUpdateElement,
}) {
  const resolvedUrl = resolveBrowserUrl(shape.url);
  const [typedUrl, setTypedUrl] = useState(shape.url || '');
  useEffect(() => {
    setTypedUrl(shape.url || '');
  }, [shape.url]);

  const dragCleanupRef = useRef(null);
  const dragRafRef = useRef(null);
  const boundsRef = useRef(bounds);
  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);
  const viewportRef = useRef(null);
  const panelId = useMemo(() => `pizarra-browser-${shape.id}`, [shape.id]);
  const requestedNativeRuntime = true;
  const nativeCapability = useNativeBrowserCapability({
    panelId,
    requested: requestedNativeRuntime,
  });
  const nativeRuntimeActive = nativeCapability?.ready === true;

  useEffect(() => {
    if (nativeRuntimeActive) {
      resizeNativeBrowser({
        panelId,
        bounds: {
          x: (bounds.screenX ?? bounds.x) + FRAME_INSET,
          y: (bounds.screenY ?? bounds.y) + FRAME_INSET + HEADER_HEIGHT,
          width: Math.max(bounds.width - FRAME_INSET * 2, 1),
          height: Math.max(bounds.height - FRAME_INSET * 2 - HEADER_HEIGHT, 1),
        },
      }).catch(() => {});
    }
  }, [bounds, panelId, nativeRuntimeActive]);

  const measureBounds = useCallback(() => getMeasuredBounds(viewportRef.current), []);

  const { nativeRuntimeReady } = useNativeBrowserSurface({
    panelId,
    url: resolvedUrl,
    active: nativeRuntimeActive,
    visibleInLayout: true,
    measureBounds,
    observeNode: viewportRef,
  });

  const handleFrameMouseDown = useCallback(
    (event) => {
      event.stopPropagation();
      onSelect?.(shape.id);
    },
    [onSelect, shape.id]
  );

  const handleViewportMouseDown = useCallback(
    (event) => {
      event.stopPropagation();
      onSelect?.(shape.id);
      if (nativeRuntimeActive) {
        focusNativeBrowser({ panelId }).catch(() => {});
      }
    },
    [nativeRuntimeActive, onSelect, panelId, shape.id]
  );

  const handleHeaderMouseDown = useCallback(
    (event) => {
      if (event.button !== 0) return;

      event.stopPropagation();
      event.preventDefault();
      onSelect?.(shape.id);

      const lastPointer = {
        x: event.clientX,
        y: event.clientY,
      };
      const startPointer = {
        x: event.clientX,
        y: event.clientY,
      };
      const startBounds = { ...boundsRef.current };

      const stopDragSync = () => {
        if (dragRafRef.current !== null) {
          cancelAnimationFrame(dragRafRef.current);
          dragRafRef.current = null;
        }
      };

      const handleMouseMove = (moveEvent) => {
        const deltaX = moveEvent.clientX - lastPointer.x;
        const deltaY = moveEvent.clientY - lastPointer.y;
        const totalDeltaX = moveEvent.clientX - startPointer.x;
        const totalDeltaY = moveEvent.clientY - startPointer.y;

        if (deltaX === 0 && deltaY === 0) return;

        lastPointer.x = moveEvent.clientX;
        lastPointer.y = moveEvent.clientY;
        onMove?.({
          id: shape.id,
          panelId,
          deltaX,
          deltaY,
          totalDeltaX,
          totalDeltaY,
        });

        // SYNC NATIVE SURFACE POSITION DIRECTLY
        const b = startBounds;
        resizeNativeBrowser({
          panelId,
          bounds: {
            x: (b.screenX ?? b.x) + totalDeltaX + FRAME_INSET,
            y: (b.screenY ?? b.y) + totalDeltaY + FRAME_INSET + HEADER_HEIGHT,
            width: Math.max(b.width - FRAME_INSET * 2, 1),
            height: Math.max(b.height - FRAME_INSET * 2 - HEADER_HEIGHT, 1),
          },
        }).catch(() => {});
      };

      const handleMouseUp = () => {
        stopDragSync();
        cleanupDrag();
      };

      const cleanupDrag = () => {
        stopDragSync();
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        if (dragCleanupRef.current === cleanupDrag) {
          dragCleanupRef.current = null;
        }
      };

      dragCleanupRef.current?.();
      dragCleanupRef.current = cleanupDrag;
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [onMove, onSelect, panelId, shape.id]
  );

  useEffect(() => () => dragCleanupRef.current?.(), []);

  const statusCopy = nativeRuntimeActive
    ? nativeRuntimeReady
      ? 'native gtk'
      : 'opening native surface'
    : nativeCapability
      ? `native unavailable · ${nativeCapability.reason || 'bridge unavailable'}`
      : 'probing native surface';

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
        onMouseDown={handleFrameMouseDown}
        style={{
          position: 'absolute',
          inset: FRAME_INSET,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 14,
          border: selected ? '2px solid rgba(88,166,255,0.72)' : '1px solid rgba(88,166,255,0.28)',
          background: 'rgba(8, 14, 24, 0.94)',
          boxShadow: '0 18px 48px rgba(3, 7, 18, 0.28)',
          pointerEvents: 'auto',
        }}
      >
        <div
          data-testid={`pizarra-browser-header-${shape.id}`}
          onMouseDown={handleHeaderMouseDown}
          style={{
            height: HEADER_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 10px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(7, 17, 28, 0.96)',
            color: '#d6e2ff',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'move',
            userSelect: 'none',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Globe size={12} />
            {shape.label || 'Browser'}
          </span>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flex: '1 1 auto',
              maxWidth: 420,
              margin: '0 12px',
              gap: 6,
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                reloadNativeBrowser({ panelId }).catch(() => {});
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9fb5d1',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 4,
                borderRadius: 4,
                transition: 'background 0.2s',
              }}
              title="Reload"
            >
              <RefreshCw size={11} />
            </button>

            <input
              type="text"
              value={typedUrl}
              onChange={(e) => setTypedUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const targetUrl = typedUrl.trim();
                  if (targetUrl) {
                    let normalized = targetUrl;
                    if (!/^https?:\/\//i.test(normalized)) {
                      normalized = 'http://' + normalized;
                    }
                    onUpdateElement?.(shape.id, { url: normalized });
                  }
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                flex: '1 1 auto',
                padding: '2px 8px',
                height: 22,
                borderRadius: 5,
                border: '1px solid rgba(255,255,255,0.08)',
                background: '#040812',
                color: '#d6e2ff',
                fontSize: 10,
                fontFamily: 'monospace',
                outline: 'none',
                cursor: 'text',
                textTransform: 'none',
              }}
            />
          </div>

          <span
            data-testid={`pizarra-browser-runtime-status-${shape.id}`}
            style={{ flexShrink: 0, fontSize: 9, opacity: 0.8 }}
          >
            {statusCopy}
          </span>
        </div>

        <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
          <div
            ref={viewportRef}
            data-testid={
              nativeRuntimeActive
                ? `pizarra-browser-native-runtime-shell-${shape.id}`
                : `pizarra-browser-native-runtime-fallback-${shape.id}`
            }
            onMouseDown={handleViewportMouseDown}
            style={{
              position: 'absolute',
              inset: 0,
              background: nativeRuntimeActive
                ? 'linear-gradient(180deg, rgba(13,22,37,0.96) 0%, rgba(7,12,20,0.98) 100%)'
                : 'linear-gradient(180deg, rgba(14,20,30,0.96) 0%, rgba(9,12,19,0.98) 100%)',
              color: '#9fb5d1',
            }}
          >
            {!nativeRuntimeReady ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                  textAlign: 'center',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  background:
                    'radial-gradient(circle at top, rgba(88,166,255,0.12), transparent 48%)',
                }}
              >
                {nativeRuntimeActive
                  ? 'Opening the workspace native browser surface...'
                  : 'Native browser bridge unavailable in this runtime.'}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

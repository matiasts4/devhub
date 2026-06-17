'use client';

import { useCallback } from 'react';
import { Home, Minus, Plus, ScanSearch } from 'lucide-react';
import { useCanvasViewport, zoomAtPoint } from '@/lib/pizarra/canvasViewport';

const BTN = {
  width: 30,
  height: 30,
  padding: 0,
  borderRadius: 'var(--chrome-radius-control, 6px)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
  background: 'var(--chrome-control-fill, rgba(15,23,42,0.9))',
  color: 'var(--text-primary, #e2e8f0)',
  flexShrink: 0,
};

export default function PizarraZoomControls({
  onFitAll,
  onResetView,
  canvasWidth = 800,
  canvasHeight = 600,
  visible = true,
}) {
  const { zoom, setZoom, pan, setPan } = useCanvasViewport();

  const zoomAroundCenter = useCallback(
    (deltaY) => {
      const focalX = canvasWidth / 2;
      const focalY = canvasHeight / 2;
      const result = zoomAtPoint({
        currentZoom: zoom,
        currentPan: pan,
        deltaY,
        focalX,
        focalY,
      });
      setZoom(result.zoom);
      setPan(result.pan);
    },
    [zoom, pan, canvasWidth, canvasHeight, setZoom, setPan]
  );

  const resetView = useCallback(() => {
    if (onResetView) {
      onResetView();
      return;
    }
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [setZoom, setPan, onResetView]);

  const pct = Math.round((zoom || 1) * 100);

  return (
    <div
      data-testid="pizarra-zoom-controls"
      style={{
        position: 'absolute',
        bottom: 48,
        left: 12,
        zIndex: 10002,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 6px',
        borderRadius: 'var(--chrome-radius-panel, 8px)',
        background: 'rgba(10, 15, 28, 0.92)',
        border: '1px solid rgba(88, 166, 255, 0.18)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
        pointerEvents: visible ? 'auto' : 'none',
        opacity: visible ? 1 : 0,
        visibility: visible ? 'visible' : 'hidden',
        transition: 'opacity 0.18s ease, visibility 0.18s ease',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        color: 'var(--text-muted, #94a3b8)',
      }}
    >
      <button type="button" aria-label="Alejar" style={BTN} onClick={() => zoomAroundCenter(80)}>
        <Minus size={14} />
      </button>
      <span
        style={{
          minWidth: 42,
          textAlign: 'center',
          fontWeight: 600,
          letterSpacing: '0.04em',
        }}
      >
        {pct}%
      </span>
      <button type="button" aria-label="Acercar" style={BTN} onClick={() => zoomAroundCenter(-80)}>
        <Plus size={14} />
      </button>
      <button
        type="button"
        aria-label="Restablecer vista"
        title="Centrar ventana activa (zoom 100%)"
        style={BTN}
        onClick={resetView}
      >
        <Home size={14} />
      </button>
      {onFitAll ? (
        <button
          type="button"
          aria-label="Ajustar todo al viewport"
          title="Centrar ventana, autoajustar tarjetas y encuadrar (Ctrl+0)"
          style={{ ...BTN, color: 'var(--accent-primary, #3b82f6)' }}
          onClick={onFitAll}
        >
          <ScanSearch size={14} />
        </button>
      ) : null}
    </div>
  );
}

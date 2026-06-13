'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  setSwipeNavigationEnabled,
  isSwipeNavigationEnabled,
} from '@/lib/pizarra/pizarraViewLayout';

export default function PizarraViewStrip({
  views = [],
  activeViewId,
  visible = false,
  onSelectView,
  onAddView,
  onRemoveView,
  onMouseEnter,
  onMouseLeave,
}) {
  const [swipeOn, setSwipeOn] = useState(() => isSwipeNavigationEnabled());

  if (!views.length) return null;

  return (
    <div
      data-testid="pizarra-view-strip"
      data-visible={visible ? 'true' : 'false'}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: `translateX(-50%) translateY(${visible ? 0 : 10}px)`,
        zIndex: 10004,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 12,
        background: 'rgba(10, 15, 28, 0.9)',
        border: '1px solid rgba(88, 166, 255, 0.2)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        pointerEvents: visible ? 'auto' : 'none',
        maxWidth: 'min(90vw, 520px)',
        overflowX: 'auto',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.22s ease-out, transform 0.22s ease-out',
      }}
    >
      {views.map((view, index) => {
        const label = view.name || `V${index + 1}`;
        const active = view.id === activeViewId;
        return (
          <button
            key={view.id}
            type="button"
            data-testid={`pizarra-view-tab-${index + 1}`}
            onClick={() => onSelectView?.(view.id)}
            title={`Vista ${label}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 28,
              padding: '0 12px',
              borderRadius: 8,
              border: active
                ? '1px solid rgba(59, 130, 246, 0.5)'
                : '1px solid rgba(255,255,255,0.08)',
              background: active ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              color: active ? '#93c5fd' : 'var(--text-muted, #94a3b8)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {label}
            {views.length > 1 ? (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Cerrar ${label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveView?.(view.id);
                }}
                style={{
                  display: 'inline-flex',
                  opacity: 0.6,
                  padding: 2,
                  borderRadius: 4,
                }}
              >
                <X size={10} />
              </span>
            ) : null}
          </button>
        );
      })}
      <button
        type="button"
        data-testid="pizarra-view-add"
        onClick={() => onAddView?.()}
        title="Nueva ventana en este workspace"
        aria-label="Agregar ventana"
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          border: '1px dashed rgba(255,255,255,0.15)',
          background: 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        data-testid="pizarra-swipe-nav-toggle"
        onClick={() => {
          const next = !swipeOn;
          setSwipeNavigationEnabled(next);
          setSwipeOn(next);
        }}
        title={
          swipeOn
            ? 'Swipe horizontal (2 dedos). En Linux el gesto de 3–4 dedos suele cambiar el escritorio del sistema — desactívalo en Configuración del compositor, o usa Alt+← / Alt+→'
            : 'Activar swipe horizontal con 2 dedos (o usa Alt+← / Alt+→)'
        }
        style={{
          height: 28,
          padding: '0 8px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.08)',
          background: swipeOn ? 'rgba(34, 211, 238, 0.1)' : 'transparent',
          color: swipeOn ? '#5eead4' : '#64748b',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {swipeOn ? '2-finger' : 'swipe off'}
      </button>
      <span
        style={{
          height: 28,
          padding: '0 8px',
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.06)',
          color: '#64748b',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          fontWeight: 600,
          flexShrink: 0,
        }}
        title="Arrastra desde el borde izquierdo o derecho para cambiar de ventana"
      >
        borde ←/→
      </span>
      <span
        style={{
          height: 28,
          padding: '0 8px',
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.06)',
          color: '#64748b',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          fontWeight: 600,
          flexShrink: 0,
        }}
        title="Cambiar ventana: Alt + flecha izquierda/derecha"
      >
        Alt+←/→
      </span>
    </div>
  );
}

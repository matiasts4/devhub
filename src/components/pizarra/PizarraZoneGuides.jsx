'use client';

import { useMemo } from 'react';
import { useCanvasViewport } from '@/lib/pizarra/canvasViewport';

function projectOverlayRect(rect, zoom, pan) {
  const z = zoom > 0 ? zoom : 1;
  const panX = pan?.x ?? 0;
  const panY = pan?.y ?? 0;
  return {
    x: panX + (rect.x ?? 0) * z,
    y: panY + (rect.y ?? 0) * z,
    width: Math.max(0, (rect.width ?? 0) * z),
    height: Math.max(0, (rect.height ?? 0) * z),
  };
}

const SLOT_PALETTES = [
  {
    border: '1px dashed rgba(59, 130, 246, 0.22)',
    activeBorder: '2px solid rgba(59, 130, 246, 0.65)',
    background: 'rgba(59, 130, 246, 0.04)',
    activeBackground: 'rgba(59, 130, 246, 0.12)',
    activeShadow: '0 0 24px rgba(59, 130, 246, 0.25), inset 0 0 40px rgba(59, 130, 246, 0.06)',
    labelColor: 'rgba(59, 130, 246, 0.38)',
    labelActiveColor: 'rgba(96, 165, 250, 0.85)',
  },
  {
    border: '1px dashed rgba(34, 211, 238, 0.2)',
    activeBorder: '2px solid rgba(34, 211, 238, 0.6)',
    background: 'rgba(34, 211, 238, 0.035)',
    activeBackground: 'rgba(34, 211, 238, 0.11)',
    activeShadow: '0 0 24px rgba(34, 211, 238, 0.22), inset 0 0 40px rgba(34, 211, 238, 0.05)',
    labelColor: 'rgba(34, 211, 238, 0.35)',
    labelActiveColor: 'rgba(45, 212, 191, 0.85)',
  },
  {
    border: '1px dashed rgba(167, 139, 250, 0.22)',
    activeBorder: '2px solid rgba(167, 139, 250, 0.6)',
    background: 'rgba(167, 139, 250, 0.04)',
    activeBackground: 'rgba(167, 139, 250, 0.1)',
    activeShadow: '0 0 24px rgba(167, 139, 250, 0.2), inset 0 0 40px rgba(167, 139, 250, 0.05)',
    labelColor: 'rgba(167, 139, 250, 0.38)',
    labelActiveColor: 'rgba(196, 181, 253, 0.9)',
  },
];

function slotStyle(slotId, highlightZone, palette, projected) {
  const active = highlightZone === slotId;
  return {
    position: 'absolute',
    left: projected.x,
    top: projected.y,
    width: projected.width,
    height: projected.height,
    borderRadius: 8,
    border: active ? palette.activeBorder : palette.border,
    background: active ? palette.activeBackground : palette.background,
    boxShadow: active ? palette.activeShadow : 'none',
    transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
  };
}

/**
 * Dynamic layout zone guides — reflect the current surfaces (2 terminals = 50/50, etc.).
 */
export default function PizarraZoneGuides({
  canvasWidth = 800,
  canvasHeight = 600,
  visible = true,
  highlightZone = null,
  snapZones = null,
}) {
  const { zoom, pan } = useCanvasViewport();

  const projectRect = useMemo(
    () => (rect) => projectOverlayRect(rect, zoom, pan),
    [zoom, pan]
  );

  const slots = snapZones?.slots || [];

  if (!visible || slots.length === 0) return null;

  const splitLines = [];
  for (let i = 0; i < slots.length - 1; i += 1) {
    const current = projectRect(slots[i].rect);
    const splitX = current.x + current.width;
    splitLines.push({ x: splitX, top: current.y, height: current.height });
  }

  return (
    <div
      data-testid="pizarra-zone-guides"
      data-highlight-zone={highlightZone || 'none'}
      data-slot-count={String(slots.length)}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {slots.map((slot, index) => {
        const palette = SLOT_PALETTES[index % SLOT_PALETTES.length];
        const projected = projectRect(slot.rect);
        const active = highlightZone === slot.id;
        return (
          <div key={slot.id}>
            <div data-zone={slot.id} style={slotStyle(slot.id, highlightZone, palette, projected)} />
            <div
              style={{
                position: 'absolute',
                left: projected.x + 12,
                top: projected.y + 10,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.12em',
                color: active ? palette.labelActiveColor : palette.labelColor,
                textTransform: 'uppercase',
                transition: 'color 0.15s ease',
              }}
            >
              {slot.label} — soltar aquí
            </div>
          </div>
        );
      })}
      {splitLines.map((line, i) => (
        <div
          key={`split-${i}`}
          style={{
            position: 'absolute',
            left: line.x,
            top: line.top,
            width: 1,
            height: line.height,
            background:
              highlightZone
                ? 'linear-gradient(180deg, transparent, rgba(148,163,184,0.5) 15%, rgba(148,163,184,0.5) 85%, transparent)'
                : 'linear-gradient(180deg, transparent, rgba(148,163,184,0.2) 20%, rgba(148,163,184,0.2) 80%, transparent)',
            transition: 'background 0.15s ease',
          }}
        />
      ))}
    </div>
  );
}
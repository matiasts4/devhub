/**
 * PizarraToolPalette — docked left rail for pizarra actions.
 *
 * Hidden by default. A narrow edge strip (14px) at the left reveals the
 * full palette on hover; no extra canvas width is reserved while collapsed.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import {
  MousePointer,
  Type,
  Square,
  Circle,
  Minus,
  ArrowRight,
  Terminal,
  Globe,
  Columns,
  LayoutGrid,
  Layout,
  Trash2,
  ArrowLeftRight,
  ArrowUpDown,
  Maximize2,
  Grid2X2,
  ScanSearch,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Pin,
  PinOff,
} from 'lucide-react';
import { useCanvasViewport } from '@/lib/pizarra/canvasViewport';

const RAIL_WIDTH = 50;
const EDGE_WIDTH = 14;
const HIDE_DELAY_MS = 900;

const SHAPE_TOOLS = [
  { value: 'select', label: 'Seleccionar', Icon: MousePointer },
  { value: 'text', label: 'Texto', Icon: Type },
  { value: 'rect', label: 'Rectángulo', Icon: Square },
  { value: 'circle', label: 'Círculo', Icon: Circle },
  { value: 'line', label: 'Línea', Icon: Minus },
  { value: 'arrow', label: 'Flecha', Icon: ArrowRight },
];

const ELEMENT_TOOLS = [
  { value: 'terminal', label: 'Nueva Terminal', Icon: Terminal },
  { value: 'browser', label: 'Nuevo Browser', Icon: Globe },
];

const LAYOUT_PRESETS = [
  { value: 'dev-split', label: 'Split: 1 Browser + 1 Terminal', Icon: Columns },
  { value: 'dev-trio', label: 'Trio: 1 Browser + 2 Terminales', Icon: LayoutGrid },
  { value: 'dual-browser', label: 'Doble: 2 Browsers', Icon: Layout },
  { value: 'clear', label: 'Limpiar pizarra', Icon: Trash2 },
];

const ARRANGE_ACTIONS = [
  {
    value: 'arrange-fit',
    label: 'Auto-ajustar todo',
    description: 'Reorganiza todas las tarjetas al tamaño y posición óptima según el viewport',
    Icon: ScanSearch,
    accent: true,
  },
  {
    value: 'arrange-h',
    label: 'Horizontal',
    description: 'Distribuye en columnas de igual ancho, centrado en pantalla',
    Icon: ArrowLeftRight,
  },
  {
    value: 'arrange-v',
    label: 'Vertical',
    description: 'Apila en filas de igual altura, centrado en pantalla',
    Icon: ArrowUpDown,
  },
  {
    value: 'arrange-equal',
    label: 'Igualar tamaños',
    description: 'Aplica el mismo tamaño a todas las tarjetas',
    Icon: Maximize2,
  },
  {
    value: 'arrange-grid',
    label: 'Cuadrícula 2 col',
    description: 'Organiza en grilla de 2 columnas centrada',
    Icon: Grid2X2,
  },
];

const TOOL_BTN = {
  width: 36,
  height: 36,
  padding: 0,
  borderRadius: 'var(--chrome-radius-control, 6px)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
  background: 'var(--chrome-control-fill, rgba(15, 23, 42, 0.92))',
  color: 'var(--text-primary, #e2e8f0)',
  transition: 'border-color 0.12s ease, background 0.12s ease, color 0.12s ease',
  flexShrink: 0,
};

function ToolSection({ children, style = {} }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        width: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StaticSectionLabel({ children }) {
  return (
    <div
      style={{
        padding: '2px 2px 4px',
        color: 'var(--text-muted, #94a3b8)',
        fontSize: 8,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        fontWeight: 600,
        width: '100%',
        userSelect: 'none',
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children, collapsed, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        padding: '2px 2px 4px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-muted, #94a3b8)',
        fontSize: 8,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        fontWeight: 600,
        width: '100%',
      }}
    >
      <span>{children}</span>
      {collapsed ? <ChevronDown size={9} /> : <ChevronUp size={9} />}
    </button>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        width: '100%',
        background: 'rgba(255,255,255,0.08)',
        margin: '2px 0',
      }}
    />
  );
}

export default function PizarraToolPalette({
  value,
  onChange,
  onAddElement,
  onApplyLayout,
  isViewLocked,
  onToggleViewLocked,
  onRevealChange,
  revealed: revealedProp,
  onRevealRequest,
}) {
  const { viewportToCanvas, canvasRect } = useCanvasViewport();
  const [layoutsCollapsed, setLayoutsCollapsed] = useState(true);
  const [shapeCollapsed, setShapeCollapsed] = useState(true);
  const [tooltip, setTooltip] = useState(null);
  const [internalRevealed, setInternalRevealed] = useState(false);
  const isControlled = revealedProp !== undefined;
  const revealed = isControlled ? revealedProp : internalRevealed;
  const hideTimerRef = useRef(null);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const reveal = useCallback(() => {
    if (isControlled) {
      onRevealRequest?.();
      return;
    }
    cancelHide();
    setInternalRevealed(true);
    onRevealChange?.(true);
  }, [cancelHide, isControlled, onRevealChange, onRevealRequest]);

  const scheduleHide = useCallback(() => {
    if (isControlled) return;
    cancelHide();
    hideTimerRef.current = setTimeout(() => {
      setInternalRevealed(false);
      setTooltip(null);
      onRevealChange?.(false);
    }, HIDE_DELAY_MS);
  }, [cancelHide, isControlled, onRevealChange]);

  useEffect(() => () => cancelHide(), [cancelHide]);

  const getCanvasCenter = () => {
    if (!canvasRect) return { x: 0, y: 0 };
    return viewportToCanvas(canvasRect.width / 2, canvasRect.height / 2);
  };

  const handleShapeToolChange = (val) => val && onChange(val);

  const handleAddElement = (type) => {
    const { x: cx, y: cy } = getCanvasCenter();
    onAddElement?.(type, { x: cx, y: cy });
  };

  const handleApplyLayout = (presetType) => {
    const { x: cx, y: cy } = getCanvasCenter();
    onApplyLayout?.(presetType, { x: cx, y: cy });
  };

  const showTooltip = (e, label, description) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ label, description, y: rect.top + rect.height / 2, x: rect.right + 10 });
  };

  return (
    <div
      data-testid="pizarra-tool-palette-shell"
      onMouseEnter={isControlled ? undefined : reveal}
      onMouseLeave={isControlled ? undefined : scheduleHide}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: revealed ? RAIL_WIDTH + 18 : EDGE_WIDTH,
        pointerEvents: isControlled ? 'none' : 'auto',
        zIndex: 10003,
      }}
    >
      <div
        data-testid="pizarra-tool-palette-hover-zone"
        aria-hidden={revealed ? 'true' : 'false'}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: EDGE_WIDTH,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: revealed ? 'none' : 'auto',
        }}
      >
        {!revealed ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              opacity: 0.55,
            }}
          >
            <div
              style={{
                width: 3,
                height: 48,
                borderRadius: 4,
                background:
                  'linear-gradient(180deg, transparent, rgba(88,166,255,0.5) 18%, rgba(88,166,255,0.5) 82%, transparent)',
              }}
            />
            <ChevronRight size={10} color="rgba(88,166,255,0.65)" strokeWidth={2.5} />
          </div>
        ) : null}
      </div>

      <div
        className="pizarra-tool-palette"
        data-expanded={revealed ? 'true' : 'false'}
        data-testid="pizarra-tool-palette"
        style={{
          position: 'absolute',
          left: 8,
          top: 0,
          bottom: 0,
          width: RAIL_WIDTH,
          display: 'flex',
          alignItems: 'center',
          opacity: revealed ? 1 : 0,
          visibility: revealed ? 'visible' : 'hidden',
          pointerEvents: revealed ? 'auto' : 'none',
          transition: 'opacity 0.18s ease-out, visibility 0.18s ease-out',
        }}
      >
        <div
          style={{
            width: RAIL_WIDTH,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            background: 'rgba(10, 15, 28, 0.96)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(88, 166, 255, 0.28)',
            borderRadius: 10,
            padding: '8px 7px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.05) inset',
            maxHeight: 'min(88vh, 720px)',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          <div
            style={{
              fontSize: 8,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 700,
              color: 'rgba(88, 166, 255, 0.75)',
              textAlign: 'center',
              paddingBottom: 2,
              userSelect: 'none',
            }}
          >
            Pizarra
          </div>

          {tooltip && revealed && (
            <div
              style={{
                position: 'fixed',
                left: tooltip.x ?? RAIL_WIDTH + 22,
                top: tooltip.y,
                zIndex: 10050,
                background: 'rgba(10, 15, 28, 0.98)',
                border: '1px solid rgba(88, 166, 255, 0.25)',
                borderRadius: 6,
                padding: '6px 10px',
                maxWidth: 220,
                pointerEvents: 'none',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              }}
            >
              <p
                style={{
                  color: 'var(--text-primary, #e2e8f0)',
                  fontSize: 11,
                  fontWeight: 600,
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                {tooltip.label}
              </p>
              {tooltip.description && (
                <p
                  style={{
                    color: 'var(--text-muted, #94a3b8)',
                    fontSize: 10,
                    margin: '3px 0 0',
                    lineHeight: 1.4,
                  }}
                >
                  {tooltip.description}
                </p>
              )}
            </div>
          )}

          <ToolSection>
            <StaticSectionLabel>Agregar</StaticSectionLabel>
            {ELEMENT_TOOLS.map(({ value: toolVal, label, Icon }) => (
              <button
                key={toolVal}
                type="button"
                data-testid={`pizarra-add-${toolVal}`}
                aria-label={label}
                onClick={() => handleAddElement(toolVal)}
                onMouseEnter={(e) => showTooltip(e, label)}
                onMouseLeave={() => setTooltip(null)}
                style={{
                  ...TOOL_BTN,
                  color: 'var(--accent-primary, #58a6ff)',
                  border:
                    '1px solid color-mix(in srgb, var(--accent-primary, #58a6ff) 35%, transparent)',
                  background:
                    'color-mix(in srgb, var(--accent-primary, #58a6ff) 10%, rgba(15,23,42,0.95))',
                }}
              >
                <Icon size={16} strokeWidth={2.2} />
              </button>
            ))}
          </ToolSection>

          <Divider />

          <ToolSection>
            <StaticSectionLabel>Vista</StaticSectionLabel>
            <button
              type="button"
              data-testid="pizarra-toggle-view-locked"
              aria-label={isViewLocked ? 'Liberar vista (auto-ajustar)' : 'Fijar vista'}
              aria-pressed={isViewLocked}
              onClick={() => onToggleViewLocked?.()}
              onMouseEnter={(e) =>
                showTooltip(
                  e,
                  isViewLocked ? 'Liberar vista' : 'Fijar vista',
                  isViewLocked
                    ? 'Bloquea auto-ajuste; Espacio + arrastrar (o botón central) mueve la vista sobre las tarjetas'
                    : 'Permite que la pizarra auto-ajuste tarjetas al cambiar de ventana o agregar elementos'
                )
              }
              onMouseLeave={() => setTooltip(null)}
              style={{
                ...TOOL_BTN,
                ...(isViewLocked
                  ? {
                      background:
                        'color-mix(in srgb, var(--accent-primary, #58a6ff) 16%, transparent)',
                      border:
                        '1px solid color-mix(in srgb, var(--accent-primary, #58a6ff) 45%, transparent)',
                      color: 'var(--accent-primary, #58a6ff)',
                    }
                  : {}),
              }}
            >
              {isViewLocked ? (
                <Pin size={15} strokeWidth={2.2} />
              ) : (
                <PinOff size={15} strokeWidth={2.2} />
              )}
            </button>
            {ARRANGE_ACTIONS.map(({ value: arrangeVal, label, description, Icon, accent }) => (
              <button
                key={arrangeVal}
                type="button"
                data-testid={`pizarra-arrange-${arrangeVal}`}
                aria-label={label}
                onClick={() => handleApplyLayout(arrangeVal)}
                onMouseEnter={(e) => showTooltip(e, label, description)}
                onMouseLeave={() => setTooltip(null)}
                style={{
                  ...TOOL_BTN,
                  ...(accent
                    ? {
                        background:
                          'color-mix(in srgb, var(--accent-primary, #58a6ff) 16%, transparent)',
                        border:
                          '1px solid color-mix(in srgb, var(--accent-primary, #58a6ff) 45%, transparent)',
                        color: 'var(--accent-primary, #58a6ff)',
                      }
                    : {}),
                }}
              >
                <Icon size={15} strokeWidth={2.2} />
              </button>
            ))}
          </ToolSection>

          <Divider />

          <ToolSection>
            <SectionLabel
              collapsed={layoutsCollapsed}
              onToggle={() => setLayoutsCollapsed((v) => !v)}
            >
              Layout
            </SectionLabel>
            {!layoutsCollapsed &&
              LAYOUT_PRESETS.map(({ value: presetVal, label, Icon }) => (
                <button
                  key={presetVal}
                  type="button"
                  data-testid={`pizarra-layout-${presetVal}`}
                  aria-label={label}
                  onClick={() => handleApplyLayout(presetVal)}
                  onMouseEnter={(e) => showTooltip(e, label)}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    ...TOOL_BTN,
                    ...(presetVal === 'clear'
                      ? {
                          background: 'rgba(239, 68, 68, 0.08)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                        }
                      : {}),
                  }}
                >
                  <Icon size={15} strokeWidth={2.2} />
                </button>
              ))}
          </ToolSection>

          <Divider />

          <ToolSection>
            <SectionLabel collapsed={shapeCollapsed} onToggle={() => setShapeCollapsed((v) => !v)}>
              Formas
            </SectionLabel>
            {!shapeCollapsed && (
              <ToggleGroup.Root
                type="single"
                value={value}
                onValueChange={handleShapeToolChange}
                orientation="vertical"
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                {SHAPE_TOOLS.map(({ value: toolVal, label, Icon }) => (
                  <ToggleGroup.Item
                    key={toolVal}
                    value={toolVal}
                    aria-label={label}
                    onMouseEnter={(e) => showTooltip(e, label)}
                    onMouseLeave={() => setTooltip(null)}
                    style={{
                      ...TOOL_BTN,
                      ...(value === toolVal
                        ? {
                            background: 'var(--accent-primary, #58a6ff)',
                            color: '#0d1117',
                            border: '1px solid var(--accent-primary, #58a6ff)',
                            outline:
                              value === toolVal
                                ? '1px inset var(--accent-primary, #58a6ff)'
                                : 'none',
                          }
                        : {}),
                    }}
                  >
                    <Icon size={14} strokeWidth={2.2} />
                  </ToggleGroup.Item>
                ))}
              </ToggleGroup.Root>
            )}
          </ToolSection>
        </div>
      </div>
    </div>
  );
}

/**
 * PizarraToolPalette — toolbar for selecting the active drawing tool.
 *
 * Uses Radix ToggleGroup with Lucide icons. Styled with morphology btnSecondaryStyle.
 * Sections: shape tools | element tools (terminal/browser) | fit/layout presets | arrange
 */

import React, { useState } from 'react';
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
} from 'lucide-react';
import { btnSecondaryStyle } from '@/chrome/morphology';
import { useCanvasViewport } from '@/lib/pizarra/canvasViewport';

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

// Arrange actions — non-destructive, operate on current selection or all live surfaces
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

// Shared button base styles
const TOOL_BTN = {
  width: 36,
  height: 36,
  padding: 0,
  borderRadius: 'var(--chrome-radius-control)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--border-subtle)',
  background: 'var(--chrome-control-fill)',
  color: 'var(--text-primary)',
  transition: 'background 0.12s ease, border-color 0.12s ease, color 0.12s ease',
  flexShrink: 0,
};

function ToolSection({ children, style = {} }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--chrome-radius-panel)',
        padding: 5,
        boxShadow: 'var(--shadow-soft)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children, collapsed, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 4,
        padding: '2px 4px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-muted)',
        fontSize: 9,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: '0.08em',
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

export default function PizarraToolPalette({ value, onChange, onAddElement, onApplyLayout }) {
  const { viewportToCanvas, canvasRect } = useCanvasViewport();
  const [layoutsCollapsed, setLayoutsCollapsed] = useState(true);
  const [shapeCollapsed, setShapeCollapsed] = useState(true);
  const [tooltip, setTooltip] = useState(null);
  const [revealed, setRevealed] = useState(false);

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

  return (
    <div
      data-testid="pizarra-tool-palette-shell"
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: revealed ? 80 : 24,
        zIndex: 100,
        pointerEvents: 'auto',
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
          width: 24,
          display: revealed ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 3,
            height: 56,
            borderRadius: 4,
            background:
              'linear-gradient(180deg, transparent, rgba(88,166,255,0.35) 20%, rgba(88,166,255,0.35) 80%, transparent)',
            opacity: 0.7,
          }}
        />
      </div>

      <div
        className="pizarra-tool-palette"
        data-expanded={revealed ? 'true' : 'false'}
        style={{
          position: 'absolute',
          top: '50%',
          left: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: 'rgba(10, 15, 28, 0.82)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(88, 166, 255, 0.15)',
          borderRadius: 10,
          padding: 6,
          boxShadow: '0 6px 24px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset',
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'translate(0, -50%)' : 'translate(-10px, -50%)',
          pointerEvents: revealed ? 'auto' : 'none',
          transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
        }}
      >
        {/* Tooltip overlay */}
        {tooltip && (
          <div
            style={{
              position: 'fixed',
              left: 60,
              top: tooltip.y,
              zIndex: 9999,
              background: 'rgba(10, 15, 28, 0.96)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              padding: '6px 10px',
              maxWidth: 200,
              pointerEvents: 'none',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}
          >
            <p
              style={{
                color: 'var(--text-primary)',
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
                  color: 'var(--text-muted)',
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

        {/* ── Element tools: Terminal + Browser (always visible, most used) ── */}
        <ToolSection>
          {ELEMENT_TOOLS.map(({ value: toolVal, label, Icon }) => (
            <button
              key={toolVal}
              type="button"
              data-testid={`pizarra-add-${toolVal}`}
              aria-label={label}
              onClick={() => handleAddElement(toolVal)}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltip({ label, y: rect.top });
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{
                ...TOOL_BTN,
                color: 'var(--accent-primary)',
                border: '1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)',
              }}
            >
              <Icon size={15} strokeWidth={2.2} />
            </button>
          ))}
        </ToolSection>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '1px 0' }} />

        {/* ── Arrange: Fit All (prominent) + others ── */}
        <ToolSection>
          {ARRANGE_ACTIONS.map(({ value: arrangeVal, label, description, Icon, accent }) => (
            <button
              key={arrangeVal}
              type="button"
              data-testid={`pizarra-arrange-${arrangeVal}`}
              aria-label={label}
              onClick={() => handleApplyLayout(arrangeVal)}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltip({ label, description, y: rect.top });
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{
                ...TOOL_BTN,
                ...(accent
                  ? {
                      background: 'color-mix(in srgb, var(--accent-primary) 14%, transparent)',
                      border:
                        '1px solid color-mix(in srgb, var(--accent-primary) 40%, transparent)',
                      color: 'var(--accent-primary)',
                    }
                  : {}),
              }}
            >
              <Icon size={15} strokeWidth={2.2} />
            </button>
          ))}
        </ToolSection>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '1px 0' }} />

        {/* ── Layout presets (collapsible) ── */}
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
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({ label, y: rect.top });
                }}
                onMouseLeave={() => setTooltip(null)}
                style={{
                  ...TOOL_BTN,
                  ...(presetVal === 'clear'
                    ? {
                        background: 'rgba(239, 68, 68, 0.08)',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                      }
                    : {}),
                }}
              >
                <Icon size={15} strokeWidth={2.2} />
              </button>
            ))}
        </ToolSection>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '1px 0' }} />

        {/* ── Shape tools (collapsible, less used) ── */}
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
              style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
            >
              {SHAPE_TOOLS.map(({ value: toolVal, label, Icon }) => (
                <ToggleGroup.Item
                  key={toolVal}
                  value={toolVal}
                  aria-label={label}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltip({ label, y: rect.top });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    ...TOOL_BTN,
                    ...(value === toolVal
                      ? {
                          background: 'var(--accent-primary)',
                          color: '#0d1117',
                          border: '1px solid var(--accent-primary)',
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
  );
}

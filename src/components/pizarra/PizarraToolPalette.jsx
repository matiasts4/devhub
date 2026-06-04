/**
 * PizarraToolPalette — toolbar for selecting the active drawing tool.
 *
 * Uses Radix ToggleGroup with Lucide icons. Styled with morphology btnSecondaryStyle.
 */

import React from 'react';
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
  Plus,
  Columns,
  LayoutGrid,
  Layout,
  Trash2,
  ArrowLeftRight,
  ArrowUpDown,
  Maximize2,
  Grid2X2,
} from 'lucide-react';
import { btnSecondaryStyle } from '@/chrome/morphology';
import { useCanvasViewport } from '@/lib/pizarra/canvasViewport';

const SHAPE_TOOLS = [
  { value: 'select', label: 'Select', Icon: MousePointer },
  { value: 'text', label: 'Text', Icon: Type },
  { value: 'rect', label: 'Rectangle', Icon: Square },
  { value: 'circle', label: 'Circle', Icon: Circle },
  { value: 'line', label: 'Line', Icon: Minus },
  { value: 'arrow', label: 'Arrow', Icon: ArrowRight },
];

const ELEMENT_TOOLS = [
  { value: 'terminal', label: 'Add Terminal', Icon: Terminal },
  { value: 'browser', label: 'Add Browser', Icon: Globe },
];

const LAYOUT_PRESETS = [
  { value: 'dev-split', label: 'Split (1 Browser + 1 Terminal)', Icon: Columns },
  { value: 'dev-trio', label: 'Trio (1 Browser + 2 Terminals)', Icon: LayoutGrid },
  { value: 'dual-browser', label: 'Dual Column (2 Browsers)', Icon: Layout },
  { value: 'clear', label: 'Clear Whiteboard', Icon: Trash2 },
];

// Arrange actions operate on current selection (or all live surfaces) and are
// non-destructive. They compute responsive layouts from visible region + current bounds.
const ARRANGE_ACTIONS = [
  { value: 'arrange-h', label: 'Tile horizontal (equal widths)', Icon: ArrowLeftRight },
  { value: 'arrange-v', label: 'Tile vertical (equal heights)', Icon: ArrowUpDown },
  { value: 'arrange-equal', label: 'Equalize sizes (keep positions)', Icon: Maximize2 },
  { value: 'arrange-grid', label: 'Grid 2-col (auto rows)', Icon: Grid2X2 },
];

export default function PizarraToolPalette({ value, onChange, onAddElement, onApplyLayout }) {
  // onApplyLayout is reused for both destructive presets ('dev-split' etc + 'clear')
  // and non-destructive arrange actions ('arrange-h' etc). Pane dispatches accordingly.
  const { viewportToCanvas, canvasRect } = useCanvasViewport();

  const handleShapeToolChange = (val) => val && onChange(val);

  const handleAddElement = (type) => {
    let cx = 0;
    let cy = 0;
    if (canvasRect) {
      const center = viewportToCanvas(canvasRect.width / 2, canvasRect.height / 2);
      cx = center.x;
      cy = center.y;
    }
    onAddElement?.(type, { x: cx, y: cy });
  };

  const handleApplyLayout = (presetType) => {
    let cx = 0;
    let cy = 0;
    if (canvasRect) {
      const center = viewportToCanvas(canvasRect.width / 2, canvasRect.height / 2);
      cx = center.x;
      cy = center.y;
    }
    onApplyLayout?.(presetType, { x: cx, y: cy });
  };

  return (
    <div
      className="pizarra-tool-palette"
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        pointerEvents: 'auto',
        background: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid rgba(88, 166, 255, 0.2)',
        borderRadius: 8,
        padding: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      <ToggleGroup.Root
        type="single"
        value={value}
        onValueChange={handleShapeToolChange}
        orientation="vertical"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: 'var(--surface-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--chrome-radius-panel)',
          padding: 6,
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        {SHAPE_TOOLS.map(({ value: toolVal, label, Icon }) => (
          <ToggleGroup.Item
            key={toolVal}
            value={toolVal}
            aria-label={label}
            title={label}
            data-pizarra-tool={toolVal}
            data-pizarra-active={value === toolVal ? 'true' : 'false'}
            onMouseEnter={(event) => {
              event.currentTarget.dataset.pizarraHovered = 'true';
            }}
            onMouseLeave={(event) => {
              delete event.currentTarget.dataset.pizarraHovered;
            }}
            onMouseDown={(event) => {
              event.currentTarget.dataset.pizarraActive = 'true';
            }}
            onMouseUp={(event) => {
              if (value !== toolVal) delete event.currentTarget.dataset.pizarraActive;
            }}
            style={{
              ...btnSecondaryStyle({ size: 'sm' }),
              width: 36,
              height: 36,
              padding: 0,
              borderRadius: 'var(--chrome-radius-control)',
              background:
                value === toolVal ? 'var(--accent-primary)' : 'var(--chrome-control-fill)',
              color: value === toolVal ? '#0d1117' : 'var(--text-primary)',
              border:
                value === toolVal
                  ? '1px solid var(--accent-primary)'
                  : '1px solid var(--border-subtle)',
              outline: value === toolVal ? '1px inset var(--accent-primary)' : 'none',
              outlineOffset: value === toolVal ? '-2px' : '0',
              cursor: 'pointer',
              transition: 'border-color 0.15s ease, outline-color 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={16} strokeWidth={2.5} />
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: 'var(--border-subtle)',
          margin: '2px 0',
        }}
      />

      {/* Element tools — add terminal or browser */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: 'var(--surface-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--chrome-radius-panel)',
          padding: 6,
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        {ELEMENT_TOOLS.map(({ value: toolVal, label, Icon }) => (
          <button
            key={toolVal}
            type="button"
            data-testid={`pizarra-add-${toolVal}`}
            aria-label={label}
            title={label}
            onClick={() => handleAddElement(toolVal)}
            onMouseEnter={(event) => {
              event.currentTarget.dataset.pizarraHovered = 'true';
            }}
            onMouseLeave={(event) => {
              delete event.currentTarget.dataset.pizarraHovered;
            }}
            onMouseDown={(event) => {
              event.currentTarget.dataset.pizarraActive = 'true';
            }}
            onMouseUp={(event) => {
              delete event.currentTarget.dataset.pizarraActive;
            }}
            style={{
              ...btnSecondaryStyle({ size: 'sm' }),
              width: 36,
              height: 36,
              padding: 0,
              borderRadius: 'var(--chrome-radius-control)',
              background: 'var(--chrome-control-fill)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={16} strokeWidth={2.5} />
          </button>
        ))}
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: 'var(--border-subtle)',
          margin: '2px 0',
        }}
      />

      {/* Predefined Layouts (destructive: load full preset, clears current) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: 'var(--surface-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--chrome-radius-panel)',
          padding: 6,
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        {LAYOUT_PRESETS.map(({ value: presetVal, label, Icon }) => (
          <button
            key={presetVal}
            type="button"
            data-testid={`pizarra-layout-${presetVal}`}
            aria-label={label}
            title={label}
            onClick={() => handleApplyLayout(presetVal)}
            onMouseEnter={(event) => {
              event.currentTarget.dataset.pizarraHovered = 'true';
            }}
            onMouseLeave={(event) => {
              delete event.currentTarget.dataset.pizarraHovered;
            }}
            onMouseDown={(event) => {
              event.currentTarget.dataset.pizarraActive = 'true';
            }}
            onMouseUp={(event) => {
              delete event.currentTarget.dataset.pizarraActive;
            }}
            style={{
              ...btnSecondaryStyle({ size: 'sm' }),
              width: 36,
              height: 36,
              padding: 0,
              borderRadius: 'var(--chrome-radius-control)',
              background:
                presetVal === 'clear' ? 'rgba(239, 68, 68, 0.1)' : 'var(--chrome-control-fill)',
              color: presetVal === 'clear' ? '#ef4444' : 'var(--text-primary)',
              border:
                presetVal === 'clear'
                  ? '1px solid rgba(239, 68, 68, 0.2)'
                  : '1px solid var(--border-subtle)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={16} strokeWidth={2.5} />
          </button>
        ))}
      </div>

      {/* Arrange / organize (non-destructive: adapts current selection or live surfaces) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: 'var(--surface-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--chrome-radius-panel)',
          padding: 6,
          boxShadow: 'var(--shadow-soft)',
          marginTop: 4,
        }}
      >
        {ARRANGE_ACTIONS.map(({ value: arrangeVal, label, Icon }) => (
          <button
            key={arrangeVal}
            type="button"
            data-testid={`pizarra-arrange-${arrangeVal}`}
            aria-label={label}
            title={label}
            onClick={() => handleApplyLayout(arrangeVal)}
            onMouseEnter={(event) => {
              event.currentTarget.dataset.pizarraHovered = 'true';
            }}
            onMouseLeave={(event) => {
              delete event.currentTarget.dataset.pizarraHovered;
            }}
            onMouseDown={(event) => {
              event.currentTarget.dataset.pizarraActive = 'true';
            }}
            onMouseUp={(event) => {
              delete event.currentTarget.dataset.pizarraActive;
            }}
            style={{
              ...btnSecondaryStyle({ size: 'sm' }),
              width: 36,
              height: 36,
              padding: 0,
              borderRadius: 'var(--chrome-radius-control)',
              background: 'var(--chrome-control-fill)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={16} strokeWidth={2.5} />
          </button>
        ))}
      </div>
    </div>
  );
}

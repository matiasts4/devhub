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
} from 'lucide-react';
import { btnSecondaryStyle } from '@/chrome/morphology';

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

export default function PizarraToolPalette({ value, onChange, onAddElement }) {
  const handleShapeToolChange = (val) => val && onChange(val);
  const handleAddElement = (type) => onAddElement?.(type);

  return (
    <div
      className="pizarra-tool-palette"
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        pointerEvents: 'auto',
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
              cursor: 'pointer',
              transition: 'all 0.15s ease',
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
    </div>
  );
}

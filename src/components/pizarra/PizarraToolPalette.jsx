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
} from 'lucide-react';
import { btnSecondaryStyle } from '@/chrome/morphology';

const TOOLS = [
  { value: 'select', label: 'Select', Icon: MousePointer },
  { value: 'text', label: 'Text', Icon: Type },
  { value: 'rect', label: 'Rectangle', Icon: Square },
  { value: 'circle', label: 'Circle', Icon: Circle },
  { value: 'line', label: 'Line', Icon: Minus },
  { value: 'arrow', label: 'Arrow', Icon: ArrowRight },
];

export default function PizarraToolPalette({ value, onChange }) {
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
        onValueChange={(val) => val && onChange(val)}
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
        {TOOLS.map(({ value: toolVal, label, Icon }) => (
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
              justifyContent: 'center',
              borderRadius: 'var(--chrome-radius-control)',
              background:
                value === toolVal
                  ? 'var(--accent-primary)'
                  : 'var(--chrome-control-fill)',
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
    </div>
  );
}
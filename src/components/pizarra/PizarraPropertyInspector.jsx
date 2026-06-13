/**
 * PizarraPropertyInspector — edit shape properties via Radix Popover.
 *
 * Shows when a shape is selected; edits fill, stroke, strokeWidth, opacity,
 * cornerRadius (rect), text/fontSize (textbox) in real time.
 */

import React, { useEffect, useRef } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as Slider from '@radix-ui/react-slider';
import { panelStyle, btnSecondaryStyle } from '@/chrome/morphology';

function ColorField({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="color"
          value={value || '#3b82f6'}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 32,
            height: 24,
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            padding: 1,
            cursor: 'pointer',
            background: 'transparent',
          }}
        />
        <input
          type="text"
          value={value || '#3b82f6'}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...btnSecondaryStyle({ size: 'xs' }),
            flex: 1,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
          }}
        />
      </div>
    </div>
  );
}

function SliderField({ label, value, min, max, step = 1, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
          }}
        >
          {label}
        </label>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: 'var(--text-muted)',
          }}
        >
          {typeof value === 'number' ? value.toFixed(step < 1 ? 2 : 0) : value}
        </span>
      </div>
      <Slider.Root
        value={[typeof value === 'number' ? value : min]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          height: 20,
          touchAction: 'none',
          userSelect: 'none',
          width: '100%',
        }}
      >
        <Slider.Track
          style={{
            background: 'var(--border-subtle)',
            position: 'relative',
            flexGrow: 1,
            borderRadius: 9999,
            height: 4,
          }}
        >
          <Slider.Range
            style={{
              position: 'absolute',
              background: 'var(--accent-primary)',
              borderRadius: 'inherit',
              height: '100%',
            }}
          />
        </Slider.Track>
        <Slider.Thumb
          style={{
            display: 'block',
            width: 14,
            height: 14,
            background: 'var(--accent-primary)',
            borderRadius: '50%',
            boxShadow: 'var(--chrome-shadow-control)',
            cursor: 'pointer',
            outline: 'none',
          }}
        />
      </Slider.Root>
    </div>
  );
}

function TextField({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...btnSecondaryStyle({ size: 'sm' }),
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
        }}
      />
    </div>
  );
}

export default function PizarraPropertyInspector({ selectedElement, onUpdate }) {
  const [open, setOpen] = React.useState(false);

  // Open popover when a shape is selected
  useEffect(() => {
    if (selectedElement) {
      setOpen(true);
    }
  }, [selectedElement]);

  if (!selectedElement) return null;

  const shape = selectedElement;
  const type = shape.type;

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 10,
        pointerEvents: 'auto',
      }}
    >
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            style={{
              ...btnSecondaryStyle({ size: 'sm' }),
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 0.75rem',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Properties
            </span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={8}
            style={{
              ...panelStyle({ tone: 'accent' }),
              padding: 14,
              width: 220,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              zIndex: 100,
              animation: 'fadeInUp 0.2s ease-out',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
              {type} properties
            </div>

            {/* Common visual fields */}
            <ColorField
              label="Fill"
              value={shape.fill}
              onChange={(v) => onUpdate(shape.id, { fill: v })}
            />
            <ColorField
              label="Stroke"
              value={shape.stroke}
              onChange={(v) => onUpdate(shape.id, { stroke: v })}
            />
            <SliderField
              label="Stroke Width"
              value={shape.strokeWidth}
              min={0}
              max={20}
              step={1}
              onChange={(v) => onUpdate(shape.id, { strokeWidth: v })}
            />
            <SliderField
              label="Opacity"
              value={shape.opacity}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => onUpdate(shape.id, { opacity: v })}
            />

            {/* Type-specific fields */}
            {type === 'rect' && (
              <SliderField
                label="Corner Radius"
                value={shape.cornerRadius}
                min={0}
                max={40}
                step={1}
                onChange={(v) => onUpdate(shape.id, { cornerRadius: v })}
              />
            )}

            {type === 'textbox' && (
              <>
                <TextField
                  label="Text"
                  value={shape.text}
                  onChange={(v) => onUpdate(shape.id, { text: v })}
                />
                <SliderField
                  label="Font Size"
                  value={shape.fontSize}
                  min={10}
                  max={72}
                  step={1}
                  onChange={(v) => onUpdate(shape.id, { fontSize: v })}
                />
              </>
            )}

            {/* Delete button */}
            <button
              style={{
                ...btnSecondaryStyle({ size: 'sm' }),
                color: 'var(--danger)',
                borderColor: 'color-mix(in srgb, var(--danger) 40%, var(--border-subtle))',
                marginTop: 4,
              }}
              onClick={() => {
                // Dispatch delete handled externally via onUpdate returning null id
              }}
            >
              Delete Shape
            </button>

            <Popover.Close asChild>
              <button
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 20,
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 16,
                  borderRadius: 4,
                }}
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </Popover.Close>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
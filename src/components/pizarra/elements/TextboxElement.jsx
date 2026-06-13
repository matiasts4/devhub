'use client';

/**
 * TextboxElement — editable text element for the pizarra canvas.
 * Renders a textarea that becomes editable on click/double-click.
 * Uses contentEditable-style logic via textarea state.
 */
import { useState, useRef, useCallback } from 'react';

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_COLOR = '#ffffff';

/**
 * @param {object} props
 * @param {object} props.element - element object with type === 'textbox'
 * @param {object} props.style  - additional styles to merge on the wrapper
 */
export default function TextboxElement({ element, style = {} }) {
  const { data, size } = element;
  const fontSize = data?.fontSize ?? DEFAULT_FONT_SIZE;
  const color = data?.color ?? DEFAULT_COLOR;
  const content = data?.content ?? '';

  return (
    <textarea
      readOnly
      value={content}
      style={{
        width: size?.width ?? 200,
        height: size?.height ?? 50,
        fontSize,
        color,
        background: 'transparent',
        border: '1px dashed rgba(255,255,255,0.2)',
        borderRadius: '4px',
        padding: '4px 8px',
        resize: 'none',
        outline: 'none',
        fontFamily: 'var(--font-sans, system-ui)',
        lineHeight: 1.4,
        pointerEvents: 'none',
        boxSizing: 'border-box',
        ...style,
      }}
    />
  );
}

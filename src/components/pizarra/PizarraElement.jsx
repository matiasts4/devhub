'use client';

import { motion } from 'framer-motion';
import { useCanvasViewport } from './CanvasViewportContext';

/**
 * PizarraElement — base wrapper for any canvas element.
 * Uses Framer Motion drag, which operates in viewport coordinates relative to
 * the element's initial position. We convert drag deltas back to canvas logical
 * coords via the viewport context.
 *
 * Skips drag entirely when element.locked === true.
 */
export default function PizarraElement({ element, onSelect, onPositionChange, children }) {
  const { zoom, pan, canvasRect, canvasToViewport } = useCanvasViewport();

  const { id, position, locked, selected } = element;

  const screenPos = canvasToViewport(position.x, position.y);

  const handleDrag = (_, info) => {
    if (locked) return;
    const newCanvasX = position.x + info.delta.x / zoom;
    const newCanvasY = position.y + info.delta.y / zoom;
    onPositionChange?.(id, { x: newCanvasX, y: newCanvasY });
  };

  const handleClick = (e) => {
    e.stopPropagation();
    onSelect?.(id);
  };

  return (
    <motion.div
      drag={!locked}
      dragMomentum={false}
      dragElastic={0}
      onDrag={handleDrag}
      onClick={handleClick}
      style={{
        position: 'absolute',
        left: screenPos.x,
        top: screenPos.y,
        cursor: locked ? 'not-allowed' : 'grab',
        outline: selected ? '2px solid var(--accent-primary)' : 'none',
        outlineOffset: '2px',
        zIndex: element.zIndex,
      }}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
    >
      {typeof children === 'function'
        ? children({ screenX: screenPos.x, screenY: screenPos.y })
        : children}
    </motion.div>
  );
}

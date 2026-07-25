'use client';

import { PIZARRA_SURFACE_FRAME_INSET } from '@/lib/pizarra/surfaceMotion';

/**
 * SurfaceDragRing — invisible border strips that make the ENTIRE perimeter
 * of a pizarra surface a drag target for moving it.
 *
 * Problem it solves: previously the only move affordance was the small
 * header bar (26px terminal / 22px grip browser). Users found it "muy
 * delicado" — hard to grab, easy to miss. The 6px frame ring around the
 * content was dead space where clicks fell through to the canvas.
 *
 * Design: 4 strips centered on the frame boundary (the line where the
 * visible frame border sits). Each strip is STRIP_THICKNESS px thick,
 * extending both outward (into the dead space beyond the surface root)
 * and inward (covering the frame ring + a few px of content edge).
 * The cursor changes to 'move' on hover, providing the affordance.
 *
 * Z-order: below resize handles (z 5/6) so border resize wins when
 * handles are visible; above the inner frame (z auto) so the strips
 * capture events in the overlap zone.
 *
 * The strips call the same drag-start handler as the header
 * (usePizarraSurfaceDrag), so move + select behavior is identical.
 */

const STRIP_THICKNESS = 14;

export default function SurfaceDragRing({
  onMouseDown,
  locked = false,
  testIdPrefix = 'pizarra-surface',
}) {
  const fi = PIZARRA_SURFACE_FRAME_INSET;
  const half = STRIP_THICKNESS / 2;
  // Center the strip on the frame boundary line.
  const offset = fi - half; // negative → extends beyond root edge

  const base = {
    position: 'absolute',
    pointerEvents: 'auto',
    zIndex: 4,
    cursor: locked ? 'default' : 'move',
    userSelect: 'none',
    // Debug aid: uncomment to visualize the hit zone.
    // background: 'rgba(255, 0, 0, 0.15)',
  };

  return (
    <>
      <div
        data-testid={`${testIdPrefix}-drag-ring-n`}
        data-pizarra-surface-drag-handle="true"
        onMouseDown={onMouseDown}
        style={{ ...base, top: offset, left: offset, right: offset, height: STRIP_THICKNESS }}
      />
      <div
        data-testid={`${testIdPrefix}-drag-ring-s`}
        data-pizarra-surface-drag-handle="true"
        onMouseDown={onMouseDown}
        style={{ ...base, bottom: offset, left: offset, right: offset, height: STRIP_THICKNESS }}
      />
      <div
        data-testid={`${testIdPrefix}-drag-ring-w`}
        data-pizarra-surface-drag-handle="true"
        onMouseDown={onMouseDown}
        style={{ ...base, left: offset, top: offset, bottom: offset, width: STRIP_THICKNESS }}
      />
      <div
        data-testid={`${testIdPrefix}-drag-ring-e`}
        data-pizarra-surface-drag-handle="true"
        onMouseDown={onMouseDown}
        style={{ ...base, right: offset, top: offset, bottom: offset, width: STRIP_THICKNESS }}
      />
    </>
  );
}

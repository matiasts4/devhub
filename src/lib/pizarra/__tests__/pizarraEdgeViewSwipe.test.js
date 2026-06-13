import {
  computeEdgeDragPan,
  computeQuantizedEdgePan,
  edgeDragToProgress,
  edgeSwipeProgress,
  resolveEdgeSwipeCommit,
} from '../pizarraEdgeViewSwipe';

describe('pizarraEdgeViewSwipe', () => {
  test('computeEdgeDragPan follows horizontal drag', () => {
    expect(computeEdgeDragPan({ x: 100, y: 50 }, -80)).toEqual({ x: 20, y: 50 });
  });

  test('computeEdgeDragPan rubber-bands at boundary', () => {
    expect(computeEdgeDragPan({ x: 100, y: 0 }, -200, { atBoundary: true })).toEqual({
      x: 56,
      y: 0,
    });
  });

  test('resolveEdgeSwipeCommit commits next from right edge', () => {
    expect(
      resolveEdgeSwipeCommit({
        side: 'right',
        deltaX: -340,
        viewportWidth: 1200,
        canGoNext: true,
      })
    ).toBe('next');
  });

  test('resolveEdgeSwipeCommit cancels weak drag', () => {
    expect(
      resolveEdgeSwipeCommit({
        side: 'right',
        deltaX: -20,
        viewportWidth: 1200,
        canGoNext: true,
      })
    ).toBe('cancel');
  });

  test('resolveEdgeSwipeCommit commits prev from left edge', () => {
    expect(
      resolveEdgeSwipeCommit({
        side: 'left',
        deltaX: 340,
        viewportWidth: 1200,
        canGoPrev: true,
      })
    ).toBe('prev');
  });

  test('edgeSwipeProgress scales with threshold', () => {
    expect(edgeSwipeProgress(-168, 1200, 'right')).toBeCloseTo(0.5, 1);
  });

  test('computeQuantizedEdgePan interpolates between view pans', () => {
    expect(computeQuantizedEdgePan({ x: 0, y: 0 }, { x: -400, y: 0 }, 0.5)).toEqual({
      x: -200,
      y: 0,
    });
  });

  test('edgeDragToProgress maps drag distance to unit progress', () => {
    expect(edgeDragToProgress(-336, 1200, 'right')).toBeCloseTo(1, 1);
  });
});

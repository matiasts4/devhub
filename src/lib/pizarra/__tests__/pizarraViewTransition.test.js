import { animatePanTransition, easeOutCubic } from '../pizarraViewTransition';

describe('pizarraViewTransition', () => {
  test('easeOutCubic approaches 1 at t=1', () => {
    expect(easeOutCubic(1)).toBeCloseTo(1);
    expect(easeOutCubic(0)).toBe(0);
  });

  test('animatePanTransition calls onComplete', () => {
    jest.useFakeTimers();
    const frames = [];
    let done = false;

    animatePanTransition({
      fromPan: { x: 0, y: 0 },
      toPan: { x: 100, y: 50 },
      duration: 0,
      onFrame: (p) => frames.push(p),
      onComplete: () => {
        done = true;
      },
    });

    expect(frames.length).toBeGreaterThan(0);
    expect(done).toBe(true);
    jest.useRealTimers();
  });
});
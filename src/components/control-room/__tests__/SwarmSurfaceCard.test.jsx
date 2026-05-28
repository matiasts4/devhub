const React = require('react');
const { installDom, renderIntoDom, cleanupMountedRoots } = require('@/test-support/domHarness');

const { SurfaceCard, surfaceCardStyle } = require('../SwarmSurfaceCard');

const mountedRoots = [];

describe('SwarmSurfaceCard shared chrome', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
  });

  test('surfaceCardStyle resolves morphology token-based chrome instead of hardcoded amber fills', () => {
    const neutral = surfaceCardStyle();
    const emphasized = surfaceCardStyle({ emphasized: true });

    expect(neutral).toEqual(
      expect.objectContaining({
        background: expect.stringContaining('var(--chrome-panel-fill'),
        borderColor: 'var(--chrome-border-color)',
        borderWidth: 'var(--chrome-border-width)',
        borderRadius: 'var(--chrome-radius-panel)',
        boxShadow: 'var(--chrome-shadow-panel)',
      })
    );

    expect(emphasized.background).toContain('var(--chrome-panel-fill-emphasis');
    expect(emphasized.background).not.toContain('255,176,64');
  });

  test('SurfaceCard renders shared chrome data hooks for morphology-aware surfaces', async () => {
    const view = await renderIntoDom(
      React.createElement(SurfaceCard, { emphasized: true, className: 'p-5' }, 'Surface body'),
      mountedRoots
    );
    const card = view.container.firstElementChild;

    expect(card).not.toBeNull();
    expect(card.getAttribute('data-chrome-surface')).toBe('panel');
    expect(card.getAttribute('data-emphasized')).toBe('true');
    expect(card.textContent).toContain('Surface body');
  });
});

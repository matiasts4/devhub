const React = require('react');
const { installDom, renderIntoDom, cleanupMountedRoots } = require('@/test-support/domHarness');

const { ChromeSurface, chromeSurfaceStyle } = require('../chrome-surface');

const mountedRoots = [];

describe('ChromeSurface', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
  });

  test('keeps shared morphology chrome while allowing caller overrides', async () => {
    const view = await renderIntoDom(
      React.createElement(
        ChromeSurface,
        {
          surface: 'panel',
          emphasized: true,
          style: { background: 'rgb(1, 2, 3)' },
        },
        'Panel'
      ),
      mountedRoots
    );

    const panel = view.container.firstElementChild;
    const baseStyle = chromeSurfaceStyle({ surface: 'panel', emphasized: true });
    const inlineStyle = panel.getAttribute('style');

    expect(panel.style.background).toBe('rgb(1, 2, 3)');
    expect(panel.getAttribute('data-chrome-surface')).toBe('panel');
    expect(panel.getAttribute('data-emphasized')).toBe('true');
    expect(inlineStyle).toContain(`box-shadow: ${baseStyle.boxShadow}`);
    expect(inlineStyle).toContain(`border-radius: ${baseStyle.borderRadius}`);
  });
});

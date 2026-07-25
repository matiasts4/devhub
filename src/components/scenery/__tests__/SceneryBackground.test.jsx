const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const domHarness = require('@/test-support/domHarness');

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

const SceneryBackground = require('../SceneryBackground').default;
const { writeSceneryPrefs, SCENERY_SCOPES } = require('@/lib/sceneries/sceneryPreferences');

let dom;
const mountedRoots = [];

function renderIntoDom(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  flushSync(() => {
    root.render(element);
  });
  return { container, root };
}

describe('SceneryBackground', () => {
  beforeEach(() => {
    dom = domHarness.installDom();
  });

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const { root, container } = mountedRoots.pop();
      flushSync(() => root.unmount());
      container.remove();
    }
    if (dom?.window?.close) dom.window.close();
  });

  test('renders nothing when no scenery is active', () => {
    const view = renderIntoDom(React.createElement(SceneryBackground, { scope: 'pizarra' }));
    expect(view.container.querySelector('[data-testid="scenery-background-pizarra"]')).toBeNull();
  });

  test('renders the scenery layer when active for the matching scope', () => {
    writeSceneryPrefs({ sceneryId: 'meadow', scope: SCENERY_SCOPES.BOTH });
    const view = renderIntoDom(React.createElement(SceneryBackground, { scope: 'pizarra' }));

    const layer = view.container.querySelector('[data-testid="scenery-background-pizarra"]');
    expect(layer).toBeTruthy();
    expect(layer.getAttribute('data-scenery-id')).toBe('meadow');
    // JSDOM drops complex multi-layer gradient strings from style.backgroundImage,
    // so assert on the base color (which JSDOM does serialize) to prove the
    // scenery style was applied.
    expect(layer.style.backgroundColor).toBe('rgb(13, 27, 36)');
  });

  test('does not render for a scope excluded by the prefs scope', () => {
    writeSceneryPrefs({ sceneryId: 'meadow', scope: SCENERY_SCOPES.TERMINAL });
    const view = renderIntoDom(React.createElement(SceneryBackground, { scope: 'pizarra' }));
    expect(view.container.querySelector('[data-testid="scenery-background-pizarra"]')).toBeNull();
  });

  test('renders the dim overlay when overlayOpacity is set', () => {
    writeSceneryPrefs({ sceneryId: 'meadow', scope: SCENERY_SCOPES.BOTH, overlayOpacity: 0.5 });
    const view = renderIntoDom(React.createElement(SceneryBackground, { scope: 'terminal' }));
    expect(view.container.querySelector('[data-testid="scenery-overlay"]')).toBeTruthy();
  });

  test('publishes the terminal glass tint as a CSS variable on body', () => {
    writeSceneryPrefs({ sceneryId: 'meadow', scope: SCENERY_SCOPES.BOTH, terminalTint: 0.8 });
    renderIntoDom(React.createElement(SceneryBackground, { scope: 'pizarra' }));
    expect(document.body.style.getPropertyValue('--scenery-terminal-tint')).toBe(
      'rgba(8, 10, 16, 0.8)'
    );
  });

  test('reacts to live scenery change events', () => {
    const view = renderIntoDom(React.createElement(SceneryBackground, { scope: 'pizarra' }));
    expect(view.container.querySelector('[data-testid="scenery-background-pizarra"]')).toBeNull();

    // Activate a scenery — the component listens for the broadcast event.
    flushSync(() => {
      writeSceneryPrefs({ sceneryId: 'aurora', scope: SCENERY_SCOPES.BOTH });
    });

    const layer = view.container.querySelector('[data-testid="scenery-background-pizarra"]');
    expect(layer).toBeTruthy();
    expect(layer.getAttribute('data-scenery-id')).toBe('aurora');
  });
});

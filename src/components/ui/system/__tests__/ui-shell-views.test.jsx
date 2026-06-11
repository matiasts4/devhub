const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

const mockUsePathname = jest.fn(() => '/settings/appearance');

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

jest.mock('lucide-react', () => {
  const React = require('react');
  const icon = (name) => (props) => React.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('next/link', () => {
  const React = require('react');
  return ({ children, ...props }) => React.createElement('a', props, children);
});

const SettingsLayout = require('../../../../app/settings/layout').default;

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test/settings/appearance',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Event = dom.window.Event;
  global.localStorage = dom.window.localStorage;
  return dom;
}

async function flushEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderIntoDom(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(element));
  await flushEffects();
  return { container, root };
}

describe('Settings layout — UiShell migration', () => {
  let dom;
  let rendered;

  beforeEach(() => {
    dom = installDom();
    rendered = null;
    mockUsePathname.mockReturnValue('/settings/appearance');
  });

  afterEach(() => {
    if (rendered?.root) {
      flushSync(() => rendered.root.unmount());
    }
    dom.window.close();
    delete global.localStorage;
    jest.clearAllMocks();
  });

  test('renders UiHeader with the per-route title and a ui-header testid', async () => {
    rendered = await renderIntoDom(
      React.createElement(
        SettingsLayout,
        null,
        React.createElement('div', { 'data-testid': 'child-content' }, 'content')
      )
    );

    expect(rendered.container.querySelector('[data-testid="child-content"]')).toBeTruthy();
    const uiHeader = rendered.container.querySelector('[data-testid="ui-header"]');
    expect(uiHeader).toBeTruthy();

    // The header exposes a <h1> title derived from the active pathname.
    const heading = uiHeader.querySelector('h1');
    expect(heading).toBeTruthy();
    expect(heading.textContent).toMatch(/appearance/i);
  });

  test('derives a different title for the Account subroute', async () => {
    mockUsePathname.mockReturnValue('/settings/account');
    rendered = await renderIntoDom(
      React.createElement(
        SettingsLayout,
        null,
        React.createElement('div', { 'data-testid': 'child-content' }, 'content')
      )
    );
    const uiHeader = rendered.container.querySelector('[data-testid="ui-header"]');
    expect(uiHeader).toBeTruthy();
    const heading = uiHeader.querySelector('h1');
    expect(heading).toBeTruthy();
    expect(heading.textContent).toMatch(/account/i);
  });
});

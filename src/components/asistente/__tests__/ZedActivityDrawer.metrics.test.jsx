'use strict';

const React = require('react');
const { JSDOM } = require('jsdom');
const { act } = require('react');

jest.mock('framer-motion', () => {
  const React = require('react');
  const mockEl =
    (tag) =>
    ({ children, ...props }) =>
      React.createElement(tag, props, children);
  return {
    motion: { div: mockEl('div') },
    AnimatePresence: ({ children }) => children,
  };
});

jest.mock('../ZedActionCard', () => {
  const React = require('react');
  return function MockZedActionCard() {
    return React.createElement('div', { 'data-testid': 'zed-action-card' });
  };
});

jest.mock('../ZedAuditTrace', () => {
  const React = require('react');
  return function MockZedAuditTrace() {
    return null;
  };
});

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

function renderDrawer(props) {
  const ZedActivityDrawer = require('../ZedActivityDrawer').default;
  const { createRoot } = require('react-dom/client');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(React.createElement(ZedActivityDrawer, props));
  });

  return {
    container,
    unmount: () => {
      act(() => root.unmount());
    },
  };
}

describe('ZedActivityDrawer metrics and agent status', () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  test('renders agent status and metrics summary', () => {
    const { container, unmount } = renderDrawer({
      expanded: true,
      onToggle: jest.fn(),
      agentStatus: { status: 'working', currentTaskId: 'task-xyz' },
      metrics: {
        fastPath: { hitRate: 87 },
        roundTrip: { avgMs: 340, p95Ms: 890 },
      },
    });

    expect(container.textContent).toMatch(/working/);
    expect(container.textContent).toMatch(/task-xyz/);
    expect(container.textContent).toMatch(/87%/);
    expect(container.textContent).toMatch(/340ms/);
    expect(container.textContent).toMatch(/890ms/);

    unmount();
  });

  test('does not render metrics panel when omitted', () => {
    const { container, unmount } = renderDrawer({
      expanded: true,
      onToggle: jest.fn(),
    });

    expect(container.textContent).not.toMatch(/Fast-path/);

    unmount();
  });
});

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

describe('ZedActivityDrawer local_intent approval', () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  test('shows local_intent preview and Ejecutar/Cancelar actions', () => {
    const onApprove = jest.fn();
    const onReject = jest.fn();

    const { container, unmount } = renderDrawer({
      expanded: true,
      onToggle: jest.fn(),
      pendingApproval: {
        kind: 'local_intent',
        message: 'cierra la terminal',
        preview: '¿Confirmás esta acción? close_terminal',
      },
      onApprove,
      onReject,
    });

    const card = container.querySelector('[data-testid="zed-approval-card"]');
    expect(card).not.toBeNull();
    expect(card.getAttribute('data-approval-kind')).toBe('local_intent');
    expect(card.textContent).toMatch(/Confirmás esta acción/);

    const approveBtn = [...card.querySelectorAll('button')].find(
      (b) => b.textContent === 'Ejecutar'
    );
    const rejectBtn = [...card.querySelectorAll('button')].find(
      (b) => b.textContent === 'Cancelar'
    );
    expect(approveBtn).toBeTruthy();
    expect(rejectBtn).toBeTruthy();

    act(() => {
      approveBtn.click();
      rejectBtn.click();
    });
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);

    unmount();
  });
});

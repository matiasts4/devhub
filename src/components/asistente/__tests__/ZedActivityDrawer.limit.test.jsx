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

describe('ZedActivityDrawer message list limits', () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  test('renders only the last 50 assistant turns and shows a reveal button', () => {
    const messages = [{ role: 'assistant', content: 'Bienvenido', timestamp: 'initial' }];
    for (let i = 1; i <= 55; i += 1) {
      messages.push({ role: 'assistant', content: `Mensaje ${i}`, timestamp: `ts-${i}` });
    }

    const { container, unmount } = renderDrawer({
      expanded: true,
      onToggle: jest.fn(),
      messages,
    });

    const rendered = [...container.querySelectorAll('p')].filter((p) =>
      p.textContent.startsWith('Mensaje ')
    );
    expect(rendered).toHaveLength(50);

    const showMore = [...container.querySelectorAll('button')].find((b) =>
      /Mostrar \d+ mensajes anteriores/.test(b.textContent)
    );
    expect(showMore).toBeTruthy();
    expect(showMore.textContent).toMatch(/Mostrar 5 mensajes anteriores/);

    act(() => {
      showMore.click();
    });

    const afterExpand = [...container.querySelectorAll('p')].filter((p) =>
      p.textContent.startsWith('Mensaje ')
    );
    expect(afterExpand).toHaveLength(55);

    unmount();
  });

  test('renders partial assistant messages with a muted style and cursor', () => {
    const messages = [
      { role: 'assistant', content: 'Bienvenido', timestamp: 'initial' },
      {
        role: 'assistant',
        content: 'Respuesta parcial',
        timestamp: 'stream-1',
        partial: true,
      },
    ];

    const { container, unmount } = renderDrawer({
      expanded: true,
      onToggle: jest.fn(),
      messages,
    });

    const partialP = [...container.querySelectorAll('p')].find((p) =>
      p.textContent.includes('Respuesta parcial')
    );
    expect(partialP).not.toBeNull();
    expect(partialP.className).toContain('text-[var(--text-muted)]');
    expect(partialP.textContent).toContain('▌');

    unmount();
  });
});

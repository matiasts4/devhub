// Hydration sentinel regression: the initial message's `timestamp` MUST be the
// literal string `'initial'` at first render, so server and client output agree
// (avoids the React 18 hydration mismatch warning). A useEffect replaces it
// with a real `new Date().toISOString()` value AFTER hydration.
//
// Pattern copied from `tests/unit/operational-feedback-components.test.jsx`
// (JSDOM + createRoot + flushSync, no RTL).

const React = require('react');
const { JSDOM } = require('jsdom');

let createRoot;
let flushSync;
let ChatPanel;

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.CustomEvent = dom.window.CustomEvent;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.MouseEvent = dom.window.MouseEvent;
  return dom;
}

async function flushEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function mountSync(element) {
  // Mount without awaiting useEffect. The DOM should reflect the very first
  // render — i.e., the timestamp sentinel.
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(element);
  });
  // Intentionally NOT awaiting flushEffects here — we want the pre-effect
  // snapshot. Effects will fire on the next microtask.
  return { container, root };
}

async function renderIntoDom(element) {
  const mounted = mountSync(element);
  await flushEffects();
  return { ...mounted, cleanup: () => mounted.root.unmount() };
}

describe('ChatPanel — hydration safety (T-010b)', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    ({ createRoot } = require('react-dom/client'));
    ({ flushSync } = require('react-dom'));
    ChatPanel = require('../ChatPanel').default;
  });

  afterEach(() => {
    dom.window.close();
    jest.clearAllMocks();
  });

  test('before effects run: initial message timestamp is the literal "initial" sentinel', () => {
    // First commit, before useEffect. The timestamp MUST be the literal
    // sentinel — anything else would differ between server and client and
    // cause a React 18 hydration mismatch. The formatter
    // `new Date('initial').toLocaleTimeString(...)` yields the string
    // "Invalid Date" for the sentinel value, which is what we assert on.
    const { container, root } = mountSync(React.createElement(ChatPanel));
    expect(container.textContent).toContain('Invalid Date');
    root.unmount();
  });

  test('after effects run: timestamp becomes a real ISO string (no longer "Invalid Date")', async () => {
    const { container, cleanup } = await renderIntoDom(React.createElement(ChatPanel));
    // After the useEffect commits a real ISO, the formatter returns
    // hh:mm (en-GB locale) instead of "Invalid Date".
    expect(container.textContent).not.toContain('Invalid Date');
    // Sanity: a hh:mm pattern appears in the message list.
    expect(/\b\d{2}:\d{2}\b/.test(container.textContent)).toBe(true);
    cleanup();
  });
});

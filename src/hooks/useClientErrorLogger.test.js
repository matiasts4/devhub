const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');
const { ClientErrorLogger } = require('@/components/ClientErrorLogger');

const mountedRoots = [];

async function flushEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.Blob = dom.window.Blob;
  return dom;
}

async function renderIntoDom(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  flushSync(() => {
    root.render(element);
  });
  await flushEffects();
  return { container };
}

describe('useClientErrorLogger', () => {
  let dom;
  let fetchSpy;

  beforeEach(() => {
    dom = installDom();
    navigator.sendBeacon = undefined;
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const { root, container } = mountedRoots.pop();
      flushSync(() => root.unmount());
      container.remove();
    }
    fetchSpy.mockRestore();
    dom.window.close();
  });

  test('coalesces repeated preview diagnostics with the same stable reason', async () => {
    await renderIntoDom(React.createElement(ClientErrorLogger));

    console.warn('[devhub][visual-edit] selector-state-transition', {
      reason: 'proxy-escaped',
      reasonCategory: 'proxy-loss',
      supportMode: 'unsupported',
      browserUrl: { href: 'http://localhost:3200/app' },
    });
    console.warn('[devhub][visual-edit] selector-state-transition', {
      reason: 'proxy-escaped',
      reasonCategory: 'proxy-loss',
      supportMode: 'unsupported',
      browserUrl: { href: 'http://localhost:3200/app' },
    });
    await flushEffects();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test('keeps actionable state-change diagnostics when the preview reason changes', async () => {
    await renderIntoDom(React.createElement(ClientErrorLogger));

    console.warn('[devhub][visual-edit] selector-state-transition', {
      reason: 'proxy-escaped',
      reasonCategory: 'proxy-loss',
      supportMode: 'unsupported',
      browserUrl: { href: 'http://localhost:3200/app' },
    });
    console.warn('[devhub][visual-edit] selector-state-transition', {
      reason: 'same-origin-access',
      reasonCategory: 'same-origin-fallback',
      supportMode: 'same-origin-dom',
      browserUrl: { href: 'http://localhost:3200/app' },
    });
    await flushEffects();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

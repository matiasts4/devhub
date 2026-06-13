const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function installDom(url = 'https://devhub.test') {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url });

  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  // Element is required by libraries that feature-detect WAAPI (e.g.
  // framer-motion's motion-dom `supportsBrowserAnimation`). Without it the
  // node-env runner throws `ReferenceError: Element is not defined` and aborts
  // the whole process, not just the suite.
  global.Element = dom.window.Element;
  global.Node = dom.window.Node;
  global.MouseEvent = dom.window.MouseEvent;
  global.Event = dom.window.Event;
  global.CustomEvent = dom.window.CustomEvent;
  global.localStorage = dom.window.localStorage;

  return dom;
}

async function flushEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderIntoDom(element, mountedRoots) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  if (Array.isArray(mountedRoots)) {
    mountedRoots.push({ root, container });
  }

  flushSync(() => {
    root.render(element);
  });
  await flushEffects();

  return {
    container,
    root,
    rerender: async (nextElement) => {
      flushSync(() => {
        root.render(nextElement);
      });
      await flushEffects();
    },
  };
}

async function click(element) {
  flushSync(() => {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();
}

function cleanupMountedRoots(mountedRoots) {
  while (mountedRoots.length > 0) {
    const { root, container } = mountedRoots.pop();
    flushSync(() => {
      root.unmount();
    });
    container.remove();
  }
}

module.exports = {
  cleanupMountedRoots,
  click,
  createDeferred,
  flushEffects,
  installDom,
  renderIntoDom,
};

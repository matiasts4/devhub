/**
 * Regression: bare [data-state=open] must NOT occlude the native WebView2.
 * Radix tabs/selects use data-state=open and previously hid the dock forever.
 */

const { JSDOM } = require('jsdom');

function isVisiblyOpenOverlay(node) {
  if (!(node instanceof HTMLElement)) return false;
  if (node.getAttribute('aria-hidden') === 'true') return false;
  if (node.hidden) return false;
  const state = node.getAttribute('data-state');
  if (state === 'closed' || state === 'hiding') return false;

  const role = node.getAttribute('role');
  const isDialogRole =
    role === 'dialog' || role === 'alertdialog' || node.getAttribute('aria-modal') === 'true';
  const isDevhubModal = node.dataset?.modalOpen === 'true' || node.dataset?.devhubModal === 'true';
  if (!isDialogRole && !isDevhubModal) return false;

  if (state && state !== 'open' && !isDevhubModal) return false;

  const rect = node.getBoundingClientRect?.();
  if (!rect || rect.width < 8 || rect.height < 8) return false;
  return true;
}

describe('overlay occlude detection', () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
  });

  afterEach(() => {
    dom?.window?.close();
  });

  test('Radix tab with data-state=open does not block', () => {
    const el = document.createElement('button');
    el.setAttribute('data-state', 'open');
    el.getBoundingClientRect = () => ({
      width: 80,
      height: 24,
      top: 0,
      left: 0,
      bottom: 24,
      right: 80,
    });
    expect(isVisiblyOpenOverlay(el)).toBe(false);
  });

  test('open dialog with geometry blocks', () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'dialog');
    el.setAttribute('data-state', 'open');
    el.getBoundingClientRect = () => ({
      width: 400,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 400,
    });
    expect(isVisiblyOpenOverlay(el)).toBe(true);
  });

  test('closed dialog does not block', () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'dialog');
    el.setAttribute('data-state', 'closed');
    el.getBoundingClientRect = () => ({
      width: 400,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 400,
    });
    expect(isVisiblyOpenOverlay(el)).toBe(false);
  });

  test('zero-size dialog does not block', () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.getBoundingClientRect = () => ({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
    });
    expect(isVisiblyOpenOverlay(el)).toBe(false);
  });
});

/**
 * @jest-environment jsdom
 */

describe('electronWebviewPool', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
  });

  test('acquire parks and reacquires same element without recreate', () => {
    const {
      acquireElectronWebview,
      parkElectronWebview,
      getElectronWebviewEntry,
    } = require('../electronWebviewPool');

    const a = acquireElectronWebview('browser-p1-ws1', 'persist:test');
    expect(a.el.tagName.toLowerCase()).toBe('webview');
    const el1 = a.el;

    parkElectronWebview('browser-p1-ws1');
    expect(getElectronWebviewEntry('browser-p1-ws1').parked).toBe(true);
    expect(document.getElementById('devhub-electron-webview-park')).toBeTruthy();

    const b = acquireElectronWebview('browser-p1-ws1', 'persist:test');
    expect(b.el).toBe(el1);
    expect(b.parked).toBe(false);
  });

  test('markElectronWebviewParked does not reparent (no reload path)', () => {
    const {
      acquireElectronWebview,
      attachElectronWebview,
      markElectronWebviewParked,
      getElectronWebviewEntry,
    } = require('../electronWebviewPool');

    const host = document.createElement('div');
    document.body.appendChild(host);
    const entry = acquireElectronWebview('k-inplace', 'persist:test');
    attachElectronWebview('k-inplace', host);
    expect(entry.el.parentElement).toBe(host);

    markElectronWebviewParked('k-inplace');
    expect(getElectronWebviewEntry('k-inplace').parked).toBe(true);
    // Still under React host — inactive surface model without reparent.
    expect(entry.el.parentElement).toBe(host);
    expect(document.getElementById('devhub-electron-webview-park')).toBeNull();
  });

  test('navigate is no-op when already on url', async () => {
    const { acquireElectronWebview, navigateElectronWebview } = require('../electronWebviewPool');

    const entry = acquireElectronWebview('k1', 'persist:test');
    entry.domReady = true;
    entry.lastUrl = 'https://example.com/';
    entry.el.getURL = () => 'https://example.com/';
    entry.el.loadURL = jest.fn(() => Promise.resolve());

    const result = await navigateElectronWebview('k1', 'https://example.com/');
    expect(result.ok).toBe(true);
    expect(entry.el.loadURL).not.toHaveBeenCalled();
  });

  test('navigate is no-op on lastUrl match even if getURL differs/empty', async () => {
    const { acquireElectronWebview, navigateElectronWebview } = require('../electronWebviewPool');

    const entry = acquireElectronWebview('k1b', 'persist:test');
    entry.domReady = true;
    entry.lastUrl = 'https://example.com/path';
    entry.el.getURL = () => '';
    entry.el.loadURL = jest.fn(() => Promise.resolve());

    const result = await navigateElectronWebview('k1b', 'https://example.com/path');
    expect(result.ok).toBe(true);
    expect(result.reason).toMatch(/already-there/);
    expect(entry.el.loadURL).not.toHaveBeenCalled();
  });

  test('navigate does not clobber warm guest with placeholder/default URL', async () => {
    const { acquireElectronWebview, navigateElectronWebview } = require('../electronWebviewPool');

    const entry = acquireElectronWebview('k-warm', 'persist:test');
    entry.domReady = true;
    entry.lastUrl = 'https://example.com/project/repo';
    entry.el.getURL = () => 'https://example.com/project/repo';
    entry.el.loadURL = jest.fn(() => Promise.resolve());

    // Dock-state race: DEFAULT_RIGHT_DOCK_STATE while switching workspace.
    const result = await navigateElectronWebview('k-warm', 'http://localhost:3200/');
    expect(result.ok).toBe(true);
    expect(result.reason).toMatch(/placeholder/);
    expect(entry.el.loadURL).not.toHaveBeenCalled();
    expect(entry.lastUrl).toBe('https://example.com/project/repo');
  });

  test('navigate serializes and treats ERR_ABORTED as ok', async () => {
    const { acquireElectronWebview, navigateElectronWebview } = require('../electronWebviewPool');

    const entry = acquireElectronWebview('k2', 'persist:test');
    entry.domReady = true;
    entry.el.getURL = () => '';
    entry.el.loadURL = jest.fn(() => {
      const err = new Error('ERR_ABORTED (-3) loading');
      err.code = 'ERR_ABORTED';
      err.errno = -3;
      return Promise.reject(err);
    });

    const result = await navigateElectronWebview('k2', 'https://duckduckgo.com/?q=x');
    expect(result.ok).toBe(true);
    expect(result.aborted).toBe(true);
  });

  test('webviewUrlsEqual normalizes trailing slash', () => {
    const { webviewUrlsEqual } = require('../electronWebviewPool');
    expect(webviewUrlsEqual('https://Example.com/foo/', 'https://example.com/foo')).toBe(true);
  });
});

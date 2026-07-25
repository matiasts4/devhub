/**
 * @jest-environment jsdom
 */

describe('electronWebviewPool', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
  });

  function attachReady(key, partition = 'persist:test') {
    const { acquireElectronWebview, attachElectronWebview } = require('../electronWebviewPool');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const entry = acquireElectronWebview(key, partition);
    attachElectronWebview(key, host);
    entry.domReady = true;
    return { entry, host };
  }

  test('acquire parks and reacquires same element without recreate when parked only', () => {
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

  test('markElectronWebviewParked does not reparent', () => {
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
    expect(entry.el.parentElement).toBe(host);
  });

  test('attach to a different host recreates guest (never reparents warm element)', () => {
    const {
      acquireElectronWebview,
      attachElectronWebview,
      getElectronWebviewEntry,
    } = require('../electronWebviewPool');

    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    document.body.appendChild(hostA);
    document.body.appendChild(hostB);

    const entry = acquireElectronWebview('k-handoff', 'persist:test');
    entry.lastUrl = 'https://duckduckgo.com/';
    entry.hasLoadedOnce = true;
    entry.el.getURL = () => 'https://duckduckgo.com/';
    attachElectronWebview('k-handoff', hostA);
    const elA = entry.el;
    expect(elA.parentElement).toBe(hostA);

    attachElectronWebview('k-handoff', hostB);
    const next = getElectronWebviewEntry('k-handoff');
    expect(next.el).not.toBe(elA);
    expect(next.el.parentElement).toBe(hostB);
    expect(next.lastUrl).toBe('https://duckduckgo.com/');
    expect(next.generation).toBeGreaterThanOrEqual(1);
    // Old element must not remain under host A.
    expect(hostA.contains(elA)).toBe(false);
  });

  test('claim during release grace attaches to new host via recreate', () => {
    jest.useFakeTimers();
    const {
      claimElectronWebview,
      releaseElectronWebview,
      getElectronWebviewEntry,
    } = require('../electronWebviewPool');

    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    document.body.appendChild(hostA);
    document.body.appendChild(hostB);

    const first = claimElectronWebview('k-grace', hostA, 'owner-a', 'persist:test');
    first.lastUrl = 'https://example.com/';
    first.hasLoadedOnce = true;
    const el1 = first.el;

    releaseElectronWebview('k-grace', 'owner-a');
    claimElectronWebview('k-grace', hostB, 'owner-b', 'persist:test');

    const entry = getElectronWebviewEntry('k-grace');
    expect(entry.ownerId).toBe('owner-b');
    expect(entry.el.parentElement).toBe(hostB);
    // Host change → recreate.
    expect(entry.el).not.toBe(el1);

    jest.advanceTimersByTime(120);
    expect(getElectronWebviewEntry('k-grace').ownerId).toBe('owner-b');
    expect(entry.el.parentElement).toBe(hostB);

    jest.useRealTimers();
  });

  test('navigate is no-op when already on url', async () => {
    const { navigateElectronWebview } = require('../electronWebviewPool');
    const { entry } = attachReady('k1');
    entry.lastUrl = 'https://example.com/';
    entry.el.getURL = () => 'https://example.com/';
    entry.el.loadURL = jest.fn(() => Promise.resolve());

    const result = await navigateElectronWebview('k1', 'https://example.com/');
    expect(result.ok).toBe(true);
    expect(entry.el.loadURL).not.toHaveBeenCalled();
  });

  test('navigate sets src when lastUrl matches but live getURL is empty', async () => {
    const { navigateElectronWebview } = require('../electronWebviewPool');
    const { entry } = attachReady('k1b');
    entry.lastUrl = 'https://example.com/path';
    entry.el.getURL = () => '';
    entry.el.loadURL = jest.fn(() => Promise.resolve());

    const result = await navigateElectronWebview('k1b', 'https://example.com/path');
    expect(result.ok).toBe(true);
    expect(entry.el.getAttribute('src')).toBe('https://example.com/path');
  });

  test('navigate does not clobber warm guest with placeholder URL', async () => {
    const { navigateElectronWebview } = require('../electronWebviewPool');
    const { entry } = attachReady('k-warm');
    entry.lastUrl = 'https://example.com/project/repo';
    entry.el.getURL = () => 'https://example.com/project/repo';
    entry.el.loadURL = jest.fn(() => Promise.resolve());

    const result = await navigateElectronWebview('k-warm', 'http://localhost:3200/');
    expect(result.ok).toBe(true);
    expect(result.reason).toMatch(/placeholder/);
    expect(entry.el.getAttribute('src')).not.toBe('http://localhost:3200/');
  });

  test('navigate via src is ok without loadURL', async () => {
    const { navigateElectronWebview } = require('../electronWebviewPool');
    const { entry } = attachReady('k2');
    entry.el.getURL = () => '';
    entry.el.loadURL = jest.fn(() => Promise.resolve());

    const result = await navigateElectronWebview('k2', 'https://duckduckgo.com/?q=x');
    expect(result.ok).toBe(true);
    expect(entry.el.getAttribute('src')).toBe('https://duckduckgo.com/?q=x');
    expect(entry.el.loadURL).not.toHaveBeenCalled();
  });

  test('webviewUrlsEqual normalizes trailing slash', () => {
    const { webviewUrlsEqual } = require('../electronWebviewPool');
    expect(webviewUrlsEqual('https://Example.com/foo/', 'https://example.com/foo')).toBe(true);
  });

  test('buildGuestScrollbarCss uses theme colors', () => {
    const { buildGuestScrollbarCss } = require('../electronWebviewPool');
    const css = buildGuestScrollbarCss({
      track: '#0d1520',
      thumb: '#3d4f66',
      thumbHover: 'rgba(88, 166, 255, 0.55)',
      corner: '#0d1520',
    });
    expect(css).toContain('color-scheme: dark');
    expect(css).toContain('::-webkit-scrollbar');
    expect(css).toContain('#3d4f66');
  });

  test('recreateElectronWebview preserves lastUrl and bumps generation', () => {
    const {
      acquireElectronWebview,
      attachElectronWebview,
      recreateElectronWebview,
      getElectronWebviewEntry,
    } = require('../electronWebviewPool');

    const host = document.createElement('div');
    document.body.appendChild(host);
    const entry = acquireElectronWebview('k-rec', 'persist:test');
    entry.lastUrl = 'https://duckduckgo.com/?q=devhub';
    attachElectronWebview('k-rec', host);
    const oldEl = entry.el;

    const next = recreateElectronWebview('k-rec', { lastUrl: 'https://duckduckgo.com/?q=devhub' });
    expect(next.el).not.toBe(oldEl);
    expect(next.lastUrl).toContain('duckduckgo');
    expect(next.generation).toBeGreaterThanOrEqual(1);
    expect(getElectronWebviewEntry('k-rec').el).toBe(next.el);
  });

  test('syncWebviewPixelSize sets explicit px width/height from host rect', () => {
    const {
      acquireElectronWebview,
      attachElectronWebview,
      syncWebviewPixelSize,
    } = require('../electronWebviewPool');

    const host = document.createElement('div');
    document.body.appendChild(host);
    Object.defineProperty(host, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 640, height: 480, right: 640, bottom: 480 }),
    });
    const entry = acquireElectronWebview('k-size', 'persist:test');
    attachElectronWebview('k-size', host);
    const size = syncWebviewPixelSize(entry, host);
    expect(size.width).toBe(640);
    expect(size.height).toBe(480);
    expect(entry.el.style.width).toBe('640px');
    expect(entry.el.style.height).toBe('480px');
    expect(entry.el.style.display).toBe('flex');
  });
});

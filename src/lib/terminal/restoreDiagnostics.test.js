const { JSDOM } = require('jsdom');

describe('restoreDiagnostics', () => {
  let dom;
  let mod;
  let originalFetch;
  let originalNavigatorDescriptor;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    });
    global.window = dom.window;
    global.sessionStorage = dom.window.sessionStorage;

    originalFetch = global.fetch;
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));

    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

    jest.resetModules();
    mod = require('./restoreDiagnostics');
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
    if (originalFetch === undefined) {
      delete global.fetch;
    } else {
      global.fetch = originalFetch;
    }
    dom.window.close();
    delete global.window;
    delete global.sessionStorage;
  });

  function mockSendBeacon(ok = true) {
    const sendBeacon = jest.fn(() => ok);
    Object.defineProperty(globalThis, 'navigator', {
      value: { sendBeacon },
      configurable: true,
      writable: true,
    });
    return sendBeacon;
  }

  test('appends to the shared sessionStorage debug buffer', () => {
    mod.logRestoreDiagnostic('startup-restore-plan', { actionCount: 2 });
    const entries = mod.readRestoreDebugEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].step).toBe('startup-restore-plan');
    expect(entries[0].actionCount).toBe(2);
    expect(typeof entries[0].t).toBe('string');
  });

  test('batches queued events and flushes every 2s via fetch keepalive', () => {
    jest.useFakeTimers();

    mod.logRestoreDiagnostic('event-a', { a: 1 });
    mod.logRestoreDiagnostic('event-b', { b: 2 });
    expect(global.fetch).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2100);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/terminal/restore-log');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body)).toEqual([
      { event: 'event-a', details: { a: 1 } },
      { event: 'event-b', details: { b: 2 } },
    ]);

    // Queue is drained — the next tick has nothing to send.
    jest.advanceTimersByTime(4000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('flushes the queue via navigator.sendBeacon on pagehide', async () => {
    jest.useFakeTimers();
    const sendBeacon = mockSendBeacon(true);

    mod.logRestoreDiagnostic('event-c', { c: 3 });
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0];
    expect(url).toBe('/api/terminal/restore-log');
    // Blob body in browsers; plain string where Blob is unavailable (jest sandbox).
    const payloadText = typeof blob === 'string' ? blob : await blob.text();
    expect(JSON.parse(payloadText)).toEqual([{ event: 'event-c', details: { c: 3 } }]);

    // Queue drained by the beacon — the periodic flush must not re-send.
    jest.advanceTimersByTime(5000);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('falls back to fetch keepalive when sendBeacon is unavailable', () => {
    const sendBeacon = mockSendBeacon(false); // beacon rejects → fallback

    mod.logRestoreDiagnostic('event-d', {});
    dom.window.dispatchEvent(new dom.window.Event('beforeunload'));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][1].keepalive).toBe(true);
  });

  test('never throws on unserializable details', () => {
    const circular = {};
    circular.self = circular;
    expect(() => mod.logRestoreDiagnostic('circular', { circular })).not.toThrow();
  });

  test('no-ops when window is undefined (SSR / Node)', () => {
    delete global.window;
    delete global.sessionStorage;
    jest.resetModules();
    const ssrMod = require('./restoreDiagnostics');

    expect(() => ssrMod.logRestoreDiagnostic('event-e', { e: 5 })).not.toThrow();
    expect(ssrMod.readRestoreDebugEntries()).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(() => ssrMod.flushRestoreDiagnosticQueue()).not.toThrow();
  });
});

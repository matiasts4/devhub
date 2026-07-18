/**
 * @jest-environment jsdom
 */

const {
  isTuiPointerDebugEnabled,
  logTuiPointerDebug,
  readMouseTrackingMode,
} = require('../tuiPointerDebug');

describe('tuiPointerDebug', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
  });

  afterEach(() => {
    localStorage.clear();
    delete global.fetch;
  });

  test('disabled by default — no fetch', () => {
    expect(isTuiPointerDebugEnabled()).toBe(false);
    logTuiPointerDebug('tui-pointer', { path: 'inject-click', panelId: 'p1' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('enabled via localStorage posts /api/terminal/log', () => {
    localStorage.setItem('devhubTuiPointerDebug', '1');
    expect(isTuiPointerDebugEnabled()).toBe(true);
    logTuiPointerDebug('tui-wheel', {
      path: 'inject-wheel',
      panelId: 'p2',
      zone: 'transcript',
      term: { _core: { coreService: { decPrivateModes: { mouseTrackingMode: 2 } } } },
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/terminal/log',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('inject-wheel'),
      })
    );
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.tag).toBe('tui-wheel');
    expect(body.extra.mouseTrackingMode).toBe(2);
    expect(body.extra.zone).toBe('transcript');
  });

  test('readMouseTrackingMode', () => {
    expect(readMouseTrackingMode(null)).toBeNull();
    expect(
      readMouseTrackingMode({
        _core: { coreService: { decPrivateModes: { mouseTrackingMode: 1 } } },
      })
    ).toBe(1);
  });
});

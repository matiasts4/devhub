/**
 * @jest-environment jsdom
 */

describe('voice invoke via desktopBridge (electron)', () => {
  beforeEach(() => {
    jest.resetModules();
    delete window.devhubDesktop;
    delete window.__TAURI_INTERNALS__;
  });

  afterEach(() => {
    delete window.devhubDesktop;
    delete window.__TAURI_INTERNALS__;
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('electron voice_speak deferred shape surfaces as ok:false for Web Speech fallback', async () => {
    const invoke = jest.fn().mockResolvedValue({
      ok: false,
      reason: 'voice-deferred-electron',
    });
    window.devhubDesktop = { isElectron: true, invoke };

    const { invokeDesktop } = require('../desktopBridge');
    const result = await invokeDesktop(
      'voice_speak',
      { text: 'hola' },
      { failureShape: { ok: false, reason: 'desktop-unavailable' }, tauriWrapRequest: false }
    );

    expect(invoke).toHaveBeenCalledWith('voice_speak', { text: 'hola' });
    expect(result).toEqual({ ok: false, reason: 'voice-deferred-electron' });
  });

  test('electron voice_set_enabled succeeds', async () => {
    const invoke = jest.fn().mockResolvedValue({ ok: true, enabled: true });
    window.devhubDesktop = { isElectron: true, invoke };

    const { invokeDesktop } = require('../desktopBridge');
    const result = await invokeDesktop(
      'voice_set_enabled',
      { enabled: true },
      { failureShape: { ok: false }, tauriWrapRequest: false }
    );

    expect(result).toEqual({ ok: true, enabled: true });
  });

  test('web fail-closed for voice commands', async () => {
    const { invokeDesktop } = require('../desktopBridge');
    const result = await invokeDesktop(
      'voice_start_engine',
      {},
      { failureShape: { ok: false, reason: 'desktop-unavailable' } }
    );
    expect(result).toEqual({ ok: false, reason: 'desktop-unavailable' });
  });
});

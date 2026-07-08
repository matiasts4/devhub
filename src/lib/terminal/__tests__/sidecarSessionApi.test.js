/**
 * sidecarSessionApi.test.js — trySidecarCapture/trySidecarInput must resolve
 * the sidecar port via readSidecarPortForTerminalSession (dev-safe, retried),
 * not the generic readProductionSidecarPort, so Zed's execute_in_terminal /
 * review_terminal_output HTTP path stays reliable instead of falling back to
 * the fragile client-side WebSocket dispatch.
 */

const mockReadSidecarPortForTerminalSession = jest.fn();

jest.mock('@/lib/devhub/sidecarRuntime', () => ({
  readSidecarPortForTerminalSession: (...args) => mockReadSidecarPortForTerminalSession(...args),
}));

const { trySidecarCapture, trySidecarInput } = require('../sidecarSessionApi');

describe('sidecarSessionApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('trySidecarCapture', () => {
    it('resolves the port via readSidecarPortForTerminalSession', async () => {
      mockReadSidecarPortForTerminalSession.mockResolvedValue(4000);
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({ output: 'hi\n' }) });

      const result = await trySidecarCapture('p1');

      expect(mockReadSidecarPortForTerminalSession).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:4000/sessions/p1/output',
        expect.objectContaining({ cache: 'no-store' })
      );
      expect(result).toEqual({ output: 'hi\n', session_id: 'p1', source: 'sidecar' });
    });

    it('returns null when no sidecar port is available', async () => {
      mockReadSidecarPortForTerminalSession.mockResolvedValue(null);

      const result = await trySidecarCapture('p1');

      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('trySidecarInput', () => {
    it('resolves the port via readSidecarPortForTerminalSession and PUTs input', async () => {
      mockReadSidecarPortForTerminalSession.mockResolvedValue(4000);
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({ sent: true }) });

      const result = await trySidecarInput('p1', 'ls\n');

      expect(mockReadSidecarPortForTerminalSession).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:4000/sessions/p1/input',
        expect.objectContaining({ method: 'PUT' })
      );
      expect(result).toEqual({ session_id: 'p1', sent: true, source: 'sidecar' });
    });

    it('returns null when no sidecar port is available', async () => {
      mockReadSidecarPortForTerminalSession.mockResolvedValue(null);

      const result = await trySidecarInput('p1', 'ls\n');

      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});

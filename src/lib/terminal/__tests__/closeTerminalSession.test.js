/**
 * @jest-environment node
 */

const { closeTerminalSessionById } = require('../closeTerminalSession.js');

describe('closeTerminalSessionById', () => {
  test('prefers sidecar DELETE whenever a sidecar port is available', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    const closeSessionImpl = jest.fn();

    const result = await closeTerminalSessionById('panel-oc-1', {
      fetchImpl,
      readProductionSidecarPortImpl: async () => 4001,
      closeSessionImpl,
      nodeEnv: 'development',
    });

    expect(result).toEqual({ success: true, sessionId: 'panel-oc-1' });
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:4001/sessions/panel-oc-1', {
      method: 'DELETE',
      cache: 'no-store',
    });
    expect(closeSessionImpl).not.toHaveBeenCalled();
  });

  test('falls back to in-process closeSession when no sidecar is present', async () => {
    const closeSessionImpl = jest.fn();

    const result = await closeTerminalSessionById('panel-local-1', {
      fetchImpl: jest.fn(),
      readProductionSidecarPortImpl: async () => null,
      closeSessionImpl,
      nodeEnv: 'development',
    });

    expect(result).toEqual({ success: true, sessionId: 'panel-local-1' });
    expect(closeSessionImpl).toHaveBeenCalledWith('panel-local-1');
  });
});

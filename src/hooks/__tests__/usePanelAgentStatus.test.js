const React = require('react');
const usePanelAgentStatus = require('../usePanelAgentStatus').default;
const { PANEL_STATUS } = require('@/components/terminal/utils/panelStatusHelpers');
const {
  cleanupMountedRoots,
  flushEffects,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');

const mountedRoots = [];

function Harness({
  panelId,
  terminalId,
  agentRun,
  initialCommand,
  connectionState,
  pollingInterval,
  enabled,
}) {
  const result = usePanelAgentStatus(panelId, {
    terminalId,
    agentRun,
    initialCommand,
    connectionState,
    pollingInterval,
    enabled,
  });

  return React.createElement(
    'div',
    null,
    React.createElement('div', { 'data-testid': 'status' }, result.status),
    React.createElement('div', { 'data-testid': 'label' }, result.label),
    React.createElement('div', { 'data-testid': 'pulsing' }, String(result.isPulsing)),
    React.createElement('div', { 'data-testid': 'api-status' }, result.apiStatus || ''),
    React.createElement(
      'div',
      { 'data-testid': 'terminal-activity' },
      result.terminalActivity ? JSON.stringify(result.terminalActivity) : ''
    ),
    React.createElement('div', { 'data-testid': 'error' }, result.error || '')
  );
}

describe('usePanelAgentStatus', () => {
  let dom;
  let fetchSpy;
  let intervalCallbacks;
  let setIntervalSpy;
  let clearIntervalSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    dom = installDom();
    window.localStorage.clear();

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'running' }),
    });

    intervalCallbacks = [];
    setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation((cb) => {
      intervalCallbacks.push(cb);
      return intervalCallbacks.length;
    });
    clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    fetchSpy.mockRestore();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
    dom.window.close();
    delete global.localStorage;
  });

  async function waitFor(assertion, attempts = 10) {
    let lastError;
    for (let index = 0; index < attempts; index += 1) {
      try {
        assertion();
        return;
      } catch (error) {
        lastError = error;
        await flushEffects();
      }
    }
    throw lastError;
  }

  test('derives status from connection state when there is no API status yet', async () => {
    const view = await renderIntoDom(
      React.createElement(Harness, {
        panelId: 'panel-1',
        agentRun: { selectedAgent: 'opencode' },
        connectionState: 'connecting',
        enabled: true,
      }),
      mountedRoots
    );

    expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe(
      PANEL_STATUS.WAITING
    );
    expect(view.container.querySelector('[data-testid="label"]')?.textContent).toBe('Esperando');
  });

  test('polls session status when agentRun has a sessionId', async () => {
    renderIntoDom(
      React.createElement(Harness, {
        panelId: 'panel-1',
        agentRun: { sessionId: 'sess-1', selectedAgent: 'opencode' },
        connectionState: 'connected',
        pollingInterval: 5000,
        enabled: true,
      }),
      mountedRoots
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/agenthub/sessions/sess-1/status',
        expect.any(Object)
      );
    });
  });

  test('updates status from API response', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'thinking' }),
    });

    const view = await renderIntoDom(
      React.createElement(Harness, {
        panelId: 'panel-1',
        agentRun: { sessionId: 'sess-1', selectedAgent: 'opencode' },
        connectionState: 'connected',
        pollingInterval: 5000,
        enabled: true,
      }),
      mountedRoots
    );

    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe(
        PANEL_STATUS.RUNNING
      );
    });
    expect(view.container.querySelector('[data-testid="api-status"]')?.textContent).toBe(
      'thinking'
    );
    expect(view.container.querySelector('[data-testid="pulsing"]')?.textContent).toBe('true');
  });

  test('polls PTY activity when there is no sessionId or runId', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ lastActivityAt: new Date().toISOString() }),
    });

    renderIntoDom(
      React.createElement(Harness, {
        panelId: 'panel-1',
        terminalId: 'panel-1',
        agentRun: { selectedAgent: 'opencode' },
        connectionState: 'connected',
        enabled: true,
      }),
      mountedRoots
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/terminal/sessions/panel-1', expect.any(Object));
    });
  });

  test('keeps last known status on fetch error', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'running' }),
    });

    const view = await renderIntoDom(
      React.createElement(Harness, {
        panelId: 'panel-1',
        agentRun: { sessionId: 'sess-1' },
        connectionState: 'connected',
        pollingInterval: 5000,
        enabled: true,
      }),
      mountedRoots
    );

    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe(
        PANEL_STATUS.RUNNING
      );
    });

    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    intervalCallbacks[0]?.();
    await flushEffects();

    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="error"]')?.textContent).toBe(
        'network down'
      );
    });
    expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe(
      PANEL_STATUS.RUNNING
    );
  });

  test('uses runId as fallback session id', async () => {
    renderIntoDom(
      React.createElement(Harness, {
        panelId: 'panel-1',
        agentRun: { runId: 'run-42' },
        connectionState: 'connected',
        pollingInterval: 5000,
        enabled: true,
      }),
      mountedRoots
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/agenthub/sessions/run-42/status',
        expect.any(Object)
      );
    });
  });

  test('extracts opencode session id from initialCommand and polls', async () => {
    renderIntoDom(
      React.createElement(Harness, {
        panelId: 'panel-1',
        agentRun: null,
        initialCommand: 'opencode --session oc-sess-1',
        connectionState: 'connected',
        pollingInterval: 5000,
        enabled: true,
      }),
      mountedRoots
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/agenthub/sessions/oc-sess-1/status',
        expect.any(Object)
      );
    });
  });

  test('registers a polling interval with the configured duration', async () => {
    renderIntoDom(
      React.createElement(Harness, {
        panelId: 'panel-1',
        agentRun: { sessionId: 'sess-1' },
        connectionState: 'connected',
        pollingInterval: 7000,
        enabled: true,
      }),
      mountedRoots
    );

    await waitFor(() => {
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 7000);
    });
  });

  test('updates status to running from recent PTY activity', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ lastActivityAt: new Date().toISOString() }),
    });

    const view = await renderIntoDom(
      React.createElement(Harness, {
        panelId: 'panel-1',
        terminalId: 'panel-1',
        agentRun: null,
        initialCommand: 'kimi',
        connectionState: 'connected',
        pollingInterval: 5000,
        enabled: true,
      }),
      mountedRoots
    );

    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe(
        PANEL_STATUS.RUNNING
      );
    });
    expect(view.container.querySelector('[data-testid="pulsing"]')?.textContent).toBe('true');
  });

  test('prioritizes API status over PTY activity', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'completed' }),
    });

    const view = await renderIntoDom(
      React.createElement(Harness, {
        panelId: 'panel-1',
        terminalId: 'panel-1',
        agentRun: { sessionId: 'sess-1' },
        initialCommand: 'kimi',
        connectionState: 'connected',
        pollingInterval: 5000,
        enabled: true,
      }),
      mountedRoots
    );

    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe(
        PANEL_STATUS.COMPLETED
      );
    });
  });

  test('does not poll when disabled', async () => {
    renderIntoDom(
      React.createElement(Harness, {
        panelId: 'panel-1',
        terminalId: 'panel-1',
        agentRun: { sessionId: 'sess-1' },
        connectionState: 'connected',
        enabled: false,
      }),
      mountedRoots
    );

    await flushEffects();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});

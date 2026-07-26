/**
 * @jest-environment node
 */

describe('dispatchAction', () => {
  let dispatchAction;
  let fakeSurfaceController;

  beforeEach(() => {
    jest.resetModules();
    const module = require('../dispatchAction');
    dispatchAction = module.dispatchAction;

    // Fake SurfaceController for testing
    fakeSurfaceController = {
      spawnTerminal: jest.fn(async (opts) => ({
        id: 'terminal-1',
        label: opts?.label || 'Terminal',
      })),
      focusTerminal: jest.fn(),
      findTerminalByLabel: jest.fn(() => null),
      focusedTerminal: jest.fn(() => null),
      listTerminals: jest.fn(() => []),
      spawnBrowser: jest.fn(async (_opts) => ({ id: 'browser-1' })),
      focusBrowser: jest.fn(),
      captureTerminal: jest.fn(async () => 'output text'),
    };
  });

  test('rejects empty command slot with failed status', async () => {
    const intent = {
      intent: 'terminal-run',
      slots: { command: '' },
    };

    const statuses = [];
    for await (const status of dispatchAction(intent, fakeSurfaceController)) {
      statuses.push(status);
    }

    expect(statuses).toHaveLength(1);
    expect(statuses[0].phase).toBe('failed');
    expect(statuses[0].error).toMatch(/empty/i);
  });

  test('yields queued → running → done for valid terminal-run', async () => {
    const intent = {
      intent: 'terminal-run',
      slots: { command: 'npm test' },
    };

    const statuses = [];
    for await (const status of dispatchAction(intent, fakeSurfaceController)) {
      statuses.push(status);
    }

    expect(statuses).toHaveLength(3);
    expect(statuses[0].phase).toBe('queued');
    expect(statuses[1].phase).toBe('running');
    expect(statuses[1].surfaceId).toBe('terminal-1');
    expect(statuses[2].phase).toBe('done');
  });

  test('yields failed if surface spawn throws', async () => {
    fakeSurfaceController.spawnTerminal.mockRejectedValueOnce(new Error('Spawn failed'));

    const intent = {
      intent: 'terminal-run',
      slots: { command: 'npm test' },
    };

    const statuses = [];
    for await (const status of dispatchAction(intent, fakeSurfaceController)) {
      statuses.push(status);
    }

    expect(statuses[statuses.length - 1].phase).toBe('failed');
    expect(statuses[statuses.length - 1].error).toMatch(/Spawn failed/);
  });

  test('rejects empty url slot for browser-navigate', async () => {
    const intent = {
      intent: 'browser-navigate',
      slots: { url: '' },
    };

    const statuses = [];
    for await (const status of dispatchAction(intent, fakeSurfaceController)) {
      statuses.push(status);
    }

    expect(statuses[0].phase).toBe('failed');
    expect(statuses[0].error).toMatch(/empty/i);
  });

  test('rejects empty query slot for browser-search', async () => {
    const intent = {
      intent: 'browser-search',
      slots: { query: '' },
    };

    const statuses = [];
    for await (const status of dispatchAction(intent, fakeSurfaceController)) {
      statuses.push(status);
    }

    expect(statuses[0].phase).toBe('failed');
    expect(statuses[0].error).toMatch(/empty/i);
  });

  test('unknown intent yields failed immediately', async () => {
    const intent = {
      intent: 'unknown',
      slots: {},
    };

    const statuses = [];
    for await (const status of dispatchAction(intent, fakeSurfaceController)) {
      statuses.push(status);
    }

    expect(statuses).toHaveLength(1);
    expect(statuses[0].phase).toBe('failed');
    expect(statuses[0].error).toMatch(/don't understand|Try:/i);
  });

  test('terminal-read yields queued → running → done with result', async () => {
    fakeSurfaceController.findTerminalByLabel.mockReturnValue({
      id: 'term-test',
      label: 'test-terminal',
    });
    fakeSurfaceController.captureTerminal.mockResolvedValue('captured output\nline 2');

    const intent = {
      intent: 'terminal-read',
      slots: { terminalName: 'test-terminal' },
    };

    const statuses = [];
    for await (const status of dispatchAction(intent, fakeSurfaceController)) {
      statuses.push(status);
    }

    expect(statuses).toHaveLength(3);
    expect(statuses[0].phase).toBe('queued');
    expect(statuses[1].phase).toBe('running');
    expect(statuses[2].phase).toBe('done');
    expect(statuses[2].result).toBeDefined();
    expect(statuses[2].result.text).toBe('captured output\nline 2');
    expect(statuses[2].result.terminalName).toBe('test-terminal');
  });

  test('terminal-read yields failed when no terminals open', async () => {
    fakeSurfaceController.findTerminalByLabel.mockReturnValue(null);
    fakeSurfaceController.focusedTerminal.mockReturnValue(null);

    const intent = {
      intent: 'terminal-read',
      slots: { terminalName: 'nonexistent' },
    };

    const statuses = [];
    for await (const status of dispatchAction(intent, fakeSurfaceController)) {
      statuses.push(status);
    }

    expect(statuses[statuses.length - 1].phase).toBe('failed');
    expect(statuses[statuses.length - 1].error).toMatch(/No terminals are open/);
  });

  test('terminal-read yields failed when capture throws', async () => {
    fakeSurfaceController.findTerminalByLabel.mockReturnValue({
      id: 'term-error',
      label: 'error-terminal',
    });
    fakeSurfaceController.captureTerminal.mockRejectedValue(
      new Error('Failed to read terminal output: Not Found')
    );

    const intent = {
      intent: 'terminal-read',
      slots: { terminalName: 'error-terminal' },
    };

    const statuses = [];
    for await (const status of dispatchAction(intent, fakeSurfaceController)) {
      statuses.push(status);
    }

    expect(statuses[statuses.length - 1].phase).toBe('failed');
    expect(statuses[statuses.length - 1].error).toMatch(/Failed to read terminal/);
  });
});

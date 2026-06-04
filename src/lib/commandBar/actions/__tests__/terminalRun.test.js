/**
 * @jest-environment node
 */

// Mock fetch globally for terminal input API calls
global.fetch = jest.fn();

describe('terminalRun action', () => {
  let terminalRun;
  let fakeSurfaceController;

  beforeEach(() => {
    jest.resetModules();
    global.fetch.mockClear();
    
    const module = require('../terminalRun');
    terminalRun = module.terminalRun;

    fakeSurfaceController = {
      spawnTerminal: jest.fn(async (opts) => ({
        id: 'terminal-123',
        label: opts.label || 'Terminal',
      })),
      focusTerminal: jest.fn(),
      findTerminalByLabel: jest.fn(() => null),
    };
  });

  test('spawns new terminal when no terminalName specified', async () => {
    const intent = {
      intent: 'terminal-run',
      slots: { command: 'npm test' },
    };

    const result = await terminalRun(intent, fakeSurfaceController);

    expect(fakeSurfaceController.spawnTerminal).toHaveBeenCalledWith({
      initialCommand: 'npm test',
    });
    expect(result.id).toBe('terminal-123');
  });

  test('spawns terminal with label when terminalName provided but not found', async () => {
    const intent = {
      intent: 'terminal-run',
      slots: { command: 'git status', terminalName: 'git-workspace' },
    };

    fakeSurfaceController.findTerminalByLabel.mockReturnValueOnce(null);

    const _result = await terminalRun(intent, fakeSurfaceController);

    expect(fakeSurfaceController.findTerminalByLabel).toHaveBeenCalledWith('git-workspace');
    expect(fakeSurfaceController.spawnTerminal).toHaveBeenCalledWith({
      label: 'git-workspace',
      initialCommand: 'git status',
    });
  });

  test('focuses existing terminal and sends command via /input API when terminalName exists', async () => {
    const intent = {
      intent: 'terminal-run',
      slots: { command: 'npm build', terminalName: 'build-output' },
    };

    fakeSurfaceController.findTerminalByLabel.mockReturnValueOnce({
      id: 'terminal-456',
      label: 'build-output',
    });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const result = await terminalRun(intent, fakeSurfaceController);

    expect(fakeSurfaceController.findTerminalByLabel).toHaveBeenCalledWith('build-output');
    expect(fakeSurfaceController.focusTerminal).toHaveBeenCalledWith('terminal-456');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/terminal/session/terminal-456/input',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'npm build\r' }),
      })
    );
    expect(result.id).toBe('terminal-456');
  });

  test('throws error if /input API call fails', async () => {
    const intent = {
      intent: 'terminal-run',
      slots: { command: 'npm test', terminalName: 'test' },
    };

    fakeSurfaceController.findTerminalByLabel.mockReturnValueOnce({
      id: 'terminal-789',
      label: 'test',
    });

    global.fetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Internal Server Error',
    });

    await expect(terminalRun(intent, fakeSurfaceController)).rejects.toThrow(/Failed to send command/i);
  });
});

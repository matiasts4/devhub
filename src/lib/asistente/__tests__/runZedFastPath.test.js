'use strict';

jest.mock('../utils/zed-logger', () => ({
  zedLog: {
    orchestration: jest.fn(),
    toolResult: jest.fn(),
  },
}));

const { tryZedFastPath } = require('../runZedFastPath');

function mockRegistry(results = {}) {
  return {
    execute: jest.fn(async (tool, input) => {
      if (results[tool]) return results[tool];
      return { ok: true, tool, input };
    }),
  };
}

const SINGLE_TERMINAL_CTX = {
  workspace_terminals: [{ terminalId: 'p1', displayName: 'Chase' }],
  terminal_panel_count: 1,
};

const MULTI_TERMINAL_CTX = {
  workspace_terminals: [
    { terminalId: 'p1', displayName: 'Chase' },
    { terminalId: 'p2', displayName: 'Cesar' },
  ],
  terminal_panel_count: 2,
};

describe('tryZedFastPath', () => {
  beforeEach(() => {
    delete process.env.ZED_FAST_PATH;
  });

  test('local-high executes tools via mocked ToolRegistry', async () => {
    const registry = mockRegistry({
      list_terminals: { processes: [{ displayName: 'Chase', terminalId: 'p1' }] },
    });

    const result = await tryZedFastPath({
      message: '¿Qué terminales hay?',
      registry,
      requestContext: SINGLE_TERMINAL_CTX,
      msgId: 'msg-high',
    });

    expect(result.hit).toBe(true);
    expect(result.needsConfirmation).toBeUndefined();
    expect(result.intent.tier).toBe('local-high');
    expect(registry.execute).toHaveBeenCalledTimes(1);
    expect(registry.execute).toHaveBeenCalledWith('list_terminals', {}, SINGLE_TERMINAL_CTX);
    expect(result.toolResults).toHaveLength(1);
    expect(result.body.meta.fast_path).toBe(true);
    expect(result.body.meta.tier).toBe('local-high');
  });

  test('local-medium returns needsConfirmation without executing when confirmed=false', async () => {
    const registry = mockRegistry();

    const result = await tryZedFastPath({
      message: 'cierra la terminal',
      registry,
      requestContext: MULTI_TERMINAL_CTX,
      msgId: 'msg-medium',
      confirmed: false,
    });

    expect(result.hit).toBe(true);
    expect(result.needsConfirmation).toBe(true);
    expect(result.intent.tier).toBe('local-medium');
    expect(registry.execute).not.toHaveBeenCalled();
    expect(result.toolResults).toEqual([]);
    expect(result.body.meta.needs_confirmation).toBe(true);
    expect(result.body.meta.pending_steps).toEqual([{ tool: 'close_terminal', input: {} }]);
    expect(result.text).toMatch(/confirm/i);
  });

  test('local-medium executes when confirmed=true', async () => {
    const registry = mockRegistry({
      close_terminal: { action: 'closed', session_id: 'p1' },
    });

    const result = await tryZedFastPath({
      message: 'cierra la terminal',
      registry,
      requestContext: MULTI_TERMINAL_CTX,
      msgId: 'msg-medium-confirmed',
      confirmed: true,
    });

    expect(result.hit).toBe(true);
    expect(result.needsConfirmation).toBeUndefined();
    expect(result.intent.tier).toBe('local-medium');
    expect(registry.execute).toHaveBeenCalledTimes(1);
    expect(registry.execute).toHaveBeenCalledWith('close_terminal', {}, MULTI_TERMINAL_CTX);
    expect(result.toolResults).toHaveLength(1);
    expect(result.body.meta.needs_confirmation).toBeUndefined();
  });

  test('returns hit:false when ZED_FAST_PATH is disabled', async () => {
    process.env.ZED_FAST_PATH = '0';
    const registry = mockRegistry();

    const result = await tryZedFastPath({
      message: '¿Qué terminales hay?',
      registry,
      requestContext: SINGLE_TERMINAL_CTX,
    });

    expect(result).toEqual({ hit: false });
    expect(registry.execute).not.toHaveBeenCalled();
  });
});

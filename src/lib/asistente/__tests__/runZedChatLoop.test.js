/**
 * @jest-environment jsdom
 */

import {
  runZedChatLoop,
  toolHasRequiredSchema,
  mergeOpensIntoRequestContext,
} from '../runZedChatLoop';
import { ToolRegistry } from '../tools/registry';

jest.mock('../streamMinimax', () => ({
  streamMinimax: jest.fn(),
}));

const { streamMinimax } = require('../streamMinimax');

describe('toolHasRequiredSchema', () => {
  test('detects required parameter', () => {
    expect(toolHasRequiredSchema({ parameters: { url: { required: true } } })).toBe(true);
  });

  test('returns false when no parameters', () => {
    expect(toolHasRequiredSchema({})).toBe(false);
    expect(toolHasRequiredSchema({ parameters: {} })).toBe(false);
  });
});

describe('mergeOpensIntoRequestContext', () => {
  test('adds opened terminal to workspace_terminals', () => {
    const ctx = { workspace_terminals: [] };
    mergeOpensIntoRequestContext(ctx, [
      { tool: 'open_terminal', result: { terminalId: 't1', displayName: 'Panel-A' } },
    ]);
    expect(ctx.workspace_terminals).toEqual([
      { terminalId: 't1', displayName: 'Panel-A', cwd: null },
    ]);
  });

  test('updates existing terminal entry', () => {
    const ctx = { workspace_terminals: [{ terminalId: 't1', displayName: 'Old' }] };
    mergeOpensIntoRequestContext(ctx, [
      { tool: 'open_terminal', result: { terminalId: 't1', displayName: 'Panel-A', cwd: '/home' } },
    ]);
    expect(ctx.workspace_terminals).toEqual([
      { terminalId: 't1', displayName: 'Panel-A', cwd: '/home' },
    ]);
  });

  test('ignores errors', () => {
    const ctx = { workspace_terminals: [] };
    mergeOpensIntoRequestContext(ctx, [{ tool: 'open_terminal', result: { error: 'failed' } }]);
    expect(ctx.workspace_terminals).toEqual([]);
  });
});

describe('runZedChatLoop', () => {
  function buildRegistry(tools = {}) {
    const registry = new ToolRegistry();
    for (const [name, execute] of Object.entries(tools)) {
      registry.register({ name, description: name, parameters: {}, execute });
    }
    return registry;
  }

  test('returns text response when no tools called', async () => {
    const registry = buildRegistry();
    const callMinimax = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Hola' }],
    });

    const { finalText, allToolResults } = await runZedChatLoop({
      systemPrompt: '',
      conversation: [],
      registry,
      anthropicTools: registry.toAnthropicTools(),
      apiKey: 'test',
      requestContext: {},
      maxTurns: 3,
      callMinimax,
      model: 'test-model',
    });

    expect(finalText).toBe('Hola');
    expect(allToolResults).toEqual([]);
  });

  test('executes native tool_use and returns result', async () => {
    const registry = buildRegistry({
      echo: async (input) => ({ echoed: input.value }),
    });
    const callMinimax = jest.fn().mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'echo',
          input: { value: 'hello' },
          id: 'tu-1',
        },
      ],
    });

    const events = [];
    const { allToolResults } = await runZedChatLoop({
      systemPrompt: '',
      conversation: [],
      registry,
      anthropicTools: registry.toAnthropicTools(),
      apiKey: 'test',
      requestContext: {},
      maxTurns: 1,
      callMinimax,
      model: 'test-model',
      onEvent: (evt) => events.push(evt),
    });

    expect(allToolResults).toHaveLength(1);
    expect(allToolResults[0].tool).toBe('echo');
    expect(allToolResults[0].result).toEqual({ echoed: 'hello' });
    expect(events.some((e) => e.type === 'tool_start')).toBe(true);
    expect(events.some((e) => e.type === 'tool_result')).toBe(true);
  });

  test('parses legacy textual tool calls', async () => {
    const registry = buildRegistry({
      echo: async (input) => ({ echoed: input.value }),
    });
    const callMinimax = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'TOOL: echo\nPARAM: value=hello' }],
    });

    const { allToolResults } = await runZedChatLoop({
      systemPrompt: '',
      conversation: [],
      registry,
      anthropicTools: registry.toAnthropicTools(),
      apiKey: 'test',
      requestContext: {},
      maxTurns: 1,
      callMinimax,
      model: 'test-model',
    });

    expect(allToolResults.length).toBeGreaterThan(0);
  });

  test('returns error result when tool throws', async () => {
    const registry = buildRegistry({
      fail: async () => {
        throw new Error('boom');
      },
    });
    const callMinimax = jest.fn().mockResolvedValue({
      content: [{ type: 'tool_use', name: 'fail', input: {}, id: 'tu-2' }],
    });

    const { allToolResults } = await runZedChatLoop({
      systemPrompt: '',
      conversation: [],
      registry,
      anthropicTools: registry.toAnthropicTools(),
      apiKey: 'test',
      requestContext: {},
      maxTurns: 1,
      callMinimax,
      model: 'test-model',
    });

    expect(allToolResults[0].result.error).toBe('boom');
  });

  test('respects maxTurns', async () => {
    const registry = buildRegistry({
      noop: async () => ({ ok: true }),
    });
    let calls = 0;
    const callMinimax = jest.fn().mockImplementation(() => {
      calls += 1;
      return Promise.resolve({
        content: [{ type: 'tool_use', name: 'noop', input: {}, id: `tu-${calls}` }],
      });
    });

    const { meta } = await runZedChatLoop({
      systemPrompt: '',
      conversation: [],
      registry,
      anthropicTools: registry.toAnthropicTools(),
      apiKey: 'test',
      requestContext: {},
      maxTurns: 2,
      callMinimax,
      model: 'test-model',
    });

    expect(calls).toBe(2);
    expect(meta.max_turns_reached).toBe(true);
  });

  test('runs parallel-safe tools concurrently and preserves order', async () => {
    const order = [];
    const registry = new ToolRegistry();
    registry.register({
      name: 'read_a',
      description: 'read a',
      parallel: true,
      parameters: {},
      async execute() {
        order.push('a-start');
        await new Promise((r) => setTimeout(r, 20));
        order.push('a-end');
        return { value: 'a' };
      },
    });
    registry.register({
      name: 'write_b',
      description: 'write b',
      parameters: {},
      async execute() {
        order.push('b');
        return { value: 'b' };
      },
    });
    registry.register({
      name: 'read_c',
      description: 'read c',
      parallel: true,
      parameters: {},
      async execute() {
        order.push('c-start');
        await new Promise((r) => setTimeout(r, 10));
        order.push('c-end');
        return { value: 'c' };
      },
    });

    const callMinimax = jest.fn().mockResolvedValue({
      content: [
        { type: 'tool_use', name: 'read_a', input: {}, id: 'tu-a' },
        { type: 'tool_use', name: 'write_b', input: {}, id: 'tu-b' },
        { type: 'tool_use', name: 'read_c', input: {}, id: 'tu-c' },
      ],
    });

    const { allToolResults } = await runZedChatLoop({
      systemPrompt: '',
      conversation: [],
      registry,
      anthropicTools: registry.toAnthropicTools(),
      apiKey: 'test',
      requestContext: {},
      maxTurns: 1,
      callMinimax,
      model: 'test-model',
    });

    // a and c start before the sequential b runs.
    expect(order.indexOf('a-start')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('c-start')).toBeLessThan(order.indexOf('b'));
    // Results remain in model order.
    expect(allToolResults.map((r) => r.tool)).toEqual(['read_a', 'write_b', 'read_c']);
  });

  test('streams text deltas when enableStreaming is true', async () => {
    streamMinimax.mockImplementation(async ({ onTextDelta }) => {
      onTextDelta('Hola desde streaming');
      return { text: 'Hola desde streaming', toolCalls: [], stopReason: 'end_turn' };
    });

    const registry = buildRegistry();
    const events = [];
    const { finalText, allToolResults } = await runZedChatLoop({
      systemPrompt: '',
      conversation: [],
      registry,
      anthropicTools: registry.toAnthropicTools(),
      apiKey: 'test',
      requestContext: {},
      maxTurns: 1,
      callMinimax: jest.fn(),
      model: 'test-model',
      enableStreaming: true,
      onEvent: (evt) => events.push(evt),
    });

    expect(finalText).toBe('Hola desde streaming');
    expect(allToolResults).toEqual([]);
    expect(
      events.some((e) => e.type === 'text_delta' && e.payload.text === 'Hola desde streaming')
    ).toBe(true);
    expect(streamMinimax).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'test-model',
        apiKey: 'test',
        messages: [],
      })
    );
  });

  test('executes streamed native tool_use results', async () => {
    streamMinimax.mockResolvedValue({
      text: '',
      toolCalls: [{ id: 'tu-stream', name: 'echo', input: { value: 'streamed' } }],
      stopReason: 'tool_use',
    });

    const registry = buildRegistry({
      echo: async (input) => ({ echoed: input.value }),
    });

    const { allToolResults } = await runZedChatLoop({
      systemPrompt: '',
      conversation: [],
      registry,
      anthropicTools: registry.toAnthropicTools(),
      apiKey: 'test',
      requestContext: {},
      maxTurns: 1,
      callMinimax: jest.fn(),
      model: 'test-model',
      enableStreaming: true,
    });

    expect(allToolResults).toHaveLength(1);
    expect(allToolResults[0].tool).toBe('echo');
    expect(allToolResults[0].result).toEqual({ echoed: 'streamed' });
    expect(allToolResults[0].id).toBe('tu-stream');
  });
});

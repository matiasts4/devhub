/**
 * @jest-environment node
 *
 * LLM-only P0 smoke: fast path + short-circuit off.
 * Proves P0 phrases reach the tool loop and the model writes the final reply.
 */

import { tryZedFastPath } from '../runZedFastPath';
import { runZedChatLoop } from '../runZedChatLoop';
import { ToolRegistry } from '../tools/registry';

const CTX = {
  workspace_terminals: [
    { terminalId: 'p1', displayName: 'Chase' },
    { terminalId: 'p2', displayName: 'Cesar' },
  ],
  terminal_panel_count: 2,
};

const P0_PHRASES = [
  '¿Qué terminales hay?',
  'Abre una terminal',
  'Cierra Chase',
  'Cierra todas las terminales',
  'ejecuta npm test',
  '¿Qué respondió Chase?',
  'resume la terminal Chase',
];

describe('Zed LLM-only P0 smoke', () => {
  const prevFast = process.env.ZED_FAST_PATH;
  const prevShort = process.env.ZED_LLM_SHORT_CIRCUIT;

  beforeAll(() => {
    process.env.ZED_FAST_PATH = '0';
    process.env.ZED_LLM_SHORT_CIRCUIT = '0';
  });

  afterAll(() => {
    if (prevFast === undefined) delete process.env.ZED_FAST_PATH;
    else process.env.ZED_FAST_PATH = prevFast;
    if (prevShort === undefined) delete process.env.ZED_LLM_SHORT_CIRCUIT;
    else process.env.ZED_LLM_SHORT_CIRCUIT = prevShort;
  });

  function mockRegistry(handlers = {}) {
    return {
      execute: jest.fn(async (tool, input) => {
        if (typeof handlers[tool] === 'function') return handlers[tool](input);
        if (handlers[tool]) return handlers[tool];
        return { ok: true, tool, input };
      }),
    };
  }

  function buildRegistry(tools) {
    const registry = new ToolRegistry();
    for (const [name, execute] of Object.entries(tools)) {
      registry.register({ name, description: name, parameters: {}, execute });
    }
    return registry;
  }

  test.each(P0_PHRASES)('fast path miss → LLM path for: %s', async (phrase) => {
    const registry = mockRegistry();
    const result = await tryZedFastPath({
      message: phrase,
      registry,
      requestContext: CTX,
      msgId: 'smoke-p0',
    });
    expect(result.hit).toBe(false);
    expect(registry.execute).not.toHaveBeenCalled();
  });

  test('list_terminals: LLM writes final reply (not canned short-circuit)', async () => {
    const registry = buildRegistry({
      list_terminals: async () => ({
        processes: [
          { displayName: 'Chase', terminalId: 'p1' },
          { displayName: 'Cesar', terminalId: 'p2' },
        ],
      }),
    });
    const callMinimax = jest
      .fn()
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', name: 'list_terminals', input: {}, id: 'tu-1' }],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Tenés Chase y Cesar abiertas.' }],
      });

    const { finalText, meta, allToolResults } = await runZedChatLoop({
      systemPrompt: '',
      conversation: [{ role: 'user', content: '¿Qué terminales hay?' }],
      registry,
      anthropicTools: registry.toAnthropicTools(),
      apiKey: 'test',
      requestContext: { ...CTX },
      maxTurns: 4,
      callMinimax,
      model: 'test-model',
    });

    expect(allToolResults.map((t) => t.tool)).toEqual(['list_terminals']);
    expect(callMinimax).toHaveBeenCalledTimes(2);
    expect(meta.short_circuited).toBeUndefined();
    expect(finalText).toBe('Tenés Chase y Cesar abiertas.');
    expect(finalText).not.toMatch(/Hay 2 terminales abiertas/);
  });

  test('close by name: close_terminal(name=Chase) then LLM reply', async () => {
    const registry = buildRegistry({
      close_terminal: async (input) => ({
        success: true,
        name: input.name,
        terminalId: 'p1',
      }),
    });
    const callMinimax = jest
      .fn()
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            name: 'close_terminal',
            input: { name: 'Chase' },
            id: 'tu-close',
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Cerré Chase.' }],
      });

    const { finalText, allToolResults } = await runZedChatLoop({
      systemPrompt: '',
      conversation: [{ role: 'user', content: 'Cierra Chase' }],
      registry,
      anthropicTools: registry.toAnthropicTools(),
      apiKey: 'test',
      requestContext: { ...CTX },
      maxTurns: 4,
      callMinimax,
      model: 'test-model',
    });

    expect(allToolResults[0].input).toEqual({ name: 'Chase' });
    expect(allToolResults[0].result.success).toBe(true);
    expect(finalText).toBe('Cerré Chase.');
  });

  test('execute + summarize chain (multi-turn tools)', async () => {
    const registry = buildRegistry({
      execute_in_terminal: async (input) => ({
        sent: true,
        name: input.name,
        recent_output: 'PASS src/foo.test.js',
      }),
      summarize_terminal: async (input) => ({
        name: input.name,
        digest: 'Chase corrió tests y pasaron.',
        tail: 'PASS src/foo.test.js',
      }),
    });
    const callMinimax = jest
      .fn()
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            name: 'execute_in_terminal',
            input: { name: 'Chase', input: 'npm test\n' },
            id: 'tu-exec',
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            name: 'summarize_terminal',
            input: { name: 'Chase' },
            id: 'tu-sum',
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Chase pasó los tests (PASS src/foo.test.js).' }],
      });

    const { finalText, allToolResults, meta } = await runZedChatLoop({
      systemPrompt: '',
      conversation: [{ role: 'user', content: 'ejecuta npm test en Chase y resumí' }],
      registry,
      anthropicTools: registry.toAnthropicTools(),
      apiKey: 'test',
      requestContext: { ...CTX },
      maxTurns: 6,
      callMinimax,
      model: 'test-model',
    });

    expect(allToolResults.map((t) => t.tool)).toEqual([
      'execute_in_terminal',
      'summarize_terminal',
    ]);
    expect(callMinimax).toHaveBeenCalledTimes(3);
    expect(meta.short_circuited).toBeUndefined();
    expect(finalText).toMatch(/pasó|PASS/i);
  });
});

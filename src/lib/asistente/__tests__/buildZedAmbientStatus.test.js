const { buildZedAmbientStatus, extractToolType } = require('../buildZedAmbientStatus');

describe('buildZedAmbientStatus', () => {
  test('prefers short tool summary over long assistant prose', () => {
    expect(
      buildZedAmbientStatus({
        role: 'assistant',
        content:
          'Listo, abrí GitHub en el navegador integrado del workspace para que puedas verlo.',
        tool_results: [
          { tool: 'open_url', result: { url: 'https://github.com/', label: 'GitHub' } },
        ],
      })
    ).toBe('Listo. Abrí GitHub en pizarra.');
  });

  test('summarizes ZED Orchestrator launches distinctly from generic OpenCode', () => {
    expect(
      buildZedAmbientStatus({
        role: 'assistant',
        content: 'Abrí ZED en standby.',
        tool_results: [
          {
            tool: 'open_terminal',
            result: {
              workspace: true,
              program: 'opencode',
              command_sent: 'opencode --agent zed-orchestrator',
            },
          },
        ],
      })
    ).toBe('Listo. Abrí ZED Orchestrator.');
  });

  test('summarizes OpenCode launches with a short line', () => {
    expect(
      buildZedAmbientStatus({
        role: 'assistant',
        content: 'Perfecto, abrí una terminal con OpenCode usando el perfil gentle-orchestrator.',
        tool_results: [
          {
            tool: 'open_terminal',
            result: {
              workspace: true,
              program: 'opencode',
              command_sent: '/home/matias/.opencode/bin/opencode --agent gentle-orchestrator',
            },
          },
        ],
      })
    ).toBe('Listo. Abrí OpenCode.');
  });

  test('summarizes tools when model returns empty text', () => {
    expect(
      buildZedAmbientStatus({
        role: 'assistant',
        content: '',
        tool_results: [
          { tool: 'open_terminal', result: { workspace: true, command_sent: 'ls' } },
          { tool: 'open_terminal', result: { error: 'terminal_panel_limit_reached', limit: 6 } },
          { tool: 'open_url', result: { url: 'https://github.com/', label: 'GitHub' } },
        ],
      })
    ).toBe('Listo. Ejecuté ls.');
  });

  test('compresses long prose when no tool summary exists', () => {
    expect(
      buildZedAmbientStatus({
        role: 'assistant',
        content:
          'He revisado el estado del workspace y todo parece estar en orden. Podés seguir trabajando con normalidad.',
      })
    ).toBe('He revisado el estado del workspace y todo parece estar…');
  });

  test('returns compact error text', () => {
    expect(
      buildZedAmbientStatus({
        role: 'assistant',
        content: 'Error: MiniMax API error 401',
      })
    ).toBe('Error: MiniMax API error 401');
  });

  test('returns greeting text (overlay skips via timestamp)', () => {
    expect(
      buildZedAmbientStatus({
        role: 'assistant',
        content: 'Hola, soy Zed. ¿En qué te puedo ayudar?',
      })
    ).toBe('Hola, soy Zed. ¿En qué te puedo ayudar?');
  });
});

describe('extractToolType', () => {
  test('returns null for null input', () => {
    expect(extractToolType(null)).toBeNull();
  });

  test('returns null for non-object input', () => {
    expect(extractToolType(undefined)).toBeNull();
    expect(extractToolType('string')).toBeNull();
    expect(extractToolType(42)).toBeNull();
  });

  test('maps terminal tool names to "terminal"', () => {
    expect(extractToolType({ tool_results: [{ tool: 'open_terminal' }] })).toBe('terminal');
    expect(extractToolType({ tool_results: [{ tool: 'execute_in_terminal' }] })).toBe('terminal');
    expect(extractToolType({ tool_results: [{ tool: 'close_terminal' }] })).toBe('terminal');
  });

  test('maps open_url to "browser"', () => {
    expect(extractToolType({ tool_results: [{ tool: 'open_url' }] })).toBe('browser');
  });

  test('maps list_terminals to "file"', () => {
    expect(extractToolType({ tool_results: [{ tool: 'list_terminals' }] })).toBe('file');
  });

  test('maps unknown tool names to "file" (catch-all bucket)', () => {
    expect(extractToolType({ tool_results: [{ tool: 'weird_tool' }] })).toBe('file');
  });

  test('returns null for messages with content but no tool_results', () => {
    expect(extractToolType({ role: 'assistant', content: 'Hello there' })).toBeNull();
  });

  test('returns null when tool_results is an empty array', () => {
    expect(extractToolType({ tool_results: [] })).toBeNull();
  });

  test('returns null when tool_results[0].tool is not a string', () => {
    expect(extractToolType({ tool_results: [{}] })).toBeNull();
    expect(extractToolType({ tool_results: [{ tool: null }] })).toBeNull();
    expect(extractToolType({ tool_results: [{ tool: 42 }] })).toBeNull();
  });

  test('prefers tool_results over content when both present', () => {
    expect(
      extractToolType({
        role: 'assistant',
        content: 'I opened a terminal for you.',
        tool_results: [{ tool: 'open_terminal' }],
      })
    ).toBe('terminal');
  });
});

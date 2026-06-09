const { buildZedAmbientStatus } = require('../buildZedAmbientStatus');

describe('buildZedAmbientStatus', () => {
  test('prefers short tool summary over long assistant prose', () => {
    expect(
      buildZedAmbientStatus({
        role: 'assistant',
        content: 'Listo, abrí GitHub en el navegador integrado del workspace para que puedas verlo.',
        tool_results: [{ tool: 'open_url', result: { url: 'https://github.com/', label: 'GitHub' } }],
      })
    ).toBe('Listo. Abrí GitHub en pizarra.');
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
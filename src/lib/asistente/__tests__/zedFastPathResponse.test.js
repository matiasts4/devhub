/**
 * @jest-environment jsdom
 */

import { formatZedFastPathReply, formatZedToolResultsReply } from '../zedFastPathResponse';

describe('formatZedFastPathReply', () => {
  test('returns Listo for null result', () => {
    expect(formatZedFastPathReply('open_terminal', null)).toBe('Listo.');
  });

  test('formats command_requires_approval', () => {
    expect(
      formatZedFastPathReply('execute_in_terminal', {
        error: 'command_requires_approval',
        full_command: 'rm -rf tmp',
      })
    ).toBe('Necesito tu confirmación para ejecutar: rm -rf tmp');
  });

  test('formats list_terminals', () => {
    expect(
      formatZedFastPathReply('list_terminals', {
        processes: [
          { displayName: 'Panel-A', terminalId: 't1' },
          { displayName: 'Panel-B', terminalId: 't2' },
        ],
      })
    ).toBe('Hay 2 terminales abiertas: Panel-A, Panel-B.');
  });

  test('formats open_terminal', () => {
    expect(
      formatZedFastPathReply('open_terminal', {
        opened: true,
        displayName: 'Panel-A',
        terminalId: 't1',
        program: 'node',
      })
    ).toBe('Listo. Abrí la terminal Panel-A (t1) con node.');
  });

  test('formats open_url', () => {
    expect(formatZedFastPathReply('open_url', { url: 'https://github.com' })).toBe(
      'Listo. Abrí https://github.com en el navegador.'
    );
  });

  test('formats terminal_panel_limit error', () => {
    expect(
      formatZedFastPathReply('open_terminal', {
        error: 'terminal_panel_limit_reached',
        current: 4,
        max: 4,
      })
    ).toBe('Límite de paneles alcanzado (4/4). Cerrá alguna terminal antes de abrir más.');
  });
});

describe('formatZedToolResultsReply', () => {
  test('joins multiple replies', () => {
    expect(
      formatZedToolResultsReply([
        { tool: 'list_terminals', result: { processes: [] } },
        { tool: 'open_url', result: { url: 'https://example.com' } },
      ])
    ).toBe('No hay terminales abiertas. Listo. Abrí https://example.com en el navegador.');
  });
});

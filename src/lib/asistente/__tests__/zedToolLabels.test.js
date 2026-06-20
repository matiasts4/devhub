/**
 * @jest-environment jsdom
 */

import { labelForZedToolStart, labelForZedToolDone } from '../zedToolLabels';

describe('zedToolLabels', () => {
  describe('labelForZedToolStart', () => {
    test('open_terminal with name and command', () => {
      expect(
        labelForZedToolStart('open_terminal', { name: 'Panel-A', command: 'npm run dev' })
      ).toBe('Abriendo Panel-A · npm run dev…');
    });

    test('open_terminal with program only', () => {
      expect(labelForZedToolStart('open_terminal', { program: 'node' })).toBe(
        'Abriendo terminal · node…'
      );
    });

    test('open_terminal without input', () => {
      expect(labelForZedToolStart('open_terminal')).toBe('Abriendo terminal…');
    });

    test('execute_in_terminal uses name', () => {
      expect(labelForZedToolStart('execute_in_terminal', { name: 'Panel-A' })).toBe(
        'Ejecutando en Panel-A…'
      );
    });

    test('execute_in_terminal falls back to session_id', () => {
      expect(labelForZedToolStart('execute_in_terminal', { session_id: 'sess-1' })).toBe(
        'Ejecutando en sess-1…'
      );
    });

    test('open_url strips scheme and path', () => {
      expect(labelForZedToolStart('open_url', { url: 'https://github.com/foo/bar' })).toBe(
        'Abriendo github.com…'
      );
    });

    test('unknown tool returns generic label', () => {
      expect(labelForZedToolStart('custom_tool')).toBe('Ejecutando custom_tool…');
    });
  });

  describe('labelForZedToolDone', () => {
    test('returns done labels', () => {
      expect(labelForZedToolDone('open_terminal')).toBe('Terminal lista');
      expect(labelForZedToolDone('execute_in_terminal')).toBe('Comando enviado');
      expect(labelForZedToolDone('open_url')).toBe('Navegador abierto');
      expect(labelForZedToolDone('unknown')).toBe('Listo');
    });
  });
});

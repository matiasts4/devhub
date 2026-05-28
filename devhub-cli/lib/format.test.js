'use strict';

const { table } = require('../lib/format');

describe('table() helper', () => {
  describe('TTY mode', () => {
    it('renders aligned columns with header separator', () => {
      const headers = ['Score', 'Status', 'Title'];
      const rows = [
        ['85', 'pending', 'Fix auth bug'],
        ['70', 'blocked', 'Update schema'],
      ];
      const output = table(headers, rows, true);
      const lines = output.split('\n');
      // Header line
      expect(lines[0]).toMatch(/Score.*Status.*Title/);
      // Separator line (all dashes or similar)
      expect(lines[1]).toMatch(/-+/);
      // Data lines with aligned content
      expect(lines[2]).toMatch(/85.*pending.*Fix auth bug/);
      expect(lines[3]).toMatch(/70.*blocked.*Update schema/);
    });

    it('pads columns to max width', () => {
      const headers = ['A', 'B'];
      const rows = [
        ['short', 'very long value here'],
        ['much longer value', 'x'],
      ];
      const output = table(headers, rows, true);
      const lines = output.split('\n');
      // Both rows should have similar total length (aligned)
      expect(lines[2].length).toBe(lines[3].length);
    });

    it('handles empty rows', () => {
      const headers = ['Col1', 'Col2'];
      const output = table(headers, [], true);
      const lines = output.split('\n');
      expect(lines[0]).toMatch(/Col1.*Col2/);
      expect(lines[1]).toMatch(/-+/);
      // Only header + separator, no data rows
      expect(lines.length).toBe(2);
    });

    it('handles empty headers and rows', () => {
      const output = table([], [], true);
      expect(output).toBe('');
    });
  });

  describe('non-TTY mode', () => {
    it('outputs pipe-separated rows without header', () => {
      const headers = ['Score', 'Status', 'Title'];
      const rows = [
        ['85', 'pending', 'Fix auth bug'],
        ['70', 'blocked', 'Update schema'],
      ];
      const output = table(headers, rows, false);
      const lines = output.split('\n');
      // No header row — first line is data
      expect(lines[0]).toBe('85|pending|Fix auth bug');
      expect(lines[1]).toBe('70|blocked|Update schema');
    });

    it('contains no ANSI escape sequences', () => {
      const headers = ['Score', 'Status'];
      const rows = [['85', 'pending']];
      const output = table(headers, rows, false);
      expect(output).not.toContain('\x1b[');
    });

    it('handles empty rows', () => {
      const headers = ['Col1', 'Col2'];
      const output = table(headers, [], false);
      expect(output).toBe('');
    });

    it('handles empty headers and rows', () => {
      const output = table([], [], false);
      expect(output).toBe('');
    });
  });

  describe('default isTTY behavior', () => {
    it('uses module-level isTTY when not overridden', () => {
      const { isTTY } = require('../lib/format');
      const headers = ['X'];
      const rows = [['1']];
      const output = table(headers, rows);
      if (isTTY) {
        expect(output).toMatch(/X/);
        expect(output).toMatch(/-+/);
      } else {
        expect(output).toBe('1');
      }
    });
  });
});

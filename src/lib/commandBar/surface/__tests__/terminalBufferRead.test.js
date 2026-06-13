/**
 * @jest-environment node
 */

import { shapeBufferText } from '../terminalBufferRead';

describe('terminalBufferRead', () => {
  describe('shapeBufferText', () => {
    it('strips ANSI color codes', () => {
      const input = '\x1B[31mred text\x1B[0m normal';
      const result = shapeBufferText(input, { maxLines: 1000 });
      
      expect(result.text).toBe('red text normal');
      expect(result.truncated).toBe(false);
    });

    it('strips ANSI cursor codes', () => {
      const input = '\x1B[2J\x1B[Hcleared screen';
      const result = shapeBufferText(input, { maxLines: 1000 });
      
      expect(result.text).toBe('cleared screen');
      expect(result.truncated).toBe(false);
    });

    it('strips OSC sequences', () => {
      const input = '\x1B]0;window title\x07actual text';
      const result = shapeBufferText(input, { maxLines: 1000 });
      
      expect(result.text).toBe('actual text');
      expect(result.truncated).toBe(false);
    });

    it('strips complex ANSI sequences', () => {
      const input = '\x1B[1;32mbold green\x1B[0m\x1B]0;title\x07\x1B[2K\x1B[Gtext';
      const result = shapeBufferText(input, { maxLines: 1000 });
      
      expect(result.text).toBe('bold greentext');
      expect(result.truncated).toBe(false);
    });

    it('handles empty buffer', () => {
      const result = shapeBufferText('', { maxLines: 1000 });
      
      expect(result.text).toBe('');
      expect(result.truncated).toBe(false);
    });

    it('truncates large buffer to last N lines', () => {
      const lines = Array.from({ length: 2000 }, (_, i) => `line ${i + 1}`);
      const input = lines.join('\n');
      
      const result = shapeBufferText(input, { maxLines: 1000 });
      
      const resultLines = result.text.split('\n');
      expect(resultLines.length).toBe(1000);
      expect(resultLines[0]).toBe('line 1001');
      expect(resultLines[999]).toBe('line 2000');
      expect(result.truncated).toBe(true);
    });

    it('does not truncate when buffer is exactly maxLines', () => {
      const lines = Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`);
      const input = lines.join('\n');
      
      const result = shapeBufferText(input, { maxLines: 1000 });
      
      const resultLines = result.text.split('\n');
      expect(resultLines.length).toBe(1000);
      expect(result.truncated).toBe(false);
    });

    it('does not truncate when buffer is smaller than maxLines', () => {
      const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`);
      const input = lines.join('\n');
      
      const result = shapeBufferText(input, { maxLines: 1000 });
      
      const resultLines = result.text.split('\n');
      expect(resultLines.length).toBe(500);
      expect(result.truncated).toBe(false);
    });

    it('preserves line breaks in output', () => {
      const input = 'line 1\nline 2\nline 3';
      const result = shapeBufferText(input, { maxLines: 1000 });
      
      expect(result.text).toBe('line 1\nline 2\nline 3');
      expect(result.truncated).toBe(false);
    });

    it('handles mixed ANSI codes and multiline content', () => {
      const input = '\x1B[32mgreen line 1\x1B[0m\n\x1B[31mred line 2\x1B[0m\n\x1B[34mblue line 3\x1B[0m';
      const result = shapeBufferText(input, { maxLines: 1000 });
      
      expect(result.text).toBe('green line 1\nred line 2\nblue line 3');
      expect(result.truncated).toBe(false);
    });

    it('handles single-line buffer without newline', () => {
      const input = 'single line';
      const result = shapeBufferText(input, { maxLines: 1000 });
      
      expect(result.text).toBe('single line');
      expect(result.truncated).toBe(false);
    });
  });
});

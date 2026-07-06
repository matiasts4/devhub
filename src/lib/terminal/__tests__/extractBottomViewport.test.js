const { extractBottomViewport } = require('../extractBottomViewport.js');

describe('extractBottomViewport', () => {
  test('returns full buffer when under max lines', () => {
    expect(extractBottomViewport('a\nb\nc', { maxLines: 5 })).toBe('a\nb\nc');
  });

  test('keeps only bottom N lines', () => {
    const buf = ['old1', 'old2', 'live1', 'live2'].join('\n');
    expect(extractBottomViewport(buf, { maxLines: 2 })).toBe('live1\nlive2');
  });
});

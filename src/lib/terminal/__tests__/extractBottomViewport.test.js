const {
  extractBottomViewport,
  processCarriageReturns,
  resolveDetectionSizing,
  DEFAULT_DETECTION_VIEWPORT_LINES,
  DEFAULT_DETECTION_BUFFER_CHARS,
  MAX_DETECTION_VIEWPORT_LINES,
  MAX_DETECTION_BUFFER_CHARS,
} = require('../extractBottomViewport.js');

describe('extractBottomViewport', () => {
  test('returns full buffer when under max lines', () => {
    expect(extractBottomViewport('a\nb\nc', { maxLines: 5 })).toBe('a\nb\nc');
  });

  test('keeps only bottom N lines', () => {
    const buf = ['old1', 'old2', 'live1', 'live2'].join('\n');
    expect(extractBottomViewport(buf, { maxLines: 2 })).toBe('live1\nlive2');
  });

  test('processes carriage return line overwrites', () => {
    const buf = 'frame1\rframe2\rframe3\nnext line';
    expect(processCarriageReturns(buf)).toBe('frame3\nnext line');
    expect(extractBottomViewport(buf, { maxLines: 5 })).toBe('frame3\nnext line');
  });

  test('defaults to 40 lines when maxLines not provided', () => {
    const buf = Array.from({ length: 50 }, (_, i) => `line${i}`).join('\n');
    const out = extractBottomViewport(buf);
    expect(out.split('\n')).toHaveLength(40);
    expect(out.startsWith('line10')).toBe(true);
  });
});

describe('resolveDetectionSizing (W5)', () => {
  test('defaults without termsize', () => {
    expect(resolveDetectionSizing()).toEqual({
      viewportLines: DEFAULT_DETECTION_VIEWPORT_LINES,
      bufferChars: DEFAULT_DETECTION_BUFFER_CHARS,
    });
    expect(resolveDetectionSizing({})).toEqual({
      viewportLines: 40,
      bufferChars: 8192,
    });
  });

  test('small terminal keeps the defaults (viewport already covers screen)', () => {
    const sizing = resolveDetectionSizing({ cols: 80, rows: 24 });
    expect(sizing.viewportLines).toBe(40);
    expect(sizing.bufferChars).toBe(8192);
  });

  test('tall terminal scales viewport to rows', () => {
    const sizing = resolveDetectionSizing({ cols: 120, rows: 60 });
    expect(sizing.viewportLines).toBe(60);
    expect(sizing.bufferChars).toBe(120 * 60 * 2);
  });

  test('large terminal scales buffer to at least rows*cols*2', () => {
    const sizing = resolveDetectionSizing({ cols: 200, rows: 60 });
    expect(sizing.bufferChars).toBe(24000);
  });

  test('clamps to hard caps', () => {
    const sizing = resolveDetectionSizing({ cols: 1000, rows: 1000 });
    expect(sizing.viewportLines).toBe(MAX_DETECTION_VIEWPORT_LINES);
    expect(sizing.bufferChars).toBe(MAX_DETECTION_BUFFER_CHARS);
  });

  test('explicit overrides win and are clamped to sane bounds', () => {
    const sizing = resolveDetectionSizing({
      cols: 200,
      rows: 60,
      viewportLines: 45,
      bufferChars: 9000,
    });
    expect(sizing.viewportLines).toBe(45);
    expect(sizing.bufferChars).toBe(9000);

    // bufferChars can never go below the default floor
    expect(resolveDetectionSizing({ bufferChars: 100 }).bufferChars).toBe(8192);
  });
});

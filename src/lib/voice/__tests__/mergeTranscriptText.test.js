const { mergeTranscriptText } = require('../mergeTranscriptText');

describe('mergeTranscriptText', () => {
  test('incoming extends current prefix', () => {
    expect(mergeTranscriptText('hola', 'hola mundo')).toBe('hola mundo');
  });

  test('overlap merge', () => {
    expect(mergeTranscriptText('abre terminal', 'terminal nueva')).toBe('abre terminal nueva');
  });

  test('empty incoming keeps current', () => {
    expect(mergeTranscriptText('quedó', '')).toBe('quedó');
  });
});

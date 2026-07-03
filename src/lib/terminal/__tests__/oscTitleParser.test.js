const { processOscTitle, stripOscTitleSequences } = require('../oscTitleParser.js');

describe('oscTitleParser', () => {
  describe('processOscTitle', () => {
    function makeSession() {
      return { title: null, _oscTitleBuffer: '' };
    }

    test('extracts OSC 0 title terminated by BEL', () => {
      const session = makeSession();
      processOscTitle(session, '\x1b]0;my title\x07');
      expect(session.title).toBe('my title');
    });

    test('extracts OSC 2 title terminated by BEL', () => {
      const session = makeSession();
      processOscTitle(session, '\x1b]2;window title\x07');
      expect(session.title).toBe('window title');
    });

    test('extracts OSC title terminated by ST', () => {
      const session = makeSession();
      processOscTitle(session, '\x1b]0;st title\x1b\\');
      expect(session.title).toBe('st title');
    });

    test('uses the last title when multiple sequences are present', () => {
      const session = makeSession();
      processOscTitle(session, '\x1b]0;first\x07\x1b]0;second\x07');
      expect(session.title).toBe('second');
    });

    test('handles titles split across chunks', () => {
      const session = makeSession();
      processOscTitle(session, '\x1b]0;part one ');
      expect(session.title).toBeNull();
      processOscTitle(session, 'part two\x07');
      expect(session.title).toBe('part one part two');
    });

    test('ignores unsupported OSC sequences', () => {
      const session = makeSession();
      processOscTitle(session, '\x1b]9;notification\x07');
      expect(session.title).toBeNull();
    });

    test('does nothing for non-string input', () => {
      const session = makeSession();
      processOscTitle(session, null);
      processOscTitle(session, undefined);
      processOscTitle(session, 123);
      expect(session.title).toBeNull();
    });

    test('caps the trailing buffer to avoid unbounded growth', () => {
      const session = makeSession();
      const longPrefix = 'a'.repeat(2000);
      processOscTitle(session, longPrefix);
      expect(session._oscTitleBuffer.length).toBeLessThanOrEqual(1024);
    });
  });

  describe('stripOscTitleSequences', () => {
    test('removes OSC title sequences', () => {
      const chunk = 'hello\x1b]0;title\x07world';
      expect(stripOscTitleSequences(chunk)).toBe('helloworld');
    });

    test('returns non-string input unchanged', () => {
      expect(stripOscTitleSequences(null)).toBeNull();
      expect(stripOscTitleSequences('')).toBe('');
    });
  });
});

const { isSafeHttpUrl } = require('../../tools/urlSafety');

describe('isSafeHttpUrl', () => {
  test('accepts an https URL', () => {
    const r = isSafeHttpUrl('https://github.com/foo');
    expect(r.url).toBe('https://github.com/foo');
  });

  test('accepts an http URL', () => {
    const r = isSafeHttpUrl('http://example.com');
    expect(r.url).toBe('http://example.com/');
  });

  test('rejects javascript: scheme', () => {
    const r = isSafeHttpUrl('javascript:alert(1)');
    expect(r.error).toMatch(/unsupported scheme/i);
    expect(r.error).toContain('javascript:');
  });

  test('rejects data: scheme', () => {
    const r = isSafeHttpUrl('data:text/html,<script>1</script>');
    expect(r.error).toMatch(/unsupported scheme/i);
    expect(r.error).toContain('data:');
  });

  test('rejects file: scheme', () => {
    const r = isSafeHttpUrl('file:///etc/passwd');
    expect(r.error).toMatch(/unsupported scheme/i);
  });

  test('rejects a malformed URL string', () => {
    const r = isSafeHttpUrl('not a url');
    expect(r.error).toBe('invalid url');
  });
});

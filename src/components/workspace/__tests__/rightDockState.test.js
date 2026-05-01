const { normalizeBrowserUrl } = require('../rightDockState');

describe('rightDockState normalizeBrowserUrl', () => {
  test('accepts single-label hostnames used in local/LAN development', () => {
    expect(normalizeBrowserUrl('devbox:3000')).toBe('http://devbox:3000/');
    expect(normalizeBrowserUrl('workspace-node.local:4173')).toBe('http://workspace-node.local:4173/');
  });

  test('falls back to DuckDuckGo search for malformed explicit URLs with free-text whitespace', () => {
    expect(normalizeBrowserUrl('http://bad host:3000')).toBe(
      'https://duckduckgo.com/?q=http%3A%2F%2Fbad%20host%3A3000'
    );
  });

  test('rejects malformed explicit hostnames that are not valid searchable free text', () => {
    expect(normalizeBrowserUrl('http://-bad-host:3000')).toBe('');
  });
});

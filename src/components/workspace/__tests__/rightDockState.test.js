const { normalizeBrowserUrl, sanitizeRightDockState } = require('../rightDockState');

describe('rightDockState normalizeBrowserUrl', () => {
  test('accepts single-label hostnames used in local/LAN development', () => {
    expect(normalizeBrowserUrl('devbox:3000')).toBe('http://devbox:3000/');
    expect(normalizeBrowserUrl('workspace-node.local:4173')).toBe('http://workspace-node.local:4173/');
  });

  test('defaults plain public domains to https', () => {
    expect(normalizeBrowserUrl('arxonlabs.com')).toBe('https://arxonlabs.com/');
    expect(normalizeBrowserUrl('www.arxonlabs.com/docs')).toBe('https://www.arxonlabs.com/docs');
  });

  test('rejects malformed explicit URLs with free-text whitespace', () => {
    expect(normalizeBrowserUrl('http://bad host:3000')).toBe('');
  });

  test('rejects malformed explicit hostnames that are not valid searchable free text', () => {
    expect(normalizeBrowserUrl('http://-bad-host:3000')).toBe('');
  });
});

describe('rightDockState sanitizeRightDockState', () => {
  test('sanitizeRightDockState accepts activeTab: "pizarra"', () => {
    const result = sanitizeRightDockState({ activeTab: 'pizarra' });
    expect(result.activeTab).toBe('pizarra');
  });

  test('sanitizeRightDockState accepts maximizedView: "pizarra"', () => {
    const result = sanitizeRightDockState({ maximizedView: 'pizarra' });
    expect(result.maximizedView).toBe('pizarra');
  });

  test('sanitizeRightDockState with pizarra activeTab and maximizedView preserves both', () => {
    const result = sanitizeRightDockState({ activeTab: 'pizarra', maximizedView: 'pizarra' });
    expect(result.activeTab).toBe('pizarra');
    expect(result.maximizedView).toBe('pizarra');
  });

  test('sanitizeRightDockState with pizarra as activeTab sets default maximizedView to pizarra', () => {
    const result = sanitizeRightDockState({ activeTab: 'pizarra', maximizedView: 'invalid' });
    expect(result.activeTab).toBe('pizarra');
    expect(result.maximizedView).toBe('pizarra');
  });

  test('sanitizeRightDockState falls back to browser for unknown activeTab', () => {
    const result = sanitizeRightDockState({ activeTab: 'unknown-tab' });
    expect(result.activeTab).toBe('browser');
  });
});

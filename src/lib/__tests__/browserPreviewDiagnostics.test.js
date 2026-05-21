const {
  PREVIEW_DIAGNOSTIC_PREFIX,
  PREVIEW_PROXY_DIAGNOSTIC_PREFIX,
  buildBrowserPreviewDiagnostic,
  buildPreviewProxyDiagnostic,
  buildPreviewDiagnosticDedupeKey,
  categorizePreviewReason,
  categorizeProxyReason,
} = require('../browserPreviewDiagnostics');

describe('browserPreviewDiagnostics', () => {
  test('normalizes browser preview diagnostics into stable reason categories', () => {
    expect(buildBrowserPreviewDiagnostic('selector-state-transition', {
      reason: 'proxy-escaped',
      supportMode: 'unsupported',
    })).toEqual(expect.objectContaining({
      message: `${PREVIEW_DIAGNOSTIC_PREFIX} selector-state-transition`,
      event: 'selector-state-transition',
      reason: 'proxy-escaped',
      reasonCategory: 'proxy-loss',
      supportMode: 'unsupported',
      source: 'browser-preview',
    }));

    expect(categorizePreviewReason('same-origin-access')).toBe('same-origin-fallback');
    expect(categorizePreviewReason('cross-origin-no-instrumentation')).toBe('missing-instrumentation');
  });

  test('normalizes preview proxy diagnostics into stable rewrite categories', () => {
    expect(buildPreviewProxyDiagnostic('proxy-navigation-escape-risk', {
      reason: 'cross-origin-navigation-target',
      target: { href: 'http://localhost:3200/app' },
    })).toEqual(expect.objectContaining({
      message: `${PREVIEW_PROXY_DIAGNOSTIC_PREFIX} proxy-navigation-escape-risk`,
      event: 'proxy-navigation-escape-risk',
      reason: 'cross-origin-navigation-target',
      reasonCategory: 'proxy-escape-risk',
      source: 'preview-proxy',
    }));

    expect(categorizeProxyReason('target-not-allowed')).toBe('localhost-only-target');
    expect(categorizeProxyReason('html-rewrite-failed')).toBe('rewrite-failure');
  });

  test('builds deterministic dedupe keys from repeated preview diagnostics', () => {
    const first = buildPreviewDiagnosticDedupeKey(buildBrowserPreviewDiagnostic('selector-state-transition', {
      reason: 'proxy-escaped',
      supportMode: 'unsupported',
      browserUrl: { href: 'http://localhost:3200/app' },
    }));
    const second = buildPreviewDiagnosticDedupeKey(buildBrowserPreviewDiagnostic('selector-state-transition', {
      reason: 'proxy-escaped',
      supportMode: 'unsupported',
      browserUrl: { href: 'http://localhost:3200/app' },
    }));
    const third = buildPreviewDiagnosticDedupeKey(buildBrowserPreviewDiagnostic('selector-state-transition', {
      reason: 'cross-origin-no-instrumentation',
      supportMode: 'unsupported',
      browserUrl: { href: 'https://example.com/' },
    }));

    expect(first).toBe(second);
    expect(third).not.toBe(first);
  });
});

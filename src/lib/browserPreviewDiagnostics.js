export const PREVIEW_DIAGNOSTIC_PREFIX = '[devhub][visual-edit]';
export const PREVIEW_PROXY_DIAGNOSTIC_PREFIX = '[devhub][preview-proxy]';

const PREVIEW_REASON_CATEGORIES = {
  'proxy-escaped': 'proxy-loss',
  'proxy-active': 'proxy-recovery',
  'same-origin-access': 'same-origin-fallback',
  'cross-origin-no-instrumentation': 'missing-instrumentation',
  'protocol-active': 'protocol-ready',
  'protocol-pending': 'protocol-pending',
  'handshake-timeout': 'handshake-timeout',
};

const PROXY_REASON_CATEGORIES = {
  'cross-origin-navigation-target': 'proxy-escape-risk',
  'target-not-allowed': 'localhost-only-target',
  'html-rewrite-failed': 'rewrite-failure',
  'url-parse-failed': 'invalid-target-url',
};

export function categorizePreviewReason(reason) {
  return PREVIEW_REASON_CATEGORIES[String(reason || '')] || 'other';
}

export function categorizeProxyReason(reason) {
  return PROXY_REASON_CATEGORIES[String(reason || '')] || 'other';
}

export function buildBrowserPreviewDiagnostic(event, details = {}) {
  const reasonCategory = categorizePreviewReason(details.reason);
  return {
    source: 'browser-preview',
    prefix: PREVIEW_DIAGNOSTIC_PREFIX,
    event,
    message: `${PREVIEW_DIAGNOSTIC_PREFIX} ${event}`,
    reason: details.reason || null,
    reasonCategory,
    supportMode: details.supportMode || null,
    details: {
      ...details,
      reasonCategory,
    },
  };
}

export function buildPreviewProxyDiagnostic(event, details = {}) {
  const reasonCategory = categorizeProxyReason(details.reason);
  return {
    source: 'preview-proxy',
    prefix: PREVIEW_PROXY_DIAGNOSTIC_PREFIX,
    event,
    message: `${PREVIEW_PROXY_DIAGNOSTIC_PREFIX} ${event}`,
    reason: details.reason || null,
    reasonCategory,
    supportMode: details.supportMode || null,
    details: {
      ...details,
      reasonCategory,
    },
  };
}

export function buildPreviewDiagnosticDedupeKey(payload = {}) {
  const details = payload.details || {};
  return JSON.stringify({
    source: payload.source || null,
    event: payload.event || null,
    reason: payload.reason || null,
    reasonCategory: payload.reasonCategory || null,
    supportMode: payload.supportMode || null,
    browserUrl: details.browserUrl?.href || details.target?.href || null,
    iframeSrc: details.iframeSrc?.href || null,
  });
}

'use client';

export const PREVIEW_SUPPORT_MODE = {
  SAME_ORIGIN_DOM: 'same-origin-dom',
  LOCALHOST_PROXY: 'localhost-proxy',
  REMOTE_PROTOCOL: 'remote-protocol',
  UNSUPPORTED: 'unsupported',
};

export const BROWSER_RUNTIME = {
  IFRAME: 'iframe',
  NATIVE_GTK: 'native-gtk',
};

export const BROWSER_RUNTIME_FALLBACK_REASON = {
  EDIT_MODE_REQUIRES_IFRAME: 'edit-mode-requires-iframe',
  PROBE_FAILED: 'probe-failed',
  SELECTOR_UNAVAILABLE: 'selector-unavailable',
};

export function hasNativeSelectorInspectCapability(nativeCapability) {
  return nativeCapability?.capabilities?.selector?.inspect === true;
}

export const SUPPORT_REASON = {
  SAME_ORIGIN_ACCESS: 'same-origin-access',
  PROXY_ACTIVE: 'proxy-active',
  PROTOCOL_ACTIVE: 'protocol-active',
  PROTOCOL_PENDING: 'protocol-pending',
  PROXY_ESCAPED: 'proxy-escaped',
  CROSS_ORIGIN_NO_INSTRUMENTATION: 'cross-origin-no-instrumentation',
  HANDSHAKE_TIMEOUT: 'handshake-timeout',
};

const KNOWN_EMBED_RESTRICTED_HOSTS = [
  'duckduckgo.com',
  'www.duckduckgo.com',
  'google.com',
  'www.google.com',
  'bing.com',
  'www.bing.com',
];

export function parseUrlMeta(url) {
  const raw = String(url || '').trim();
  if (!raw) {
    return {
      raw,
      valid: false,
      reason: 'empty-url',
    };
  }

  try {
    const parsed = new URL(raw, typeof window !== 'undefined' ? window.location.href : undefined);
    return {
      raw,
      valid: true,
      href: parsed.href,
      origin: parsed.origin,
      hostname: parsed.hostname,
      port: parsed.port,
      protocol: parsed.protocol,
      pathname: parsed.pathname,
    };
  } catch (error) {
    return {
      raw,
      valid: false,
      reason: 'url-parse-failed',
      message: error?.message || 'unknown parse error',
    };
  }
}

export function getHostnameLabel(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'Custom target';
  }
}

export function shouldWarnAboutFraming(url) {
  const meta = parseUrlMeta(url);
  if (!meta.valid) return false;
  if (!['http:', 'https:'].includes(meta.protocol)) return false;
  return KNOWN_EMBED_RESTRICTED_HOSTS.some((host) => meta.hostname === host);
}

export function shouldUsePreviewProxy(browserUrl) {
  const value = String(browserUrl || '').trim();
  if (!value) return false;
  if (value.startsWith('/api/preview-proxy?url=') || value.startsWith('/api/preview-proxy/?url='))
    return false;

  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const isLocalTarget = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname);
    if (!isLocalTarget) return false;

    if (typeof window !== 'undefined') {
      return parsed.origin !== window.location.origin;
    }

    return true;
  } catch {
    return false;
  }
}

export function resolvePreviewSrc(browserUrl, useProxyPreview) {
  const raw = String(browserUrl || '').trim();
  if (!raw) return raw;
  if (useProxyPreview && shouldUsePreviewProxy(raw)) {
    return `/api/preview-proxy/?url=${encodeURIComponent(raw)}`;
  }
  return raw;
}

export function getIframeContentWindow(iframe) {
  try {
    return iframe?.contentWindow || null;
  } catch {
    return null;
  }
}

export function canAccessIframeDom(iframe) {
  const targetWindow = getIframeContentWindow(iframe);
  let targetDocument = iframe?.contentDocument || null;

  if (!targetDocument && targetWindow) {
    try {
      targetDocument = targetWindow.document;
    } catch {
      return false;
    }
  }

  if (!targetWindow || !targetDocument?.addEventListener) {
    return false;
  }

  try {
    void targetDocument.body;
    return true;
  } catch {
    return false;
  }
}

export function safeHasVisualEditProtocol(targetWindow) {
  if (!targetWindow) return false;
  try {
    return Boolean(targetWindow.__DEVHUB_VISUAL_EDIT_PROTOCOL__);
  } catch {
    return false;
  }
}

export function safeGetFrameHref(targetWindow) {
  if (!targetWindow) return '';
  try {
    const href = targetWindow.location?.href;
    return typeof href === 'string' ? href.trim() : '';
  } catch {
    return '';
  }
}

export function createSupportState(mode, reason, viaProxy = false) {
  return {
    mode,
    reason,
    viaProxy,
    checkedAt: Date.now(),
  };
}

export function isSameOriginBrowserUrl(browserUrl) {
  const meta = parseUrlMeta(browserUrl);
  if (!meta.valid || typeof window === 'undefined') return false;
  return meta.origin === window.location.origin;
}

export function getInitialSupportState(browserUrl, protocolVerified = false) {
  if (shouldUsePreviewProxy(browserUrl)) {
    return createSupportState(
      PREVIEW_SUPPORT_MODE.LOCALHOST_PROXY,
      SUPPORT_REASON.PROXY_ACTIVE,
      true
    );
  }

  if (protocolVerified) {
    return createSupportState(PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL, SUPPORT_REASON.PROTOCOL_ACTIVE);
  }

  if (isSameOriginBrowserUrl(browserUrl)) {
    return createSupportState(
      PREVIEW_SUPPORT_MODE.SAME_ORIGIN_DOM,
      SUPPORT_REASON.SAME_ORIGIN_ACCESS
    );
  }

  return createSupportState(
    PREVIEW_SUPPORT_MODE.UNSUPPORTED,
    SUPPORT_REASON.CROSS_ORIGIN_NO_INSTRUMENTATION
  );
}

export function classifyPreviewSupport({
  browserUrl,
  iframe,
  iframeSrc = '',
  protocolVerified = false,
} = {}) {
  const currentIframeSrc = String(iframeSrc || iframe?.getAttribute?.('src') || '');
  const isProxyExpected = shouldUsePreviewProxy(browserUrl);
  const isProxyFrame = currentIframeSrc.includes('/api/preview-proxy');

  if (isProxyExpected && !isProxyFrame && currentIframeSrc) {
    return createSupportState(PREVIEW_SUPPORT_MODE.UNSUPPORTED, SUPPORT_REASON.PROXY_ESCAPED);
  }

  if (isProxyExpected) {
    return createSupportState(
      PREVIEW_SUPPORT_MODE.LOCALHOST_PROXY,
      SUPPORT_REASON.PROXY_ACTIVE,
      true
    );
  }

  if (protocolVerified) {
    return createSupportState(PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL, SUPPORT_REASON.PROTOCOL_ACTIVE);
  }

  if (canAccessIframeDom(iframe)) {
    return createSupportState(
      PREVIEW_SUPPORT_MODE.SAME_ORIGIN_DOM,
      SUPPORT_REASON.SAME_ORIGIN_ACCESS
    );
  }

  if (safeHasVisualEditProtocol(getIframeContentWindow(iframe))) {
    return createSupportState(
      PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL,
      SUPPORT_REASON.PROTOCOL_PENDING
    );
  }

  return createSupportState(
    PREVIEW_SUPPORT_MODE.UNSUPPORTED,
    SUPPORT_REASON.CROSS_ORIGIN_NO_INSTRUMENTATION
  );
}

export function getUnsupportedCopy(reason) {
  switch (reason) {
    case SUPPORT_REASON.PROXY_ESCAPED:
      return 'This preview left the proxied localhost preview path, so DevHub stopped visual selection until it returns to the proxy-supported route.';
    case SUPPORT_REASON.HANDSHAKE_TIMEOUT:
      return 'This preview did not complete the visual-edit handshake in time, so DevHub disabled selection until the supported preview path responds again.';
    case SUPPORT_REASON.PROTOCOL_PENDING:
      return 'DevHub is waiting for the remote visual-edit protocol to confirm support.';
    case SUPPORT_REASON.CROSS_ORIGIN_NO_INSTRUMENTATION:
    default:
      return 'This preview did not respond to supported visual-edit activation. If it runs on another origin, DevHub needs preview instrumentation or same-origin access to inspect it. Supported paths today: same-origin previews, localhost previews through the DevHub proxy, or remote previews that load the visual-edit protocol.';
  }
}

export function normalizeBrowserRuntime(runtime) {
  return runtime === BROWSER_RUNTIME.NATIVE_GTK
    ? BROWSER_RUNTIME.NATIVE_GTK
    : BROWSER_RUNTIME.IFRAME;
}

function isElectronDesktopHost() {
  try {
    return typeof window !== 'undefined' && window.devhubDesktop?.isElectron === true;
  } catch {
    return false;
  }
}

export function resolveBrowserRuntimeSelection({
  requestedRuntime,
  editMode = false,
  nativeCapability = null,
} = {}) {
  // Electron: always request native WebContentsView unless caller forced iframe AND
  // we are not on Electron. On Electron, coerce request to native-gtk.
  const onElectron = isElectronDesktopHost();
  const normalizedRequestedRuntime = onElectron
    ? BROWSER_RUNTIME.NATIVE_GTK
    : normalizeBrowserRuntime(requestedRuntime);

  if (normalizedRequestedRuntime !== BROWSER_RUNTIME.NATIVE_GTK) {
    return {
      requestedRuntime: normalizedRequestedRuntime,
      effectiveRuntime: BROWSER_RUNTIME.IFRAME,
      fallbackReason: null,
    };
  }

  if (nativeCapability && nativeCapability.ready === false) {
    // On Electron, probe should not fail; if it does, still prefer native so we
    // do not stick on iframe while the host restarts registry.
    if (onElectron) {
      return {
        requestedRuntime: normalizedRequestedRuntime,
        effectiveRuntime: BROWSER_RUNTIME.NATIVE_GTK,
        fallbackReason: null,
      };
    }
    return {
      requestedRuntime: normalizedRequestedRuntime,
      effectiveRuntime: BROWSER_RUNTIME.IFRAME,
      fallbackReason: nativeCapability.reason || BROWSER_RUNTIME_FALLBACK_REASON.PROBE_FAILED,
    };
  }

  // Edit-mode selector still needs iframe on non-Electron (or when inspect missing).
  // On Electron, keep native browser for browsing; selector-deferred does not force iframe.
  if (editMode && !hasNativeSelectorInspectCapability(nativeCapability) && !onElectron) {
    return {
      requestedRuntime: normalizedRequestedRuntime,
      effectiveRuntime: BROWSER_RUNTIME.IFRAME,
      fallbackReason:
        nativeCapability?.reason || BROWSER_RUNTIME_FALLBACK_REASON.EDIT_MODE_REQUIRES_IFRAME,
    };
  }

  return {
    requestedRuntime: normalizedRequestedRuntime,
    effectiveRuntime: BROWSER_RUNTIME.NATIVE_GTK,
    fallbackReason: null,
  };
}

export function getBrowserRuntimeLabel(runtime) {
  if (normalizeBrowserRuntime(runtime) !== BROWSER_RUNTIME.NATIVE_GTK) {
    return 'iframe';
  }
  // Electron WebContentsView — short label. Tauri Linux still says "native gtk".
  try {
    if (typeof window !== 'undefined' && window.devhubDesktop?.isElectron === true) {
      return 'native';
    }
  } catch {
    /* ignore */
  }
  return 'native gtk';
}

export function getBrowserRuntimeFallbackCopy(reason) {
  switch (reason) {
    case BROWSER_RUNTIME_FALLBACK_REASON.EDIT_MODE_REQUIRES_IFRAME:
      return 'iframe fallback · edit mode';
    case BROWSER_RUNTIME_FALLBACK_REASON.SELECTOR_UNAVAILABLE:
      return 'iframe fallback · selector unavailable';
    case 'unsupported-platform':
      return 'iframe fallback · unsupported platform';
    case 'desktop-unavailable':
      return 'iframe fallback · desktop bridge missing';
    case 'tauri-unavailable':
      return 'iframe fallback · tauri unavailable';
    case 'missing-bounds':
      return 'iframe fallback · missing bounds';
    case 'open-failed':
      return 'iframe fallback · native open failed';
    case 'probe-failed':
    default:
      return reason ? `iframe fallback · ${reason}` : 'iframe fallback';
  }
}

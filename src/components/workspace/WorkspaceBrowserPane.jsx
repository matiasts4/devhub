'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Globe,
  MonitorUp,
  MousePointer2,
  Pencil,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Wand2,
} from 'lucide-react';
import { COMMAND_ACTION, MESSAGE_TYPE, MONITOR_ACTION } from '@emergentbase/visual-edits';
import { commitBrowserNavigation, moveBrowserHistory } from './browserHistory';
import {
  BRIDGE_AGENT_OPTIONS,
  buildBridgeAgentRequest,
  deriveElementDimensions,
  deriveSelectionLabel,
  deriveSourceHint,
} from './bridgeAgentRequest';

const UNSUPPORTED_TIMEOUT_MS = 3500;
const FALLBACK_RETRY_INTERVAL_MS = 250;
const FALLBACK_RETRY_ATTEMPTS = 20;
const VISUAL_EDIT_LOG_PREFIX = '[devhub][visual-edit]';

export const PREVIEW_SUPPORT_MODE = {
  SAME_ORIGIN_DOM: 'same-origin-dom',
  LOCALHOST_PROXY: 'localhost-proxy',
  REMOTE_PROTOCOL: 'remote-protocol',
  UNSUPPORTED: 'unsupported',
};

export const SELECTOR_STATE = {
  IDLE: 'idle',
  CHECKING: 'checking',
  CONNECTING: 'connecting',
  ARMED: 'armed',
  SELECTED: 'selected',
  UNSUPPORTED: 'unsupported',
};

export const SUPPORT_REASON = {
  SAME_ORIGIN_ACCESS: 'same-origin-access',
  PROXY_ACTIVE: 'proxy-active',
  PROTOCOL_ACTIVE: 'protocol-active',
  PROTOCOL_PENDING: 'protocol-pending',
  PROXY_ESCAPED: 'proxy-escaped',
  CROSS_ORIGIN_NO_INSTRUMENTATION: 'cross-origin-no-instrumentation',
  HANDSHAKE_TIMEOUT: 'handshake-timeout',
};

function visualEditLog(level, event, details = {}) {
  if (level === 'error') {
    console.error(`${VISUAL_EDIT_LOG_PREFIX} ${event}`, details);
    return;
  }
  console.warn(`${VISUAL_EDIT_LOG_PREFIX} ${event}`, details);
}

function parseUrlMeta(url) {
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

function getHostnameLabel(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'Custom target';
  }
}

function shouldWarnAboutFraming(url) {
  // Do not preemptively block localhost previews.
  // Let iframe load and runtime fallback decide actual capability.
  void url;
  return false;
}

function shouldUsePreviewProxy(browserUrl) {
  const value = String(browserUrl || '').trim();
  if (!value) return false;
  if (value.startsWith('/api/preview-proxy?url=') || value.startsWith('/api/preview-proxy/?url=')) return false;

  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // URL.hostname for IPv6 loopback is "::1" (without brackets).
    const isLocalTarget = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname);
    if (!isLocalTarget) return false;

    // If target is already same-origin, no proxy is needed.
    if (typeof window !== 'undefined') {
      return parsed.origin !== window.location.origin;
    }

    return true;
  } catch {
    return false;
  }
}

function resolvePreviewSrc(browserUrl, useProxyPreview) {
  const raw = String(browserUrl || '').trim();
  if (!raw) return raw;
  if (useProxyPreview && shouldUsePreviewProxy(raw)) {
    return `/api/preview-proxy/?url=${encodeURIComponent(raw)}`;
  }
  return raw;
}

function isSameOriginBrowserUrl(browserUrl) {
  const meta = parseUrlMeta(browserUrl);
  if (!meta.valid || typeof window === 'undefined') return false;
  return meta.origin === window.location.origin;
}

function canAccessIframeDom(iframe) {
  const targetWindow = iframe?.contentWindow;
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

function createSupportState(mode, reason, viaProxy = false) {
  return {
    mode,
    reason,
    viaProxy,
    checkedAt: Date.now(),
  };
}

function getInitialSupportState(browserUrl, protocolVerified = false) {
  if (shouldUsePreviewProxy(browserUrl)) {
    return createSupportState(PREVIEW_SUPPORT_MODE.LOCALHOST_PROXY, SUPPORT_REASON.PROXY_ACTIVE, true);
  }

  if (protocolVerified) {
    return createSupportState(PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL, SUPPORT_REASON.PROTOCOL_ACTIVE);
  }

  if (isSameOriginBrowserUrl(browserUrl)) {
    return createSupportState(PREVIEW_SUPPORT_MODE.SAME_ORIGIN_DOM, SUPPORT_REASON.SAME_ORIGIN_ACCESS);
  }

  return createSupportState(PREVIEW_SUPPORT_MODE.UNSUPPORTED, SUPPORT_REASON.CROSS_ORIGIN_NO_INSTRUMENTATION);
}

function getUnsupportedCopy(reason) {
  switch (reason) {
    case SUPPORT_REASON.PROXY_ESCAPED:
      return 'This preview left the proxied localhost preview path, so DevHub stopped visual selection until it returns to the proxy-supported route.';
    case SUPPORT_REASON.HANDSHAKE_TIMEOUT:
      return 'This preview did not complete the visual-edit handshake in time, so DevHub disabled selection until the supported preview path responds again.';
    case SUPPORT_REASON.PROTOCOL_PENDING:
      return 'DevHub is waiting for the remote visual-edit protocol to confirm support.';
    case SUPPORT_REASON.CROSS_ORIGIN_NO_INSTRUMENTATION:
    default:
      return 'This preview did not respond to supported visual-edit activation. If it runs on another origin, DevHub needs preview instrumentation or same-origin access to inspect it.';
  }
}

export default function WorkspaceBrowserPane({ dockState, onDockStateChange, forceEditMode = false }) {
  const [urlInput, setUrlInput] = useState(dockState.browserUrl || '');
  const [reloadKey, setReloadKey] = useState(0);
  const [isInspecting, setIsInspecting] = useState(false);
  const [useProxyPreview, setUseProxyPreview] = useState(() => (
    Boolean((dockState.editMode || forceEditMode) && shouldUsePreviewProxy(dockState.browserUrl))
  ));
  const [selectedElement, setSelectedElement] = useState(null);
  const [changeRequest, setChangeRequest] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('hermes');
  const [lastLaunchMeta, setLastLaunchMeta] = useState(null);
  const [selectorState, setSelectorState] = useState(SELECTOR_STATE.IDLE);
  const [supportState, setSupportState] = useState(() => getInitialSupportState(dockState.browserUrl));
  const urlInputRef = useRef(null);
  const iframeRef = useRef(null);
  const unsupportedTimerRef = useRef(null);
  const unsupportedAttemptsRef = useRef(0);
  const domInspectorCleanupRef = useRef(null);
  const hoveredElementRef = useRef(null);
  const selectedElementRef = useRef(null);
  const proxyPreviewRef = useRef(false);
  const proxyPreviewPendingLoadRef = useRef(false);
  const autoInspectOnEditModeRef = useRef(false);
  const protocolVerifiedRef = useRef(false);
  const supportStateRef = useRef(supportState);
  const selectorStateRef = useRef(selectorState);
  const canGoBack = dockState.browserHistoryIndex > 0;
  const canGoForward = dockState.browserHistoryIndex < (dockState.browserHistory?.length || 0) - 1;
  const iframeTitle = useMemo(() => `Workspace preview ${dockState.browserUrl || ''}`.trim(), [dockState.browserUrl]);
  const hostLabel = useMemo(() => getHostnameLabel(dockState.browserUrl), [dockState.browserUrl]);
  const shouldShowFrameWarning = useMemo(() => shouldWarnAboutFraming(dockState.browserUrl), [dockState.browserUrl]);
  const iframeSrc = useMemo(
    () => resolvePreviewSrc(dockState.browserUrl, useProxyPreview),
    [dockState.browserUrl, useProxyPreview]
  );
  const selectedSummary = useMemo(() => (selectedElement ? deriveSelectionLabel(selectedElement) : null), [selectedElement]);
  const sourceHint = useMemo(() => deriveSourceHint(selectedElement), [selectedElement]);
  const dimensions = useMemo(() => deriveElementDimensions(selectedElement), [selectedElement]);
  const activeAgent = BRIDGE_AGENT_OPTIONS.find((agent) => agent.id === selectedAgent) || BRIDGE_AGENT_OPTIONS[0];
  const canSubmit = Boolean(selectedElement && String(changeRequest || '').trim() && activeAgent?.enabled);
  const effectiveEditMode = Boolean(dockState.editMode || forceEditMode);

  function commitObservedState({
    selector,
    support,
    reason,
    clearSelection = false,
    detachInspector: shouldDetachInspector = false,
    clearTimer = false,
    inspecting,
  }) {
    const nextSupport = support || supportStateRef.current;
    const nextSelector = selector ?? selectorStateRef.current;
    const resolvedReason = reason || nextSupport?.reason || null;
    const fallbackInspecting = [SELECTOR_STATE.ARMED, SELECTOR_STATE.SELECTED, SELECTOR_STATE.CONNECTING, SELECTOR_STATE.CHECKING].includes(nextSelector);

    if (
      selectorStateRef.current !== nextSelector
      || supportStateRef.current?.mode !== nextSupport?.mode
      || supportStateRef.current?.reason !== nextSupport?.reason
    ) {
      visualEditLog('info', 'selector-state-transition', {
        from: selectorStateRef.current,
        to: nextSelector,
        supportMode: nextSupport?.mode || null,
        reason: resolvedReason,
        browserUrl: parseUrlMeta(dockState.browserUrl),
        iframeSrc: parseUrlMeta(iframeRef.current?.getAttribute('src') || iframeSrc),
      });
    }

    if (clearTimer) {
      clearUnsupportedTimer();
    }
    if (shouldDetachInspector) {
      detachDomInspector();
    }
    if (clearSelection) {
      selectedElementRef.current = null;
      setSelectedElement(null);
    }

    supportStateRef.current = nextSupport;
    selectorStateRef.current = nextSelector;
    setSupportState(nextSupport);
    setSelectorState(nextSelector);

    setIsInspecting(typeof inspecting === 'boolean' ? inspecting : fallbackInspecting);
  }

  function updateSupportClassification(nextSupport, nextSelector = selectorStateRef.current, options = {}) {
    commitObservedState({
      selector: nextSelector,
      support: nextSupport,
      reason: nextSupport.reason,
      ...options,
    });
  }

  function syncObservedBrowserUrl(nextUrl) {
    const normalizedUrl = typeof nextUrl === 'string' ? nextUrl.trim() : '';
    if (!normalizedUrl) return;

    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(() => {
        onDockStateChange((currentState) => {
          if (currentState?.browserUrl === normalizedUrl) {
            return currentState;
          }
          return commitBrowserNavigation(currentState, normalizedUrl);
        });
      }, 0);
      return;
    }

    onDockStateChange((currentState) => {
      if (currentState?.browserUrl === normalizedUrl) {
        return currentState;
      }
      return commitBrowserNavigation(currentState, normalizedUrl);
    });
  }

  function downgradeToUnsupported(reason, options = {}) {
    protocolVerifiedRef.current = false;
    updateSupportClassification(
      createSupportState(PREVIEW_SUPPORT_MODE.UNSUPPORTED, reason),
      SELECTOR_STATE.UNSUPPORTED,
      {
        clearSelection: true,
        detachInspector: true,
        clearTimer: true,
        inspecting: false,
        ...options,
      }
    );
  }

  function classifyCurrentPreview({ protocolVerified = protocolVerifiedRef.current, iframeOverride } = {}) {
    const currentIframeSrc = String(iframeOverride || iframeRef.current?.getAttribute('src') || iframeSrc || '');
    const isProxyExpected = shouldUsePreviewProxy(dockState.browserUrl);
    const isProxyFrame = currentIframeSrc.includes('/api/preview-proxy');

    if (isProxyExpected && !isProxyFrame && currentIframeSrc) {
      return createSupportState(PREVIEW_SUPPORT_MODE.UNSUPPORTED, SUPPORT_REASON.PROXY_ESCAPED);
    }

    if (isProxyExpected) {
      return createSupportState(PREVIEW_SUPPORT_MODE.LOCALHOST_PROXY, SUPPORT_REASON.PROXY_ACTIVE, true);
    }

    if (protocolVerified) {
      return createSupportState(PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL, SUPPORT_REASON.PROTOCOL_ACTIVE);
    }

    if (canAccessIframeDom(iframeRef.current)) {
      return createSupportState(PREVIEW_SUPPORT_MODE.SAME_ORIGIN_DOM, SUPPORT_REASON.SAME_ORIGIN_ACCESS);
    }

    if (iframeRef.current?.contentWindow?.__DEVHUB_VISUAL_EDIT_PROTOCOL__) {
      return createSupportState(PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL, SUPPORT_REASON.PROTOCOL_PENDING);
    }

    return createSupportState(PREVIEW_SUPPORT_MODE.UNSUPPORTED, SUPPORT_REASON.CROSS_ORIGIN_NO_INSTRUMENTATION);
  }

  useEffect(() => {
    visualEditLog('debug', 'iframe-source-updated', {
      browserUrl: parseUrlMeta(dockState.browserUrl),
      iframeSrc: parseUrlMeta(iframeSrc),
      editMode: effectiveEditMode,
      useProxyPreview,
      shouldProxy: shouldUsePreviewProxy(dockState.browserUrl),
    });
  }, [dockState.browserUrl, effectiveEditMode, iframeSrc, useProxyPreview]);

  useEffect(() => {
    setUrlInput(dockState.browserUrl || '');
  }, [dockState.browserUrl]);

  useEffect(() => {
    supportStateRef.current = supportState;
  }, [supportState]);

  useEffect(() => {
    selectorStateRef.current = selectorState;
  }, [selectorState]);

  useEffect(() => {
    if (!effectiveEditMode) {
      protocolVerifiedRef.current = false;
      proxyPreviewRef.current = false;
      proxyPreviewPendingLoadRef.current = false;
      setUseProxyPreview(false);
      commitObservedState({
        selector: SELECTOR_STATE.IDLE,
        support: getInitialSupportState(dockState.browserUrl),
        clearSelection: true,
        detachInspector: true,
        clearTimer: true,
        inspecting: false,
      });
      return;
    }

    const shouldPrimeProxyPreview = shouldUsePreviewProxy(dockState.browserUrl);
    proxyPreviewRef.current = shouldPrimeProxyPreview;
    proxyPreviewPendingLoadRef.current = shouldPrimeProxyPreview;
    setUseProxyPreview(shouldPrimeProxyPreview);
    const preserveInspectingState = isInspecting && supportStateRef.current?.mode !== PREVIEW_SUPPORT_MODE.UNSUPPORTED;
    if (preserveInspectingState) {
      updateSupportClassification(
        createSupportState(
          supportStateRef.current.mode,
          supportStateRef.current.reason,
          supportStateRef.current.viaProxy,
        ),
        selectedElement ? SELECTOR_STATE.SELECTED : selectorStateRef.current,
        {
          clearTimer: true,
        }
      );
      return;
    }

    protocolVerifiedRef.current = false;
    updateSupportClassification(getInitialSupportState(dockState.browserUrl), selectedElement ? SELECTOR_STATE.SELECTED : SELECTOR_STATE.IDLE, {
      clearTimer: true,
    });
  }, [dockState.browserUrl, effectiveEditMode]);

  useEffect(() => {
    if (!effectiveEditMode || !isInspecting || !shouldUsePreviewProxy(dockState.browserUrl)) {
      return;
    }

    proxyPreviewRef.current = true;
    proxyPreviewPendingLoadRef.current = true;
    setUseProxyPreview(true);
  }, [dockState.browserUrl, effectiveEditMode, isInspecting]);

  useEffect(() => {
    if (forceEditMode) {
      autoInspectOnEditModeRef.current = true;
    }
  }, [forceEditMode]);

  useEffect(() => {
    proxyPreviewRef.current = useProxyPreview;
    proxyPreviewPendingLoadRef.current = useProxyPreview;
  }, [useProxyPreview]);

  useEffect(() => () => {
    clearUnsupportedTimer();
    detachDomInspector();
    restoreElementOutline(hoveredElementRef.current);
    restoreElementOutline(selectedElementRef.current);
  }, []);

  function clearUnsupportedTimer() {
    if (unsupportedTimerRef.current) {
      if (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
        window.clearTimeout(unsupportedTimerRef.current);
      } else {
        clearTimeout(unsupportedTimerRef.current);
      }
      unsupportedTimerRef.current = null;
    }
    unsupportedAttemptsRef.current = 0;
  }

  function buildStatusLabel(status) {
    switch (status) {
      case 'connecting':
        return 'Preparing editable preview';
      case 'armed':
        return 'Select an element';
      case 'selected':
        return 'Element selected';
      case 'unsupported':
        return 'Preview not editable';
      default:
        return 'Edit ready';
    }
  }

  function scheduleUnsupportedState() {
    if (![PREVIEW_SUPPORT_MODE.LOCALHOST_PROXY, PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL].includes(supportStateRef.current.mode)) {
      downgradeToUnsupported(supportStateRef.current.reason || SUPPORT_REASON.CROSS_ORIGIN_NO_INSTRUMENTATION);
      return;
    }

    visualEditLog('debug', 'handshake-timeout-scheduled', {
      browserUrl: parseUrlMeta(dockState.browserUrl),
      initialDelay: supportStateRef.current.mode === PREVIEW_SUPPORT_MODE.LOCALHOST_PROXY ? 0 : UNSUPPORTED_TIMEOUT_MS,
      retryIntervalMs: FALLBACK_RETRY_INTERVAL_MS,
      retryAttemptsMax: FALLBACK_RETRY_ATTEMPTS,
      proxyPreviewActive: proxyPreviewRef.current,
    });
    clearUnsupportedTimer();
    const initialDelay = supportStateRef.current.mode === PREVIEW_SUPPORT_MODE.LOCALHOST_PROXY
      ? 0
      : UNSUPPORTED_TIMEOUT_MS;

    const attemptFallback = () => {
      if (attachSameOriginDomInspector()) {
        visualEditLog('info', 'fallback-same-origin-attached', {
          reason: 'protocol-timeout-or-precheck',
          browserUrl: parseUrlMeta(dockState.browserUrl),
        });
        clearUnsupportedTimer();
        updateSupportClassification(
          createSupportState(PREVIEW_SUPPORT_MODE.SAME_ORIGIN_DOM, SUPPORT_REASON.SAME_ORIGIN_ACCESS),
          SELECTOR_STATE.ARMED,
          { clearTimer: true, inspecting: true }
        );
        return;
      }

      if (!proxyPreviewRef.current && shouldUsePreviewProxy(dockState.browserUrl)) {
        visualEditLog('info', 'fallback-switch-to-preview-proxy', {
          browserUrl: parseUrlMeta(dockState.browserUrl),
        });
        proxyPreviewRef.current = true;
        proxyPreviewPendingLoadRef.current = true;
        setUseProxyPreview(true);
        unsupportedTimerRef.current = window.setTimeout(attemptFallback, FALLBACK_RETRY_INTERVAL_MS);
        return;
      }

      if (proxyPreviewRef.current && proxyPreviewPendingLoadRef.current) {
        unsupportedTimerRef.current = window.setTimeout(attemptFallback, FALLBACK_RETRY_INTERVAL_MS);
        return;
      }

      unsupportedAttemptsRef.current += 1;
      visualEditLog('debug', 'handshake-timeout-attempt', {
        attempt: unsupportedAttemptsRef.current,
        maxAttempts: FALLBACK_RETRY_ATTEMPTS,
        proxyPreviewActive: proxyPreviewRef.current,
        proxyPreviewPendingLoad: proxyPreviewPendingLoadRef.current,
      });
      if (unsupportedAttemptsRef.current >= FALLBACK_RETRY_ATTEMPTS) {
        unsupportedTimerRef.current = null;
        visualEditLog('warn', 'handshake-failed', {
          reason: SUPPORT_REASON.HANDSHAKE_TIMEOUT,
          browserUrl: parseUrlMeta(dockState.browserUrl),
          useProxyPreview: proxyPreviewRef.current,
        });
        downgradeToUnsupported(SUPPORT_REASON.HANDSHAKE_TIMEOUT);
        return;
      }

      unsupportedTimerRef.current = window.setTimeout(attemptFallback, FALLBACK_RETRY_INTERVAL_MS);
    };

    unsupportedTimerRef.current = window.setTimeout(attemptFallback, initialDelay);
  }

  function postBridgeCommand(action, data) {
    const targetWindow = iframeRef.current?.contentWindow;
    const payload = { type: MESSAGE_TYPE.DEBUG_COMMAND, action, data };
    if (!targetWindow) {
      visualEditLog('warn', 'postmessage-skipped', {
        reason: 'missing-iframe-content-window',
        action,
        messageType: payload.type,
        browserUrl: parseUrlMeta(dockState.browserUrl),
        iframeSrc: parseUrlMeta(iframeRef.current?.getAttribute('src') || ''),
      });
      return false;
    }

    visualEditLog('debug', 'postmessage-send', {
      action,
      messageType: payload.type,
      targetOrigin: '*',
      browserUrl: parseUrlMeta(dockState.browserUrl),
      iframeSrc: parseUrlMeta(iframeRef.current?.getAttribute('src') || ''),
    });
    targetWindow.postMessage(payload, '*');
    return true;
  }

  function restoreElementOutline(element) {
    if (!element || !element.dataset) return;
    if (typeof element.dataset.devhubOriginalOutline !== 'undefined') {
      element.style.outline = element.dataset.devhubOriginalOutline;
      delete element.dataset.devhubOriginalOutline;
    } else {
      element.style.outline = '';
    }
    element.style.boxShadow = '';
  }

  function applyElementOutline(element, outline) {
    if (!element || !element.style || !element.dataset) return;
    if (typeof element.dataset.devhubOriginalOutline === 'undefined') {
      element.dataset.devhubOriginalOutline = element.style.outline || '';
    }
    element.style.outline = outline;
  }

  function detachDomInspector() {
    if (typeof domInspectorCleanupRef.current === 'function') {
      domInspectorCleanupRef.current();
    }
    domInspectorCleanupRef.current = null;
    restoreElementOutline(hoveredElementRef.current);
    restoreElementOutline(selectedElementRef.current);
    hoveredElementRef.current = null;
    selectedElementRef.current = null;
  }

  function buildFallbackElementInfo(element) {
    const rect = element?.getBoundingClientRect?.() || {};
    const attributes = {};
    for (const attrName of ['x-file-name', 'x-line-number', 'data-source-file', 'data-component']) {
      const attrValue = element?.getAttribute?.(attrName);
      if (attrValue) attributes[attrName] = attrValue;
    }

    return {
      tagName: element?.tagName || 'div',
      className: element?.className || '',
      rect: {
        width: Number(rect.width) || 0,
        height: Number(rect.height) || 0,
        x: Number(rect.x) || 0,
        y: Number(rect.y) || 0,
      },
      attributes,
    };
  }

  function attachSameOriginDomInspector() {
    const iframe = iframeRef.current;
    const targetWindow = iframe?.contentWindow;
    let targetDocument = iframe?.contentDocument || null;

    if (!targetDocument && targetWindow) {
      try {
        targetDocument = targetWindow.document;
      } catch (err) {
        // contentDocument was null AND contentWindow.document threw — cross-origin navigation detected
        visualEditLog('warn', 'same-origin-inspector-unavailable', {
          reason: 'cross-origin-frame-after-navigation',
          message: err?.message || 'unknown',
          iframeSrc: iframe?.getAttribute('src') || '',
          browserUrl: parseUrlMeta(dockState.browserUrl),
        });
        return false;
      }
    }

    if (!targetDocument && !targetWindow) {
      visualEditLog('warn', 'same-origin-inspector-unavailable', {
        reason: 'no-iframe-ref-or-window',
        hasIframe: !!iframe,
        browserUrl: parseUrlMeta(dockState.browserUrl),
      });
      return false;
    }

    if (!targetWindow || !targetDocument?.addEventListener) {
      visualEditLog('warn', 'same-origin-inspector-unavailable', {
        reason: 'missing-window-or-document',
        hasContentDocument: !!targetDocument,
        contentDocumentIsNull: iframe?.contentDocument === null,
        iframeSrc: iframe?.getAttribute('src') || '',
        browserUrl: parseUrlMeta(dockState.browserUrl),
      });
      return false;
    }

    try {
      void targetDocument.body;
    } catch {
      visualEditLog('debug', 'same-origin-inspector-unavailable', {
        reason: 'cross-origin-document-access-denied',
        browserUrl: parseUrlMeta(dockState.browserUrl),
      });
      return false;
    }

    const handleMouseOver = (event) => {
      // Keep browser-like behavior: once an element is clicked, hover should no longer mutate the selected target.
      if (selectedElementRef.current) return;
      const nextElement = event.target instanceof targetWindow.HTMLElement ? event.target : null;
      if (!nextElement) return;
      if (hoveredElementRef.current && hoveredElementRef.current !== selectedElementRef.current) {
        restoreElementOutline(hoveredElementRef.current);
      }
      hoveredElementRef.current = nextElement;
      if (nextElement !== selectedElementRef.current) {
        applyElementOutline(nextElement, '2px solid rgba(88, 166, 255, 0.95)');
        nextElement.style.boxShadow = 'inset 0 0 0 1px rgba(88, 166, 255, 0.35)';
      }

      commitObservedState({ selector: SELECTOR_STATE.ARMED, inspecting: true });
    };

    const handleClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextElement = event.target instanceof targetWindow.HTMLElement ? event.target : null;
      if (!nextElement) return;

      if (selectedElementRef.current && selectedElementRef.current !== nextElement) {
        restoreElementOutline(selectedElementRef.current);
        selectedElementRef.current.style.boxShadow = '';
      }

      selectedElementRef.current = nextElement;
      applyElementOutline(nextElement, '2px solid rgba(34, 197, 94, 0.95)');
      nextElement.style.boxShadow = 'inset 0 0 0 1px rgba(34, 197, 94, 0.45)';
      setSelectedElement(buildFallbackElementInfo(nextElement));
      commitObservedState({ selector: SELECTOR_STATE.SELECTED, inspecting: true });
    };

    const handleMouseOut = (event) => {
      const leavingElement = event.target instanceof targetWindow.HTMLElement ? event.target : null;
      if (!leavingElement) return;
      if (leavingElement !== selectedElementRef.current) {
        restoreElementOutline(leavingElement);
        leavingElement.style.boxShadow = '';
      }
      if (hoveredElementRef.current === leavingElement) {
        hoveredElementRef.current = null;
      }
    };

    targetDocument.addEventListener('mouseover', handleMouseOver, true);
    targetDocument.addEventListener('mouseout', handleMouseOut, true);
    targetDocument.addEventListener('click', handleClick, true);
    visualEditLog('info', 'same-origin-inspector-attached', {
      browserUrl: parseUrlMeta(dockState.browserUrl),
    });
    domInspectorCleanupRef.current = () => {
      targetDocument.removeEventListener('mouseover', handleMouseOver, true);
      targetDocument.removeEventListener('mouseout', handleMouseOut, true);
      targetDocument.removeEventListener('click', handleClick, true);
      visualEditLog('debug', 'same-origin-inspector-detached', {
        browserUrl: parseUrlMeta(dockState.browserUrl),
      });
    };
    return true;
  }

  useEffect(() => {
    function handleMessage(event) {
      const targetWindow = iframeRef.current?.contentWindow;
      if (!targetWindow || event.source !== targetWindow) return;
      const data = event.data || {};
      visualEditLog('debug', 'postmessage-received', {
        origin: event.origin || 'unknown',
        messageType: data.type,
        action: data.action,
        browserUrl: parseUrlMeta(dockState.browserUrl),
      });
      if (data.type !== MESSAGE_TYPE.SITE_DEBUG) return;

      if ([MONITOR_ACTION.MODE_ACTIVATED, MONITOR_ACTION.ELEMENT_SELECTED, MONITOR_ACTION.INTERACTION_MODE_CHANGED].includes(data.action)) {
        clearUnsupportedTimer();
      }

      switch (data.action) {
        case MONITOR_ACTION.MODE_ACTIVATED:
          visualEditLog('info', 'handshake-mode-activated', {
            origin: event.origin || 'unknown',
            action: data.action,
          });
          protocolVerifiedRef.current = true;
          updateSupportClassification(
            createSupportState(PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL, SUPPORT_REASON.PROTOCOL_ACTIVE),
            SELECTOR_STATE.ARMED,
            { clearTimer: true, inspecting: true }
          );
          if (typeof event?.source?.location?.href === 'string' && event.source.location.href.trim()) {
            syncObservedBrowserUrl(event.source.location.href);
          }
          break;
        case MONITOR_ACTION.MODE_DEACTIVATED:
          visualEditLog('info', 'handshake-mode-deactivated', {
            origin: event.origin || 'unknown',
            action: data.action,
          });
          commitObservedState({
            selector: selectedElement ? SELECTOR_STATE.SELECTED : SELECTOR_STATE.IDLE,
            inspecting: false,
          });
          break;
        case MONITOR_ACTION.ELEMENT_SELECTED:
          visualEditLog('info', 'selector-element-selected', {
            origin: event.origin || 'unknown',
            element: data.elementInfo || data.element || null,
          });
          protocolVerifiedRef.current = true;
          setSelectedElement(data.elementInfo || data.element || null);
          updateSupportClassification(
            createSupportState(PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL, SUPPORT_REASON.PROTOCOL_ACTIVE),
            SELECTOR_STATE.SELECTED,
            { clearTimer: true, inspecting: true }
          );
          break;
        case MONITOR_ACTION.ELEMENT_DESELECTED:
          visualEditLog('debug', 'selector-element-deselected', {
            origin: event.origin || 'unknown',
          });
          setSelectedElement(null);
          commitObservedState({ selector: SELECTOR_STATE.ARMED, inspecting: true });
          break;
        case MONITOR_ACTION.CHANGES_ERROR: {
          visualEditLog('warn', 'handshake-error-event', {
            origin: event.origin || 'unknown',
            data,
          });
          // Some previews emit protocol errors before they are fully ready.
          // Retry same-origin fallback first to avoid false unsupported states.
          const hasFallback = attachSameOriginDomInspector();
          if (hasFallback) {
            updateSupportClassification(
              createSupportState(PREVIEW_SUPPORT_MODE.SAME_ORIGIN_DOM, SUPPORT_REASON.SAME_ORIGIN_ACCESS),
              SELECTOR_STATE.ARMED,
              { clearTimer: true, inspecting: true }
            );
          } else if (isInspecting) {
            commitObservedState({ selector: SELECTOR_STATE.CONNECTING, inspecting: true });
            scheduleUnsupportedState();
          } else {
            commitObservedState({ selector: SELECTOR_STATE.IDLE, inspecting: false });
          }
          break;
        }
        default:
          break;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isInspecting, selectedElement]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const submittedUrl = String(urlInputRef.current?.value || urlInput || '').trim();
    const shouldPrimeProxyPreview = Boolean(effectiveEditMode && shouldUsePreviewProxy(submittedUrl));
    onDockStateChange((currentState) => commitBrowserNavigation(currentState, submittedUrl));
    setReloadKey((value) => value + 1);
    protocolVerifiedRef.current = false;
    proxyPreviewRef.current = shouldPrimeProxyPreview;
    proxyPreviewPendingLoadRef.current = shouldPrimeProxyPreview;
    setUseProxyPreview(shouldPrimeProxyPreview);
    commitObservedState({
      selector: SELECTOR_STATE.IDLE,
      support: getInitialSupportState(submittedUrl),
      clearSelection: true,
      detachInspector: true,
      clearTimer: true,
      inspecting: false,
    });
  };

  const handleEditModeToggle = () => {
    const nextEditMode = !dockState.editMode;
    const shouldPrimeProxyPreview = Boolean(nextEditMode && shouldUsePreviewProxy(dockState.browserUrl));
    visualEditLog('info', 'edit-mode-toggle', {
      nextEditMode,
      browserUrl: parseUrlMeta(dockState.browserUrl),
    });

    if (nextEditMode) {
      autoInspectOnEditModeRef.current = true;
      proxyPreviewRef.current = shouldPrimeProxyPreview;
      proxyPreviewPendingLoadRef.current = shouldPrimeProxyPreview;
      setUseProxyPreview(shouldPrimeProxyPreview);
    }

    onDockStateChange((currentState) => ({
      ...currentState,
      activeTab: 'browser',
      visible: true,
      editMode: !currentState.editMode,
    }));

    if (dockState.editMode) {
      autoInspectOnEditModeRef.current = false;
      protocolVerifiedRef.current = false;
      proxyPreviewRef.current = false;
      proxyPreviewPendingLoadRef.current = false;
      setUseProxyPreview(false);
      commitObservedState({
        selector: SELECTOR_STATE.IDLE,
        support: getInitialSupportState(dockState.browserUrl),
        clearSelection: true,
        detachInspector: true,
        clearTimer: true,
        inspecting: false,
      });
    }
  };

  const handleInspectToggle = () => {
    if (shouldShowFrameWarning) {
      visualEditLog('warn', 'selector-activation-blocked', {
        reason: 'frame-warning-active',
        browserUrl: parseUrlMeta(dockState.browserUrl),
      });
      downgradeToUnsupported(SUPPORT_REASON.CROSS_ORIGIN_NO_INSTRUMENTATION);
      return;
    }

    const shouldKeepProxyPreview = shouldUsePreviewProxy(dockState.browserUrl);

    if (isInspecting) {
      visualEditLog('info', 'selector-deactivation-requested', {
        browserUrl: parseUrlMeta(dockState.browserUrl),
      });
      clearUnsupportedTimer();
      detachDomInspector();
      postBridgeCommand(COMMAND_ACTION.CLEAR_SELECTION, {});
      postBridgeCommand(COMMAND_ACTION.DEACTIVATE, {});
      proxyPreviewRef.current = shouldKeepProxyPreview;
      proxyPreviewPendingLoadRef.current = false;
      setUseProxyPreview(shouldKeepProxyPreview);
      protocolVerifiedRef.current = false;
      commitObservedState({
        selector: SELECTOR_STATE.IDLE,
        support: getInitialSupportState(dockState.browserUrl),
        clearSelection: true,
        detachInspector: true,
        clearTimer: true,
        inspecting: false,
      });
      return;
    }

    visualEditLog('info', 'selector-activation-requested', {
      browserUrl: parseUrlMeta(dockState.browserUrl),
      shouldUsePreviewProxy: shouldKeepProxyPreview,
      iframeSrc: parseUrlMeta(iframeSrc),
    });

    const wasAutoStarting = autoInspectOnEditModeRef.current;

    setLastLaunchMeta(null);
    selectedElementRef.current = null;
    setSelectedElement(null);
    detachDomInspector();

    const classifiedSupport = classifyCurrentPreview({ protocolVerified: false });
    updateSupportClassification(classifiedSupport, SELECTOR_STATE.CHECKING, {
      clearTimer: true,
      detachInspector: classifiedSupport.mode !== PREVIEW_SUPPORT_MODE.SAME_ORIGIN_DOM,
      inspecting: false,
    });

    if (classifiedSupport.mode === PREVIEW_SUPPORT_MODE.UNSUPPORTED) {
      downgradeToUnsupported(classifiedSupport.reason);
      return;
    }

    const shouldSkipActivationMessage = wasAutoStarting && classifiedSupport.mode === PREVIEW_SUPPORT_MODE.SAME_ORIGIN_DOM;

    if (shouldKeepProxyPreview) {
      proxyPreviewRef.current = true;
      if (!useProxyPreview) {
        proxyPreviewPendingLoadRef.current = true;
        setUseProxyPreview(true);
      }
    } else {
      proxyPreviewRef.current = false;
      proxyPreviewPendingLoadRef.current = false;
      setUseProxyPreview(false);
    }

    const hasSameOriginFallback = classifiedSupport.mode === PREVIEW_SUPPORT_MODE.SAME_ORIGIN_DOM;
    if (hasSameOriginFallback) {
      attachSameOriginDomInspector();
    }
    const activated = shouldSkipActivationMessage ? false : postBridgeCommand(COMMAND_ACTION.ACTIVATE, {});
    if (!shouldSkipActivationMessage && classifiedSupport.mode !== PREVIEW_SUPPORT_MODE.UNSUPPORTED) {
      postBridgeCommand(COMMAND_ACTION.SET_INTERACTION_MODE, { mode: 'select' });
    }

    visualEditLog('debug', 'selector-activation-result', {
      hasSameOriginFallback,
      activated,
      autoStart: wasAutoStarting,
      browserUrl: parseUrlMeta(dockState.browserUrl),
      iframeSrc: parseUrlMeta(iframeRef.current?.getAttribute('src') || iframeSrc),
    });

    if (hasSameOriginFallback) {
      updateSupportClassification(classifiedSupport, SELECTOR_STATE.ARMED, {
        clearTimer: true,
        inspecting: true,
      });
      return;
    }

    if (!activated) {
      visualEditLog('warn', 'selector-activation-failed', {
        reason: 'postmessage-activate-failed',
        browserUrl: parseUrlMeta(dockState.browserUrl),
        iframeSrc: parseUrlMeta(iframeRef.current?.getAttribute('src') || iframeSrc),
      });
      downgradeToUnsupported(SUPPORT_REASON.CROSS_ORIGIN_NO_INSTRUMENTATION);
      return;
    }

    updateSupportClassification(classifiedSupport, SELECTOR_STATE.CONNECTING, { inspecting: true });
    scheduleUnsupportedState();
  };

  useEffect(() => {
    if (!effectiveEditMode || isInspecting || !autoInspectOnEditModeRef.current) {
      return;
    }

    autoInspectOnEditModeRef.current = false;
    handleInspectToggle();
  }, [effectiveEditMode, isInspecting]);

  const handleLaunch = () => {
    if (!canSubmit) return;
    const request = buildBridgeAgentRequest({
      browserUrl: dockState.browserUrl,
      selectedElement,
      changeRequest,
      agentId: selectedAgent,
    });

    window.dispatchEvent(new window.CustomEvent('devhub:run-agent', { detail: request }));
    setLastLaunchMeta({ taskId: request.taskId, selectedAgent: request.selectedAgent });
  };

  const handleOpenDedicatedBrowser = async () => {
    const targetUrl = String(dockState.browserUrl || '').trim();
    if (!targetUrl) return;

    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const browserWindow = new WebviewWindow(`devhub-browser-${Date.now()}`, {
        url: targetUrl,
        title: `DevHub Browser — ${hostLabel}`,
        center: true,
        focus: true,
        resizable: true,
        width: Math.max(window.innerWidth - 80, 1180),
        height: Math.max(window.innerHeight - 80, 760),
        minWidth: 960,
        minHeight: 640,
        maximized: true,
      });

      browserWindow.once('tauri://error', () => {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      });
    } catch {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-[linear-gradient(180deg,#09111b_0%,#060b12_100%)]" data-testid="workspace-browser-pane">
      <form
        className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-3 bg-[#07111c]"
        onSubmit={handleSubmit}
        data-testid="workspace-browser-toolbar"
      >
        <div className="inline-flex items-center gap-1 shrink-0">
          <button
            type="button"
            data-testid="browser-back"
            onClick={() => onDockStateChange((currentState) => moveBrowserHistory(currentState, -1))}
            disabled={!canGoBack}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-white/[0.05] disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            data-testid="browser-forward"
            onClick={() => onDockStateChange((currentState) => moveBrowserHistory(currentState, 1))}
            disabled={!canGoForward}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-white/[0.05] disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="Forward"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            data-testid="browser-reload"
            onClick={() => setReloadKey((value) => value + 1)}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-white/[0.05]"
            aria-label="Reload"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <label className="flex-1 min-w-0 relative">
          <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            data-testid="browser-url-input"
            ref={urlInputRef}
            type="text"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            placeholder="Escribí una URL, localhost:3200 o una búsqueda"
            className="w-full h-10 pl-9 pr-36 rounded-xl border border-[var(--border-subtle)] bg-[#08101d] text-[13px] text-[var(--text-primary)] outline-none transition-colors focus:border-[rgba(var(--accent-rgb,88,166,255),0.35)] focus:bg-[#091325]"
          />
          <div className="absolute inset-y-0 right-1 flex items-center gap-1">
            <button
              type="button"
              data-testid="browser-edit-toggle"
              onClick={handleEditModeToggle}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                effectiveEditMode
                  ? 'bg-[rgba(var(--accent-rgb,88,166,255),0.18)] text-[var(--accent-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]'
              }`}
              aria-label={effectiveEditMode ? 'Close edit mode' : 'Open edit mode'}
              title={effectiveEditMode ? 'Close edit mode' : 'Open edit mode'}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {dockState.browserUrl ? (
              <button
                type="button"
                data-testid="browser-open-dedicated"
                onClick={handleOpenDedicatedBrowser}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                aria-label={`Open ${hostLabel} in DevHub browser window`}
                title={`Open ${hostLabel} in DevHub browser window`}
              >
                <MonitorUp className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {dockState.browserUrl ? (
              <a
                href={dockState.browserUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="browser-open-external"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                aria-label={`Open ${hostLabel} externally`}
                title={`Open ${hostLabel} externally`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
            <button
              type="submit"
              data-testid="browser-go"
              className="inline-flex items-center justify-center px-2.5 h-6 rounded-lg bg-[rgba(var(--accent-rgb,88,166,255),0.16)] text-[var(--accent-primary)] text-[11px] font-semibold border border-[rgba(var(--accent-rgb,88,166,255),0.24)] hover:bg-[rgba(var(--accent-rgb,88,166,255),0.22)]"
            >
              Go
            </button>
          </div>
        </label>
      </form>

      <div className="flex-1 min-h-0 bg-[#050814] p-3">
        <div
          className="relative h-full overflow-hidden rounded-[16px] border border-white/10 bg-[#0a111d] shadow-[0_18px_48px_rgba(3,7,18,0.28)]"
          data-testid="browser-viewport-shell"
          style={{
            contain: 'layout paint size',
            isolation: 'isolate',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
          }}
        >
          {shouldShowFrameWarning ? (
            <div
              className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center bg-[radial-gradient(circle_at_top,rgba(88,166,255,0.08),transparent_45%),#0a111d]"
              data-testid="browser-frame-warning"
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
                <TriangleAlert className="h-5 w-5" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Esta vista no se puede embeber</h3>
                <p className="text-sm leading-6 text-[var(--text-secondary)]" data-testid="browser-frame-warning-copy">
                  {hostLabel} responde, pero hoy devuelve X-Frame-Options: DENY. Por eso el iframe queda en blanco. Abrilo afuera o usá una app local que permita preview embebido.
                </p>
              </div>
              <a
                href={dockState.browserUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-[rgba(var(--accent-rgb,88,166,255),0.24)] bg-[rgba(var(--accent-rgb,88,166,255),0.14)] px-4 py-2 text-sm font-medium text-[var(--accent-primary)] hover:bg-[rgba(var(--accent-rgb,88,166,255),0.2)]"
              >
                Abrir {hostLabel} afuera
                <ExternalLink className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={handleOpenDedicatedBrowser}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/[0.08]"
              >
                Abrir en ventana completa
                <MonitorUp className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <iframe
                key={`${iframeSrc}-${reloadKey}`}
                data-testid="browser-iframe"
                title={iframeTitle}
                src={iframeSrc}
                ref={iframeRef}
                onLoad={() => {
                  const currentIframeSrc = String(iframeRef.current?.getAttribute('src') || '');
                  const isProxyFrame = currentIframeSrc.includes('/api/preview-proxy');
                  proxyPreviewPendingLoadRef.current = false;

                  visualEditLog('info', 'iframe-load', {
                    browserUrl: parseUrlMeta(dockState.browserUrl),
                    iframeSrc: parseUrlMeta(currentIframeSrc),
                    isProxyFrame,
                    editMode: effectiveEditMode,
                    isInspecting,
                  });

                  // Keep Browser history aligned with same-origin in-frame navigation
                  // so Back/Forward works after client-side route changes.
                  try {
                    const loadedUrl = String(iframeRef.current?.contentWindow?.location?.href || '').trim();
                    if (loadedUrl && !isProxyFrame) {
                      visualEditLog('debug', 'iframe-navigation-detected', {
                        loadedUrl: parseUrlMeta(loadedUrl),
                        browserUrl: parseUrlMeta(dockState.browserUrl),
                      });
                      syncObservedBrowserUrl(loadedUrl);
                    }
                  } catch (error) {
                    // Cross-origin frames cannot expose location. Keep current URL as-is.
                    if (!isProxyFrame) {
                      visualEditLog('debug', 'iframe-navigation-unavailable', {
                        reason: 'cross-origin-location-access-denied',
                        message: error?.message || 'unknown error',
                        browserUrl: parseUrlMeta(dockState.browserUrl),
                        iframeSrc: parseUrlMeta(currentIframeSrc),
                      });
                    }
                  }

                  if (!effectiveEditMode) return;
                  // Reset counter on iframe load to give fresh attempt
                  unsupportedAttemptsRef.current = 0;
                  const nextSupport = classifyCurrentPreview({ iframeOverride: currentIframeSrc });

                  if (nextSupport.reason === SUPPORT_REASON.PROXY_ESCAPED) {
                    downgradeToUnsupported(SUPPORT_REASON.PROXY_ESCAPED);
                    return;
                  }

                  // Re-send ACTIVATE to the proxy overlay on every proxy frame load, regardless
                  // of isInspecting. The initial ACTIVATE may arrive before the overlay script is
                  // parsed, and src oscillations can produce multiple proxy loads where isInspecting
                  // is transiently false — so we must not gate this on isInspecting.
                  if (isProxyFrame) {
                    postBridgeCommand(COMMAND_ACTION.ACTIVATE, {});
                    postBridgeCommand(COMMAND_ACTION.SET_INTERACTION_MODE, { mode: 'select' });
                  }
                  if (nextSupport.mode === PREVIEW_SUPPORT_MODE.SAME_ORIGIN_DOM) {
                    updateSupportClassification(nextSupport, selectedElement ? SELECTOR_STATE.SELECTED : SELECTOR_STATE.ARMED, {
                      clearTimer: true,
                      inspecting: true,
                    });
                  } else if (isProxyFrame || nextSupport.mode === PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL) {
                    // Same-origin attach failed — wait for overlay protocol handshake.
                    updateSupportClassification(nextSupport, SELECTOR_STATE.CONNECTING, { inspecting: true });
                    scheduleUnsupportedState();
                  } else {
                    downgradeToUnsupported(nextSupport.reason);
                  }
                }}
                onError={() => {
                  visualEditLog('error', 'iframe-load-error', {
                    browserUrl: parseUrlMeta(dockState.browserUrl),
                    iframeSrc: parseUrlMeta(iframeRef.current?.getAttribute('src') || iframeSrc),
                    editMode: effectiveEditMode,
                    isInspecting,
                  });
                }}
                loading="eager"
                referrerPolicy="no-referrer"
                className="block w-full h-full border-0 bg-white"
                style={{
                  transform: 'translateZ(0)',
                  backfaceVisibility: 'hidden',
                }}
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
              />

              {effectiveEditMode ? (
                <>
                <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between">
                  <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[rgba(var(--accent-rgb,88,166,255),0.18)] bg-[#06101b]/95 px-3 py-1 text-[11px] text-[var(--text-secondary)] shadow-[0_10px_26px_rgba(0,0,0,0.28)]">
                    <Sparkles className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                    <span data-testid="bridge-status-badge">{buildStatusLabel(selectorState)}</span>
                  </div>
                  <div className="pointer-events-auto rounded-full border border-white/10 bg-[#06101b]/95 px-3 py-1 text-[11px] text-[var(--text-muted)] shadow-[0_10px_26px_rgba(0,0,0,0.28)]">
                    visual edit mode
                  </div>
                </div>

                <div className="pointer-events-none absolute inset-y-3 right-3 flex items-start">
                  <div className="pointer-events-auto mt-12 w-[320px] rounded-[20px] border border-white/10 bg-[#07111d]/96 p-4 text-[var(--text-primary)] shadow-[0_24px_60px_rgba(0,0,0,0.42)] backdrop-blur-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Edit</div>
                        <div className="text-sm font-semibold leading-5" data-testid="bridge-selection-summary">
                          {selectedSummary || 'Seleccioná un nodo en la preview'}
                        </div>
                        <div className="text-[11px] leading-5 text-[var(--text-secondary)]" data-testid="bridge-source-hint">
                          {sourceHint || 'Esperando metadata del overlay o del DOM'}
                        </div>
                      </div>
                      {selectedElement ? (
                        <div className="rounded-full border border-[rgba(var(--accent-rgb,88,166,255),0.18)] bg-[rgba(var(--accent-rgb,88,166,255),0.12)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-primary)]">
                          {dimensions || 'Ready'}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <button
                        type="button"
                        data-testid="bridge-inspect-toggle"
                        onClick={handleInspectToggle}
                        className={`inline-flex items-center gap-2 rounded-xl border px-3 h-8 text-[11px] font-semibold transition-all ${
                          isInspecting
                            ? 'border-[rgba(var(--accent-rgb,88,166,255),0.3)] bg-[rgba(var(--accent-rgb,88,166,255),0.14)] text-[var(--accent-primary)]'
                            : 'border-white/10 bg-white/[0.04] text-[var(--text-primary)] hover:bg-white/[0.07]'
                        }`}
                      >
                        <MousePointer2 className="h-3.5 w-3.5" />
                        {isInspecting ? 'Selecting' : 'Inspect'}
                      </button>
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-3">
                      <label className="mb-2 block text-[11px] font-medium text-[var(--text-muted)]">Describe the change…</label>
                      <textarea
                        data-testid="bridge-change-input"
                        value={changeRequest}
                        onChange={(event) => setChangeRequest(event.target.value)}
                        onInput={(event) => setChangeRequest(event.currentTarget.value)}
                        placeholder="Ej: subí el contraste del precio, compactá el padding y agregá una insignia de recomendado."
                        className="min-h-[110px] w-full resize-none rounded-xl border border-white/8 bg-[#030811] px-3 py-2 text-[13px] leading-6 text-[var(--text-primary)] outline-none transition-colors focus:border-[rgba(var(--accent-rgb,88,166,255),0.35)]"
                      />
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                          Agent
                        </span>
                        <div className="flex items-center gap-2">
                          {BRIDGE_AGENT_OPTIONS.map((agent) => (
                            <button
                              key={agent.id}
                              type="button"
                              data-testid={`bridge-agent-${agent.id}`}
                              disabled={!agent.enabled}
                              onClick={() => agent.enabled && setSelectedAgent(agent.id)}
                              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-all ${
                                agent.id === selectedAgent && agent.enabled
                                  ? 'border-[rgba(var(--accent-rgb,88,166,255),0.24)] bg-[rgba(var(--accent-rgb,88,166,255),0.16)] text-[var(--accent-primary)]'
                                  : agent.enabled
                                    ? 'border-white/10 bg-white/[0.04] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.07]'
                                    : 'border-white/5 bg-white/[0.03] text-[var(--text-muted)] opacity-60 cursor-not-allowed'
                              }`}
                              title={agent.availabilityLabel}
                            >
                              {agent.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        data-testid="bridge-submit"
                        disabled={!canSubmit}
                        onClick={handleLaunch}
                        className="inline-flex items-center gap-2 rounded-xl border border-[rgba(var(--accent-rgb,88,166,255),0.24)] bg-[rgba(var(--accent-rgb,88,166,255),0.16)] px-3 py-2 text-[12px] font-semibold text-[var(--accent-primary)] transition-all hover:bg-[rgba(var(--accent-rgb,88,166,255),0.22)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Wand2 className="h-4 w-4" />
                        Launch
                      </button>
                    </div>

                    {selectorState === SELECTOR_STATE.UNSUPPORTED ? (
                      <p className="mt-4 text-[11px] leading-5 text-amber-200" data-testid="bridge-unsupported-copy">
                        {getUnsupportedCopy(supportState.reason)}
                      </p>
                    ) : null}

                    <div className="sr-only" aria-hidden="true">
                      <span data-testid="bridge-support-mode">{supportState.mode}</span>
                      <span data-testid="bridge-support-reason">{supportState.reason}</span>
                      <span data-testid="bridge-selector-state">{selectorState}</span>
                    </div>

                    {lastLaunchMeta ? (
                      <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-100">
                        <CheckCircle2 className="h-4 w-4" />
                        Request enviado a {lastLaunchMeta.selectedAgent}.
                      </div>
                    ) : null}
                  </div>
                </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

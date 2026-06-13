'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { COMMAND_ACTION, MESSAGE_TYPE, MONITOR_ACTION } from '@emergentbase/visual-edits';
import { commitBrowserNavigation } from './browserHistory';
import { normalizeBrowserUrl } from './rightDockState';
import {
  BRIDGE_AGENT_OPTIONS,
  buildBridgeAgentRequest,
  deriveElementDimensions,
  deriveSelectionLabel,
  deriveSourceHint,
} from './bridgeAgentRequest';
import {
  PREVIEW_SUPPORT_MODE,
  SUPPORT_REASON,
  canAccessIframeDom,
  classifyPreviewSupport,
  createSupportState,
  getIframeContentWindow,
  getInitialSupportState,
  getUnsupportedCopy,
  parseUrlMeta,
  resolvePreviewSrc,
  safeGetFrameHref,
  shouldUsePreviewProxy,
} from './browserPreviewSupport';
import {
  nativeBrowserSelectorCommand,
  subscribeNativeBrowserEvents,
} from '@/lib/browser/nativeBrowserBridge';
import { buildBrowserPreviewDiagnostic } from '@/lib/browserPreviewDiagnostics';

const UNSUPPORTED_TIMEOUT_MS = 3500;
const FALLBACK_RETRY_INTERVAL_MS = 250;
const FALLBACK_RETRY_ATTEMPTS = 20;

const SELECTOR_STATE = {
  IDLE: 'idle',
  CHECKING: 'checking',
  CONNECTING: 'connecting',
  ARMED: 'armed',
  SELECTED: 'selected',
  UNSUPPORTED: 'unsupported',
};

function visualEditLog(level, event, details = {}) {
  const diagnostic = buildBrowserPreviewDiagnostic(event, details);
  if (level === 'error') {
    console.error(diagnostic.message, diagnostic.details);
    return;
  }

  console.warn(diagnostic.message, diagnostic.details);
}

function buildStatusLabel(status) {
  switch (status) {
    case SELECTOR_STATE.CONNECTING:
      return 'Preparing editable preview';
    case SELECTOR_STATE.ARMED:
      return 'Select an element';
    case SELECTOR_STATE.SELECTED:
      return 'Element selected';
    case SELECTOR_STATE.UNSUPPORTED:
      return 'Preview not editable';
    default:
      return 'Edit ready';
  }
}

function createBrowserError(type, overrides = {}) {
  return {
    type,
    title: 'No se pudo cargar esta vista',
    message: 'La vista integrada no pudo resolver este destino.',
    url: '',
    ...overrides,
  };
}

function buildInvalidAddressError(submittedUrl) {
  return createBrowserError('invalid-address', {
    title: 'Dirección inválida',
    message: `“${submittedUrl}” no parece una URL, localhost o búsqueda válida. Corregí el formato y probá de nuevo.`,
    url: String(submittedUrl || '').trim(),
  });
}

function buildLocalhostTargetError(targetUrl, details = {}) {
  const meta = parseUrlMeta(targetUrl);
  const hostLabel = meta.valid
    ? `${meta.hostname}${meta.port ? `:${meta.port}` : ''}`
    : String(targetUrl || '').trim();
  const detail = String(details.detail || details.message || '').trim();
  return createBrowserError('localhost-target-unreachable', {
    title: 'Ese localhost no respondió',
    message:
      details.code === 'ECONNREFUSED'
        ? `No hay ningún servicio respondiendo en ${hostLabel}. Verificá que el servidor esté levantado en ese puerto.`
        : detail ||
          `No pude abrir ${hostLabel}. Verificá que el servidor esté levantado y que el puerto sea correcto.`,
    url: String(targetUrl || '').trim(),
  });
}

function buildIframeLoadError(targetUrl) {
  return createBrowserError('iframe-load-failed', {
    title: 'La vista embebida falló',
    message:
      'Esta página no pudo cargarse dentro del navegador integrado. Probá abrirla en ventana o afuera.',
    url: String(targetUrl || '').trim(),
  });
}

export default function useBrowserPreviewController({
  dockState,
  onDockStateChange,
  forceEditMode = false,
  nativeRuntimeActive = false,
  nativePanelId = null,
  nativeSelectorReady = false,
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const [isInspecting, setIsInspecting] = useState(false);
  const [useProxyPreview, setUseProxyPreview] = useState(() =>
    Boolean(
      (dockState.editMode || forceEditMode) &&
      classifyPreviewSupport({ browserUrl: dockState.browserUrl }).viaProxy
    )
  );
  const [selectedElement, setSelectedElement] = useState(null);
  const [changeRequest, setChangeRequest] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('hermes');
  const [lastLaunchMeta, setLastLaunchMeta] = useState(null);
  const [selectorState, setSelectorState] = useState(SELECTOR_STATE.IDLE);
  const [supportState, setSupportState] = useState(() =>
    getInitialSupportState(dockState.browserUrl)
  );
  const [isLoading, setIsLoading] = useState(Boolean(dockState.browserUrl));
  const [browserError, setBrowserError] = useState(null);
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
  const effectiveEditMode = Boolean(dockState.editMode || forceEditMode);
  const iframeSrc = useMemo(
    () => resolvePreviewSrc(dockState.browserUrl, useProxyPreview),
    [dockState.browserUrl, useProxyPreview]
  );
  const selectedSummary = useMemo(
    () => (selectedElement ? deriveSelectionLabel(selectedElement) : null),
    [selectedElement]
  );
  const sourceHint = useMemo(() => deriveSourceHint(selectedElement), [selectedElement]);
  const dimensions = useMemo(() => deriveElementDimensions(selectedElement), [selectedElement]);
  const activeAgent =
    BRIDGE_AGENT_OPTIONS.find((agent) => agent.id === selectedAgent) || BRIDGE_AGENT_OPTIONS[0];
  const canSubmit = Boolean(
    selectedElement && String(changeRequest || '').trim() && activeAgent?.enabled
  );
  const unsupportedCopy =
    selectorState === SELECTOR_STATE.UNSUPPORTED ? getUnsupportedCopy(supportState.reason) : null;
  const statusLabel = buildStatusLabel(selectorState);

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
    const fallbackInspecting = [
      SELECTOR_STATE.ARMED,
      SELECTOR_STATE.SELECTED,
      SELECTOR_STATE.CONNECTING,
      SELECTOR_STATE.CHECKING,
    ].includes(nextSelector);

    if (
      selectorStateRef.current !== nextSelector ||
      supportStateRef.current?.mode !== nextSupport?.mode ||
      supportStateRef.current?.reason !== nextSupport?.reason
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

    if (clearTimer) clearUnsupportedTimer();
    if (shouldDetachInspector) detachDomInspector();
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

  function updateSupportClassification(
    nextSupport,
    nextSelector = selectorStateRef.current,
    options = {}
  ) {
    commitObservedState({
      selector: nextSelector,
      support: nextSupport,
      reason: nextSupport.reason,
      ...options,
    });
  }

  function syncObservedBrowserUrl(nextUrl, options = {}) {
    const normalizedUrl = typeof nextUrl === 'string' ? nextUrl.trim() : '';
    const immediate = options.immediate === true;
    if (!normalizedUrl) return;

    if (!immediate && typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
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

  function classifyCurrentPreview({
    protocolVerified = protocolVerifiedRef.current,
    iframeOverride,
  } = {}) {
    return classifyPreviewSupport({
      browserUrl: dockState.browserUrl,
      iframe: iframeRef.current,
      iframeSrc: String(
        iframeOverride || iframeRef.current?.getAttribute('src') || iframeSrc || ''
      ),
      protocolVerified,
    });
  }

  function attachSameOriginDomInspector() {
    const iframe = iframeRef.current;
    const targetWindow = getIframeContentWindow(iframe);
    let targetDocument = iframe?.contentDocument || null;

    if (!targetDocument && targetWindow) {
      try {
        targetDocument = targetWindow.document;
      } catch (err) {
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
      if (selectorStateRef.current !== SELECTOR_STATE.ARMED) {
        commitObservedState({ selector: SELECTOR_STATE.ARMED, inspecting: true });
      }
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

  function scheduleUnsupportedState() {
    if (
      ![PREVIEW_SUPPORT_MODE.LOCALHOST_PROXY, PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL].includes(
        supportStateRef.current.mode
      )
    ) {
      downgradeToUnsupported(
        supportStateRef.current.reason || SUPPORT_REASON.CROSS_ORIGIN_NO_INSTRUMENTATION
      );
      return;
    }

    visualEditLog('debug', 'handshake-timeout-scheduled', {
      browserUrl: parseUrlMeta(dockState.browserUrl),
      initialDelay:
        supportStateRef.current.mode === PREVIEW_SUPPORT_MODE.LOCALHOST_PROXY
          ? 0
          : UNSUPPORTED_TIMEOUT_MS,
      retryIntervalMs: FALLBACK_RETRY_INTERVAL_MS,
      retryAttemptsMax: FALLBACK_RETRY_ATTEMPTS,
      proxyPreviewActive: proxyPreviewRef.current,
    });
    clearUnsupportedTimer();
    const initialDelay =
      supportStateRef.current.mode === PREVIEW_SUPPORT_MODE.LOCALHOST_PROXY
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
          createSupportState(
            PREVIEW_SUPPORT_MODE.SAME_ORIGIN_DOM,
            SUPPORT_REASON.SAME_ORIGIN_ACCESS
          ),
          SELECTOR_STATE.ARMED,
          { clearTimer: true, inspecting: true }
        );
        return;
      }

      if (
        !proxyPreviewRef.current &&
        classifyPreviewSupport({ browserUrl: dockState.browserUrl }).viaProxy
      ) {
        visualEditLog('info', 'fallback-switch-to-preview-proxy', {
          browserUrl: parseUrlMeta(dockState.browserUrl),
        });
        proxyPreviewRef.current = true;
        proxyPreviewPendingLoadRef.current = true;
        setUseProxyPreview(true);
        unsupportedTimerRef.current = window.setTimeout(
          attemptFallback,
          FALLBACK_RETRY_INTERVAL_MS
        );
        return;
      }

      if (proxyPreviewRef.current && proxyPreviewPendingLoadRef.current) {
        unsupportedTimerRef.current = window.setTimeout(
          attemptFallback,
          FALLBACK_RETRY_INTERVAL_MS
        );
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
    const targetWindow = getIframeContentWindow(iframeRef.current);
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

  function handleSubmit(event) {
    event.preventDefault();
    const submittedUrl = String(urlInputRef.current?.value || '').trim();
    const normalizedSubmittedUrl = normalizeBrowserUrl(submittedUrl);
    if (submittedUrl && !normalizedSubmittedUrl) {
      setBrowserError(buildInvalidAddressError(submittedUrl));
      setIsLoading(false);
      return;
    }

    const shouldPrimeProxyPreview = Boolean(
      effectiveEditMode && classifyPreviewSupport({ browserUrl: submittedUrl }).viaProxy
    );
    setBrowserError(null);
    onDockStateChange((currentState) => commitBrowserNavigation(currentState, submittedUrl));
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
  }

  function resetNativeSelectorRuntime() {
    if (!nativeRuntimeActive || !nativePanelId) {
      return;
    }

    nativeBrowserSelectorCommand({ panelId: nativePanelId, action: 'deactivate' });
    nativeBrowserSelectorCommand({ panelId: nativePanelId, action: 'clear-selection' });
  }

  function handleEditModeToggle() {
    const nextEditMode = !dockState.editMode;
    const shouldPrimeProxyPreview = Boolean(
      nextEditMode && classifyPreviewSupport({ browserUrl: dockState.browserUrl }).viaProxy
    );
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
      resetNativeSelectorRuntime();
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
  }

  function handleInspectToggle(shouldShowFrameWarning) {
    if (nativeRuntimeActive) {
      if (!nativeSelectorReady) {
        downgradeToUnsupported('selector-unavailable', {
          inspecting: false,
        });
        return;
      }

      if (isInspecting) {
        nativeBrowserSelectorCommand({ panelId: nativePanelId, action: 'deactivate' });
        nativeBrowserSelectorCommand({ panelId: nativePanelId, action: 'clear-selection' });
        commitObservedState({
          selector: SELECTOR_STATE.IDLE,
          support: createSupportState(
            PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL,
            SUPPORT_REASON.PROTOCOL_ACTIVE
          ),
          clearSelection: true,
          clearTimer: true,
          inspecting: false,
        });
        return;
      }

      setLastLaunchMeta(null);
      setSelectedElement(null);
      nativeBrowserSelectorCommand({
        panelId: nativePanelId,
        action: 'activate',
        mode: 'select',
      }).then((result) => {
        if (result?.supported === false) {
          downgradeToUnsupported(result.reason || 'selector-unavailable', {
            inspecting: false,
          });
          return;
        }

        commitObservedState({
          selector: SELECTOR_STATE.CONNECTING,
          support: createSupportState(
            PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL,
            SUPPORT_REASON.PROTOCOL_ACTIVE
          ),
          clearTimer: true,
          inspecting: true,
        });
      });
      return;
    }

    if (shouldShowFrameWarning) {
      visualEditLog('warn', 'selector-activation-blocked', {
        reason: 'frame-warning-active',
        browserUrl: parseUrlMeta(dockState.browserUrl),
      });
      downgradeToUnsupported(SUPPORT_REASON.CROSS_ORIGIN_NO_INSTRUMENTATION);
      return;
    }

    const shouldKeepProxyPreview = classifyPreviewSupport({
      browserUrl: dockState.browserUrl,
    }).viaProxy;

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

    const shouldSkipActivationMessage =
      wasAutoStarting && classifiedSupport.mode === PREVIEW_SUPPORT_MODE.SAME_ORIGIN_DOM;

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
    const activated = shouldSkipActivationMessage
      ? false
      : postBridgeCommand(COMMAND_ACTION.ACTIVATE, {});
    if (
      !shouldSkipActivationMessage &&
      classifiedSupport.mode !== PREVIEW_SUPPORT_MODE.UNSUPPORTED
    ) {
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
  }

  function handleLaunch() {
    if (!canSubmit) return;
    const request = buildBridgeAgentRequest({
      browserUrl: dockState.browserUrl,
      selectedElement,
      changeRequest,
      agentId: selectedAgent,
    });

    window.dispatchEvent(new window.CustomEvent('devhub:run-agent', { detail: request }));
    setLastLaunchMeta({ taskId: request.taskId, selectedAgent: request.selectedAgent });
  }

  function handleIframeLoad() {
    setIsLoading(false);
    setBrowserError(null);
    const currentIframeSrc = String(iframeRef.current?.getAttribute('src') || '');
    const isProxyFrame = currentIframeSrc.includes('/api/preview-proxy');
    let loadedUrl = '';
    proxyPreviewPendingLoadRef.current = false;

    visualEditLog('info', 'iframe-load', {
      browserUrl: parseUrlMeta(dockState.browserUrl),
      iframeSrc: parseUrlMeta(currentIframeSrc),
      isProxyFrame,
      editMode: effectiveEditMode,
      isInspecting,
    });

    try {
      loadedUrl = safeGetFrameHref(getIframeContentWindow(iframeRef.current));
      if (loadedUrl && !isProxyFrame) {
        visualEditLog('debug', 'iframe-navigation-detected', {
          loadedUrl: parseUrlMeta(loadedUrl),
          browserUrl: parseUrlMeta(dockState.browserUrl),
        });
      }
    } catch (error) {
      if (!isProxyFrame) {
        visualEditLog('debug', 'iframe-navigation-unavailable', {
          reason: 'cross-origin-location-access-denied',
          message: error?.message || 'unknown error',
          browserUrl: parseUrlMeta(dockState.browserUrl),
          iframeSrc: parseUrlMeta(currentIframeSrc),
        });
      }
    }

    if (!effectiveEditMode) {
      if (loadedUrl && !isProxyFrame) {
        syncObservedBrowserUrl(loadedUrl);
      }
      return;
    }
    unsupportedAttemptsRef.current = 0;
    const nextSupport = classifyCurrentPreview({ iframeOverride: currentIframeSrc });

    if (nextSupport.reason === SUPPORT_REASON.PROXY_ESCAPED) {
      downgradeToUnsupported(SUPPORT_REASON.PROXY_ESCAPED);
      return;
    }

    if (loadedUrl && !isProxyFrame) {
      syncObservedBrowserUrl(loadedUrl);
    }

    const shouldKeepStableLocalReadyState =
      isProxyFrame &&
      nextSupport.mode === PREVIEW_SUPPORT_MODE.LOCALHOST_PROXY &&
      canAccessIframeDom(iframeRef.current) &&
      [SELECTOR_STATE.ARMED, SELECTOR_STATE.SELECTED].includes(selectorStateRef.current) &&
      !protocolVerifiedRef.current;

    if (shouldKeepStableLocalReadyState) {
      updateSupportClassification(nextSupport, selectorStateRef.current, {
        clearTimer: true,
        inspecting: true,
      });
      return;
    }

    if (isProxyFrame) {
      postBridgeCommand(COMMAND_ACTION.ACTIVATE, {});
      postBridgeCommand(COMMAND_ACTION.SET_INTERACTION_MODE, { mode: 'select' });
    }
    if (nextSupport.mode === PREVIEW_SUPPORT_MODE.SAME_ORIGIN_DOM) {
      updateSupportClassification(
        nextSupport,
        selectedElement ? SELECTOR_STATE.SELECTED : SELECTOR_STATE.ARMED,
        {
          clearTimer: true,
          inspecting: true,
        }
      );
    } else if (isProxyFrame || nextSupport.mode === PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL) {
      updateSupportClassification(nextSupport, SELECTOR_STATE.CONNECTING, { inspecting: true });
      scheduleUnsupportedState();
    } else {
      downgradeToUnsupported(nextSupport.reason);
    }
  }

  function handleIframeError() {
    setIsLoading(false);
    setBrowserError(buildIframeLoadError(dockState.browserUrl));
    visualEditLog('error', 'iframe-load-error', {
      browserUrl: parseUrlMeta(dockState.browserUrl),
      iframeSrc: parseUrlMeta(iframeRef.current?.getAttribute('src') || iframeSrc),
      editMode: effectiveEditMode,
      isInspecting,
    });
  }

  useEffect(() => {
    // Native GTK paints via Tauri/WebKit overlay — iframe onLoad never fires, so
    // tying isLoading to iframeSrc leaves the loading veil stuck forever.
    if (nativeRuntimeActive) {
      setIsLoading(false);
      return;
    }
    setIsLoading(Boolean(iframeSrc));
  }, [iframeSrc, reloadKey, nativeRuntimeActive]);

  useEffect(() => {
    const targetUrl = String(dockState.browserUrl || '').trim();
    if (!targetUrl || !shouldUsePreviewProxy(targetUrl)) {
      setBrowserError((current) =>
        current?.type === 'localhost-target-unreachable' ? null : current
      );
      return undefined;
    }

    let cancelled = false;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;

    async function validateLocalPreview() {
      try {
        const response = await fetch(`/api/preview-proxy/?url=${encodeURIComponent(targetUrl)}`, {
          method: 'GET',
          cache: 'no-store',
          headers: {
            Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          },
          signal: controller?.signal,
        });

        if (cancelled) return;

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          setBrowserError(buildLocalhostTargetError(targetUrl, payload || {}));
          setIsLoading(false);
          return;
        }

        setBrowserError((current) =>
          current?.type === 'localhost-target-unreachable' && current?.url === targetUrl
            ? null
            : current
        );
      } catch (error) {
        if (cancelled || error?.name === 'AbortError') return;
        setBrowserError(buildLocalhostTargetError(targetUrl, error || {}));
        setIsLoading(false);
      }
    }

    validateLocalPreview();

    return () => {
      cancelled = true;
      controller?.abort?.();
    };
  }, [dockState.browserUrl, reloadKey]);

  // useEffect(() => {
  //   visualEditLog('debug', 'iframe-source-updated', {
  //     browserUrl: parseUrlMeta(dockState.browserUrl),
  //     iframeSrc: parseUrlMeta(iframeSrc),
  //     editMode: effectiveEditMode,
  //     useProxyPreview,
  //     shouldProxy: classifyPreviewSupport({ browserUrl: dockState.browserUrl }).viaProxy,
  //   });
  // }, [dockState.browserUrl, effectiveEditMode, iframeSrc, useProxyPreview]);

  useEffect(() => {
    if (urlInputRef.current && document.activeElement !== urlInputRef.current) {
      urlInputRef.current.value = dockState.browserUrl || '';
    }
  }, [dockState.browserUrl]);

  useEffect(() => {
    supportStateRef.current = supportState;
  }, [supportState]);

  useEffect(() => {
    selectorStateRef.current = selectorState;
  }, [selectorState]);

  useEffect(() => {
    if (!nativeRuntimeActive) {
      return undefined;
    }

    commitObservedState({
      support: createSupportState(
        PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL,
        SUPPORT_REASON.PROTOCOL_ACTIVE
      ),
      selector: selectedElement ? SELECTOR_STATE.SELECTED : SELECTOR_STATE.IDLE,
      clearTimer: true,
      detachInspector: true,
      inspecting: isInspecting,
    });

    return undefined;
  }, [isInspecting, nativeRuntimeActive, selectedElement]);

  useEffect(() => {
    if (!effectiveEditMode) {
      protocolVerifiedRef.current = false;
      proxyPreviewRef.current = false;
      proxyPreviewPendingLoadRef.current = false;
      resetNativeSelectorRuntime();
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

    if (nativeRuntimeActive) {
      updateSupportClassification(
        createSupportState(PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL, SUPPORT_REASON.PROTOCOL_ACTIVE),
        selectedElement ? SELECTOR_STATE.SELECTED : SELECTOR_STATE.IDLE,
        { clearTimer: true, detachInspector: true }
      );
      return;
    }

    const shouldPrimeProxyPreview = classifyPreviewSupport({
      browserUrl: dockState.browserUrl,
    }).viaProxy;
    proxyPreviewRef.current = shouldPrimeProxyPreview;
    proxyPreviewPendingLoadRef.current = shouldPrimeProxyPreview;
    setUseProxyPreview(shouldPrimeProxyPreview);
    if (
      supportStateRef.current?.mode === PREVIEW_SUPPORT_MODE.UNSUPPORTED &&
      supportStateRef.current?.reason === SUPPORT_REASON.PROXY_ESCAPED
    ) {
      updateSupportClassification(
        createSupportState(PREVIEW_SUPPORT_MODE.UNSUPPORTED, SUPPORT_REASON.PROXY_ESCAPED),
        SELECTOR_STATE.UNSUPPORTED,
        { clearTimer: true }
      );
      return;
    }
    const preserveInspectingState =
      isInspecting && supportStateRef.current?.mode !== PREVIEW_SUPPORT_MODE.UNSUPPORTED;
    if (preserveInspectingState) {
      updateSupportClassification(
        createSupportState(
          supportStateRef.current.mode,
          supportStateRef.current.reason,
          supportStateRef.current.viaProxy
        ),
        selectedElement ? SELECTOR_STATE.SELECTED : selectorStateRef.current,
        { clearTimer: true }
      );
      return;
    }

    protocolVerifiedRef.current = false;
    updateSupportClassification(
      getInitialSupportState(dockState.browserUrl),
      selectedElement ? SELECTOR_STATE.SELECTED : SELECTOR_STATE.IDLE,
      { clearTimer: true }
    );
  }, [
    dockState.browserUrl,
    effectiveEditMode,
    nativeRuntimeActive,
    nativePanelId,
    selectedElement,
  ]);

  useEffect(() => {
    if (!nativeRuntimeActive || !nativePanelId) {
      return undefined;
    }

    let unlistenWindow = null;
    let teardownBridge = null;

    const handleNativeBrowserEvent = (event) => {
      const payload = event.detail || {};
      if (payload.panelId && payload.panelId !== nativePanelId) {
        return;
      }

      switch (payload.type) {
        case 'selector-ready':
        case 'selector-hover':
          commitObservedState({
            selector: SELECTOR_STATE.ARMED,
            support: createSupportState(
              PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL,
              SUPPORT_REASON.PROTOCOL_ACTIVE
            ),
            clearTimer: true,
            inspecting: true,
          });
          break;
        case 'selector-selected':
          setSelectedElement(payload.element || null);
          commitObservedState({
            selector: SELECTOR_STATE.SELECTED,
            support: createSupportState(
              PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL,
              SUPPORT_REASON.PROTOCOL_ACTIVE
            ),
            clearTimer: true,
            inspecting: true,
          });
          break;
        case 'selector-cleared':
          setSelectedElement(null);
          commitObservedState({
            selector: SELECTOR_STATE.ARMED,
            support: createSupportState(
              PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL,
              SUPPORT_REASON.PROTOCOL_ACTIVE
            ),
            clearTimer: true,
            inspecting: true,
          });
          break;
        case 'selector-error':
          downgradeToUnsupported(payload.reason || 'selector-unavailable', {
            inspecting: false,
          });
          break;
        default:
          break;
      }
    };

    subscribeNativeBrowserEvents().then((teardown) => {
      teardownBridge = teardown;
    });

    window.addEventListener('devhub:native-browser-event', handleNativeBrowserEvent);
    unlistenWindow = () =>
      window.removeEventListener('devhub:native-browser-event', handleNativeBrowserEvent);

    return () => {
      unlistenWindow?.();
      teardownBridge?.();
    };
  }, [nativePanelId, nativeRuntimeActive]);

  useEffect(() => {
    if (
      !effectiveEditMode ||
      !isInspecting ||
      !classifyPreviewSupport({ browserUrl: dockState.browserUrl }).viaProxy
    ) {
      return;
    }

    if (!proxyPreviewRef.current || !useProxyPreview) {
      proxyPreviewRef.current = true;
      proxyPreviewPendingLoadRef.current = true;
      setUseProxyPreview(true);
    }
  }, [dockState.browserUrl, effectiveEditMode, isInspecting, useProxyPreview]);

  useEffect(() => {
    if (forceEditMode) {
      autoInspectOnEditModeRef.current = true;
    }
  }, [forceEditMode]);

  useEffect(() => {
    proxyPreviewRef.current = useProxyPreview;
    proxyPreviewPendingLoadRef.current = useProxyPreview;
  }, [useProxyPreview]);

  useEffect(
    () => () => {
      clearUnsupportedTimer();
      detachDomInspector();
      restoreElementOutline(hoveredElementRef.current);
      restoreElementOutline(selectedElementRef.current);
    },
    []
  );

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

      if (
        [
          MONITOR_ACTION.MODE_ACTIVATED,
          MONITOR_ACTION.ELEMENT_SELECTED,
          MONITOR_ACTION.INTERACTION_MODE_CHANGED,
        ].includes(data.action)
      ) {
        clearUnsupportedTimer();
      }

      switch (data.action) {
        case MONITOR_ACTION.MODE_ACTIVATED: {
          visualEditLog('info', 'handshake-mode-activated', {
            origin: event.origin || 'unknown',
            action: data.action,
          });
          protocolVerifiedRef.current = true;
          updateSupportClassification(
            createSupportState(
              PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL,
              SUPPORT_REASON.PROTOCOL_ACTIVE
            ),
            SELECTOR_STATE.ARMED,
            { clearTimer: true, inspecting: true }
          );
          const remoteHref = safeGetFrameHref(event?.source);
          if (remoteHref) syncObservedBrowserUrl(remoteHref);
          break;
        }
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
            createSupportState(
              PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL,
              SUPPORT_REASON.PROTOCOL_ACTIVE
            ),
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
          const hasFallback = attachSameOriginDomInspector();
          if (hasFallback) {
            updateSupportClassification(
              createSupportState(
                PREVIEW_SUPPORT_MODE.SAME_ORIGIN_DOM,
                SUPPORT_REASON.SAME_ORIGIN_ACCESS
              ),
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
  }, [dockState.browserUrl, iframeSrc, isInspecting, selectedElement]);

  useEffect(() => {
    if (!effectiveEditMode || isInspecting || !autoInspectOnEditModeRef.current) {
      return;
    }

    const shouldWaitForProxyPreview =
      classifyPreviewSupport({ browserUrl: dockState.browserUrl }).viaProxy && !useProxyPreview;

    if (shouldWaitForProxyPreview) {
      return;
    }

    autoInspectOnEditModeRef.current = false;
    handleInspectToggle(false);
  }, [dockState.browserUrl, effectiveEditMode, isInspecting, useProxyPreview]);

  return {
    activeAgent,
    canSubmit,
    browserError,
    changeRequest,
    dimensions,
    effectiveEditMode,
    handleEditModeToggle,
    handleIframeError,
    handleIframeLoad,
    handleInspectToggle,
    handleLaunch,
    handleReload: () => setReloadKey((value) => value + 1),
    handleSubmit,
    iframeRef,
    iframeSrc,
    isInspecting,
    isLoading,
    lastLaunchMeta,
    reloadKey,
    selectedAgent,
    selectedElement,
    selectedSummary,
    selectorState,
    setChangeRequest,
    setSelectedAgent,
    sourceHint,
    statusLabel,
    supportState,
    unsupportedCopy,
    urlInputRef,
  };
}

export { SELECTOR_STATE };

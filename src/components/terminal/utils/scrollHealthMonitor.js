/**
 * scrollHealthMonitor.js — Phase 1: generic dead scroll detection & reporting.
 *
 * Principle: Detect by effect, not by cause.
 * A wheel event over the panel container must produce at least one effect within <=300ms:
 *  (a) scrollback viewportY movement
 *  (b) PTY write with SGR wheel sequence
 *  (c) processing by terminal wheel router handler
 * If NONE occurs -> dead event.
 * 3 consecutive dead events -> panel enters 'scroll-broken' state.
 * Any healthy wheel event resets counter and exits broken state -> 'scroll-recovered'.
 *
 * Legitimate exceptions (ignored):
 *  - Wheel UP when viewportY === 0, or Wheel DOWN when viewportY === baseY (shell normal buffer)
 *  - Inactive panel or hidden panel container
 *  - Visible legitimate interceptor element outside container (modal / popover)
 */

import {
  getTerminalViewportScrollOffset,
  terminalHasActiveMouseReporting,
} from '../TerminalTTY.helpers';
import { logTuiPointerDebug } from '@/lib/terminal/tuiPointerDebug';

function isElementVisible(el) {
  if (!el || !(el instanceof (globalThis.Element || Object))) return false;
  try {
    const win = el.ownerDocument?.defaultView || globalThis;
    if (win && typeof win.getComputedStyle === 'function') {
      const style = win.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
    }
    if (el.style) {
      if (
        el.style.display === 'none' ||
        el.style.visibility === 'hidden' ||
        el.style.opacity === '0'
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

function describeTopElement(el) {
  if (!el || !(el instanceof (globalThis.Element || Object))) return null;
  try {
    const tagName = el.tagName ? el.tagName.toLowerCase() : '';
    const id = el.id ? `#${el.id}` : '';
    const className =
      typeof el.className === 'string' && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).join('.')}`
        : '';
    const visible = isElementVisible(el);
    return {
      descriptor: `${tagName}${id}${className}`,
      tagName,
      id: el.id || null,
      className: el.className || null,
      visible,
    };
  } catch {
    return null;
  }
}

export function createScrollHealthMonitor(
  panelId,
  {
    getTerm = () => null,
    getIsActivePanel = () => true,
    getTuiSessionActive = () => null,
    getWsReadyState = () => null,
    getKimiReadyNotified = () => null,
    getGrokTuiReady = () => null,
    getOpencodeFooterConfirmed = () => null,
    logger = logTuiPointerDebug,
    verifyDelayMs = 300,
    deadThreshold = 3,
    now = Date.now,
    setTimeout: st = globalThis.setTimeout,
    clearTimeout: ct = globalThis.clearTimeout,
  } = {}
) {
  let containerEl = null;
  let wheelListener = null;
  let status = 'healthy'; // 'healthy' | 'broken'
  let deadCount = 0;
  let handlerProcessedCount = 0;
  let ptyWheelWriteCount = 0;
  let lastHandlerPath = null;
  let deadHistory = [];
  const pendingTimers = new Set();
  let disposed = false;

  // perf: elementFromPoint forces hit-testing on every call. During fast
  // scrolling this added measurable main-thread cost per wheel event.
  // Cache the result briefly — overlay appearance rarely changes mid-scroll.
  let lastHitTestTime = 0;
  let lastHitTestResult = null;
  const HIT_TEST_CACHE_MS = 400;

  function clearPendingTimers() {
    for (const timerId of pendingTimers) {
      ct(timerId);
    }
    pendingTimers.clear();
  }

  function onWheelHandlerProcessed(info) {
    if (disposed) return;
    handlerProcessedCount++;
    if (info?.path) {
      lastHandlerPath = info.path;
    }
  }

  function onPtyWheelWrite() {
    if (disposed) return;
    ptyWheelWriteCount++;
  }

  function handleWheelEvent(event) {
    if (disposed) return;

    // Exception 1: Inactive panel
    const isActive = typeof getIsActivePanel === 'function' ? getIsActivePanel() : true;
    if (!isActive) return;

    // Exception 2: Hidden container
    if (containerEl && !isElementVisible(containerEl)) {
      return;
    }

    // Exception 3: Visible interceptor outside container
    const doc = containerEl?.ownerDocument || globalThis.document;
    const clientX = event.clientX;
    const clientY = event.clientY;
    let topEl = null;
    const hitTestNow = now();
    if (hitTestNow - lastHitTestTime < HIT_TEST_CACHE_MS && lastHitTestResult !== undefined) {
      topEl = lastHitTestResult;
    } else if (
      doc &&
      typeof doc.elementFromPoint === 'function' &&
      typeof clientX === 'number' &&
      typeof clientY === 'number'
    ) {
      try {
        topEl = doc.elementFromPoint(clientX, clientY);
      } catch {
        topEl = null;
      }
      lastHitTestTime = hitTestNow;
      lastHitTestResult = topEl;
    }

    if (
      topEl &&
      containerEl &&
      !containerEl.contains(topEl) &&
      topEl !== containerEl &&
      topEl !== doc?.body &&
      topEl !== doc?.documentElement
    ) {
      if (isElementVisible(topEl)) {
        // Visible legitimate interceptor outside terminal area -> exception!
        return;
      }
    }

    // Exception 4: Scrollback boundary (Wheel UP at top, Wheel DOWN at bottom of normal buffer)
    const term = typeof getTerm === 'function' ? getTerm() : null;
    const viewportYBefore = getTerminalViewportScrollOffset(term);
    const activeBuffer = term?.buffer?.active;
    const bufferType = activeBuffer?.type ?? 'normal';
    const baseY = activeBuffer?.baseY ?? null;

    if (event.deltaY < 0 && viewportYBefore === 0) {
      // Wheel UP with viewportY === 0 -> boundary exception
      return;
    }
    if (
      event.deltaY > 0 &&
      bufferType === 'normal' &&
      viewportYBefore !== null &&
      baseY !== null &&
      viewportYBefore >= baseY
    ) {
      // Wheel DOWN at bottom of shell scrollback -> boundary exception
      return;
    }

    // Capture snapshot for verification
    const handlerCountBefore = handlerProcessedCount;
    const ptyCountBefore = ptyWheelWriteCount;
    const mouseTrackingMode = term ? (terminalHasActiveMouseReporting(term) ? 1 : 0) : null;
    const tuiSessionActive =
      typeof getTuiSessionActive === 'function' ? getTuiSessionActive() : null;
    const wsReadyState = typeof getWsReadyState === 'function' ? getWsReadyState() : null;

    const snapshot = {
      timestamp: now(),
      coords: { x: clientX, y: clientY },
      deltaY: event.deltaY,
      viewportYBefore,
      topElement: describeTopElement(topEl),
      mouseTrackingMode,
      tuiSessionActive,
      wsReadyState,
      bufferType,
      lastHandlerPath,
      kimiReadyNotified: typeof getKimiReadyNotified === 'function' ? getKimiReadyNotified() : null,
      grokTuiReady: typeof getGrokTuiReady === 'function' ? getGrokTuiReady() : null,
      opencodeFooterConfirmed:
        typeof getOpencodeFooterConfirmed === 'function' ? getOpencodeFooterConfirmed() : null,
    };

    let timerId = null;
    timerId = st(() => {
      pendingTimers.delete(timerId);
      if (disposed) return;

      const viewportYAfter = getTerminalViewportScrollOffset(term);
      const viewportMoved =
        viewportYAfter !== null && viewportYBefore !== null && viewportYAfter !== viewportYBefore;
      const ptyWrote = ptyWheelWriteCount > ptyCountBefore;
      const handlerProcessed = handlerProcessedCount > handlerCountBefore;

      const healthy = viewportMoved || ptyWrote || handlerProcessed;

      if (healthy) {
        deadCount = 0;
        deadHistory = [];
        if (status === 'broken') {
          status = 'healthy';
          if (typeof logger === 'function') {
            logger('scroll-recovered', {
              panelId,
              path: 'scroll-recovered',
              term,
              extra: {
                status: 'healthy',
                snapshot,
              },
            });
          }
        }
      } else {
        // Dead event!
        deadCount++;
        deadHistory.push(snapshot);
        if (deadHistory.length > deadThreshold) {
          deadHistory.shift();
        }

        if (typeof logger === 'function') {
          logger('scroll-dead-event', {
            panelId,
            path: 'scroll-dead-event',
            term,
            extra: {
              deadCount,
              snapshot,
            },
          });
        }

        if (deadCount >= deadThreshold && status !== 'broken') {
          status = 'broken';
          if (typeof logger === 'function') {
            logger('scroll-broken', {
              panelId,
              path: 'scroll-broken',
              term,
              extra: {
                status: 'broken',
                deadCount,
                snapshot,
                deadHistory: [...deadHistory],
                topElement: snapshot.topElement,
                mouseTrackingMode: snapshot.mouseTrackingMode,
                tuiSessionActive: snapshot.tuiSessionActive,
                wsReadyState: snapshot.wsReadyState,
                bufferType: snapshot.bufferType,
                lastHandlerPath: snapshot.lastHandlerPath,
                kimiReadyNotified: snapshot.kimiReadyNotified,
                grokTuiReady: snapshot.grokTuiReady,
                opencodeFooterConfirmed: snapshot.opencodeFooterConfirmed,
              },
            });
          }
        }
      }
    }, verifyDelayMs);

    pendingTimers.add(timerId);
  }

  function attach(container) {
    if (disposed || !container || typeof container.addEventListener !== 'function') return;
    detach();
    containerEl = container;
    wheelListener = (e) => handleWheelEvent(e);
    containerEl.addEventListener('wheel', wheelListener, { capture: true, passive: true });
  }

  function detach() {
    if (containerEl && wheelListener) {
      try {
        containerEl.removeEventListener('wheel', wheelListener, { capture: true });
      } catch {
        // ignore
      }
    }
    containerEl = null;
    wheelListener = null;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    detach();
    clearPendingTimers();
  }

  return {
    attach,
    detach,
    onWheelHandlerProcessed,
    onPtyWheelWrite,
    getStatus: () => status,
    getDeadCount: () => deadCount,
    dispose,
  };
}

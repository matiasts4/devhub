/**
 * useTerminalWheelRouter — shell vs TUI wheel routing decisions.
 * Extracted from TerminalTTY.jsx.
 *
 * CRITICAL: wheel must attach to a real DOM node that exists after xterm opens.
 * Relying only on useEffect(shellRef) can miss first paint; we also bind on
 * term.element when the engine boots (attachTerminalWheelListener).
 */

import { useCallback, useEffect, useRef } from 'react';
import { isKimiLaunchCommand } from '@/lib/terminal/kimiReadyMarker';
import { isGrokLaunchCommand } from '@/lib/terminal/grokReadyMarker';
import { isOpenCodeLaunchCommand } from '@/lib/terminal/opencodeReadyMarker';
import { logTuiPointerDebug } from '@/lib/terminal/tuiPointerDebug';
import { createScrollHealthMonitor } from '../utils/scrollHealthMonitor';
import {
  buildGrokWheelScrollPayload,
  buildTerminalWheelScrollPayload,
  buildTerminalWheelSgrSequence,
  forwardTerminalWheelToXterm,
  isForwardedTerminalWheelEvent,
  isGrokTuiInitialCommand,
  isTerminalTranscriptCell,
  prepareActiveTuiTerminalFocus,
  resolveGrokWheelSgrCoords,
  resolveTerminalCellFromPointer,
  resolveTerminalPointerElement,
  resolveTerminalWheelInputZoneRows,
  resolveTerminalWheelPageSteps,
  resolveTerminalWheelScrollDirection,
  resolveTerminalWheelScrollPrefer,
  scrollTerminalViewport,
  sendTerminalPasteInput,
  shouldInjectTerminalWheelIntoPty,
  shouldPassthroughNativeTuiWheel,
  shouldRouteWheelToTranscript,
  shouldScrollAgentWheelLocally,
  shouldScrollKimiWheelLocally,
  shouldUseTerminalScrollbackWheel,
  terminalHasActiveMouseReporting,
} from '@/components/terminal/TerminalTTY.helpers';

/**
 * True when document focus is inside the xterm host.
 * When focus is on Zed's composer (or any non-terminal UI), native wheel
 * passthrough can "succeed" at the xterm layer while the TUI ignores it —
 * prefer direct PTY SGR inject instead.
 */
export function terminalElementHasDocumentFocus(
  term,
  doc = typeof document !== 'undefined' ? document : null
) {
  if (!doc) return true;
  const el = term?.element;
  if (!el) return false;
  const active = doc.activeElement;
  if (!active) return false;
  return el === active || (typeof el.contains === 'function' && el.contains(active));
}

export function createTerminalWheelHandler({
  term,
  shell,
  initialCommand,
  lifecycleRefs,
  rendererRefs,
  sessionRefs,
  viewportRefs,
  sendTerminalPasteInput: sendPaste = sendTerminalPasteInput,
  resolveTerminalCellFromPointer: resolveCell = resolveTerminalCellFromPointer,
  shouldRouteWheelToTranscript: routeToTranscript = shouldRouteWheelToTranscript,
  terminalHasFocus = terminalElementHasDocumentFocus,
  onWheelHandlerProcessed,
  onPtyWheelWrite,
} = {}) {
  return function handleWheel(event) {
    if (isForwardedTerminalWheelEvent(event)) return;

    const activeTerm = term || rendererRefs?.current?.termRef?.current;
    if (!activeTerm) return;

    if (shouldUseTerminalScrollbackWheel(event)) {
      const direction = resolveTerminalWheelScrollDirection(event.deltaY);
      if (!direction) return;
      const lines = resolveTerminalWheelPageSteps(event.deltaY) * 3;
      activeTerm.scrollLines(direction === 'up' ? -lines : lines);
      event.preventDefault();
      event.stopPropagation();
      logTuiPointerDebug('tui-wheel', {
        path: 'scrollback-local-shift',
        term: activeTerm,
        mouseTrackingMode: terminalHasActiveMouseReporting(activeTerm) ? 1 : 0,
      });
      onWheelHandlerProcessed?.({ path: 'scrollback-local-shift' });
      return;
    }

    const lifecycle = lifecycleRefs?.current || {};
    if (lifecycle.isActivePanelRef?.current && activeTerm && !terminalHasFocus(activeTerm)) {
      try {
        activeTerm.focus?.();
      } catch {
        // ignore
      }
    }

    const isGrokSession =
      lifecycle.isGrokSessionRef?.current ||
      isGrokTuiInitialCommand(initialCommand) ||
      isGrokLaunchCommand(initialCommand);
    const isOpenCodeSession = isOpenCodeLaunchCommand(initialCommand);
    const isKimiSession =
      lifecycle.kimiReadyNotifiedRef?.current || isKimiLaunchCommand(initialCommand);
    // Generic native fallback: the application itself enabled mouse tracking
    // (DECSET 1000/1002/1003 parsed by xterm). ANY TUI — known or unknown — can
    // then consume SGR wheel, so treat the session as TUI without per-agent config.
    const appMouseTracking = terminalHasActiveMouseReporting(activeTerm);
    // Treat launch-command Grok/OpenCode as TUI even before footer/chrome refs flip —
    // otherwise wheel falls into local scrollback and does nothing on the alt buffer.
    const isTuiSession =
      lifecycle.tuiSessionActiveRef?.current ||
      isGrokSession ||
      isOpenCodeSession ||
      appMouseTracking;

    if (shouldScrollKimiWheelLocally(isKimiSession)) {
      const direction = resolveTerminalWheelScrollDirection(event.deltaY);
      if (!direction) return;
      if (
        scrollTerminalViewport(activeTerm, direction, event.deltaY, {
          linesPerStep: 3,
          lineHeight: 30,
          maxSteps: 6,
        })
      ) {
        event.preventDefault();
        event.stopPropagation();
        onWheelHandlerProcessed?.({ path: 'kimi-scroll-local' });
      }
      return;
    }

    // Inline-rendering agents (qodercli, claude, codex — claude-code convention):
    // no alt screen, no mouse tracking. SGR inject is dead for them; scroll the
    // xterm viewport locally like a normal terminal.
    const serverAgentType = lifecycle.agentTypeRef?.current || null;
    if (shouldScrollAgentWheelLocally(initialCommand, serverAgentType)) {
      const direction = resolveTerminalWheelScrollDirection(event.deltaY);
      if (!direction) return;
      if (
        scrollTerminalViewport(activeTerm, direction, event.deltaY, {
          linesPerStep: 3,
          lineHeight: 30,
          maxSteps: 6,
        })
      ) {
        event.preventDefault();
        event.stopPropagation();
        onWheelHandlerProcessed?.({ path: 'inline-agent-scroll-local' });
      }
      return;
    }

    if (!shouldInjectTerminalWheelIntoPty(isTuiSession)) {
      const direction = resolveTerminalWheelScrollDirection(event.deltaY);
      if (!direction) return;
      if (scrollTerminalViewport(activeTerm, direction, event.deltaY)) {
        event.preventDefault();
        event.stopPropagation();
        onWheelHandlerProcessed?.({ path: 'scroll-viewport-local' });
      }
      return;
    }

    // OpenCode only: native wheel when footer ready + mouse modes + focus.
    // Grok is inject-only (passThrough false) — native swallow is the first-panel bug.
    if (
      !isGrokSession &&
      shouldPassthroughNativeTuiWheel({
        isGrokSession,
        isKimiSession,
        grokTuiReady: lifecycle.grokTuiReadyRef?.current,
        kimiTuiReady: lifecycle.kimiReadyNotifiedRef?.current,
        opencodeFooterConfirmed: lifecycle.tuiSessionFooterConfirmedRef?.current,
      }) &&
      lifecycle.isActivePanelRef?.current &&
      terminalHasFocus(activeTerm)
    ) {
      if (forwardTerminalWheelToXterm(activeTerm, event, { onPtyWheelWrite })) {
        event.preventDefault();
        event.stopPropagation();
        logTuiPointerDebug('tui-wheel', {
          path: 'native-forward',
          term: activeTerm,
          zone: 'transcript',
          tuiSessionActive: Boolean(lifecycle.tuiSessionActiveRef?.current),
          grokTuiReady: lifecycle.grokTuiReadyRef?.current === true,
          opencodeFooterConfirmed: lifecycle.tuiSessionFooterConfirmedRef?.current === true,
          isActivePanel: lifecycle.isActivePanelRef?.current === true,
          mouseTrackingMode: terminalHasActiveMouseReporting(activeTerm) ? 1 : 0,
          domFocus: true,
        });
        onWheelHandlerProcessed?.({ path: 'native-forward' });
        return;
      }
    }

    const inputZoneRows = resolveTerminalWheelInputZoneRows({ isGrokSession, isKimiSession });
    const containerRef = viewportRefs?.current?.containerRef;
    const pointerEl = resolveTerminalPointerElement(
      activeTerm,
      containerRef?.current,
      shell || viewportRefs?.current?.viewportShellRef?.current
    );
    const cell = resolveCell(activeTerm, pointerEl, event.clientX, event.clientY);
    if (cell && lifecycle.lastPointerZoneRef) {
      lifecycle.lastPointerZoneRef.current = isTerminalTranscriptCell(
        cell.row,
        activeTerm.rows,
        inputZoneRows
      )
        ? 'transcript'
        : 'input';
    }

    const inTranscript = routeToTranscript({
      cell,
      rows: activeTerm.rows,
      lastPointerZone: lifecycle.lastPointerZoneRef?.current,
      inputZoneRows,
    });
    const zone = inTranscript ? 'transcript' : 'input';

    if (!inTranscript && !isTuiSession) {
      return;
    }

    const direction = resolveTerminalWheelScrollDirection(event.deltaY);
    if (!direction) return;

    const TERMINAL_WHEEL_MAX_PAGE_STEPS = 2;
    const rawSteps = resolveTerminalWheelPageSteps(event.deltaY);
    const steps = Math.max(1, Math.min(TERMINAL_WHEEL_MAX_PAGE_STEPS, rawSteps));
    let wheelCol = cell?.col ?? Math.max(0, Math.floor((activeTerm.cols || 80) / 2));
    let wheelRow = cell?.row ?? Math.max(0, Math.floor((activeTerm.rows || 24) * 0.35));

    if (isTuiSession) {
      const coords = resolveGrokWheelSgrCoords(cell, activeTerm, inputZoneRows);
      wheelCol = coords.col;
      wheelRow = coords.row;
    }

    const scrollPrefer = resolveTerminalWheelScrollPrefer(initialCommand, {
      isGrokSession,
      isKimiSession,
      tuiActive: lifecycle.tuiSessionActiveRef?.current || appMouseTracking,
    });
    const payload = isGrokSession
      ? buildGrokWheelScrollPayload(direction, wheelCol, wheelRow, steps)
      : scrollPrefer === 'sgr'
        ? buildTerminalWheelSgrSequence(direction, wheelCol, wheelRow)
        : buildTerminalWheelScrollPayload(direction, steps, { prefer: scrollPrefer });

    // Grok: focus for TUI input routing; do not host-enable mouse modes here
    // (that enables native swallow on the first panel). OpenCode may rebind lightly.
    if (isGrokSession || isOpenCodeSession) {
      try {
        activeTerm.focus?.();
      } catch {
        // ignore
      }
      if (isOpenCodeSession && !terminalHasActiveMouseReporting(activeTerm)) {
        prepareActiveTuiTerminalFocus(activeTerm, { tuiSessionActive: true });
      }
      // Ensure inject path is taken even if chrome detect lagged.
      if (isGrokSession) {
        if (lifecycle.isGrokSessionRef) lifecycle.isGrokSessionRef.current = true;
        if (lifecycle.tuiSessionActiveRef) lifecycle.tuiSessionActiveRef.current = true;
        if (lifecycle.grokTuiReadyRef) lifecycle.grokTuiReadyRef.current = true;
      }
    }

    const wsRef = sessionRefs?.current?.wsRef;
    const transportRef = sessionRefs?.current?.transportRef;
    const socket = wsRef?.current;
    let sent = sendPaste({
      socket,
      transport: transportRef?.current,
      text: payload,
      onPtyWheelWrite,
    });

    // Cold start race: WS may still be CONNECTING. Retry once shortly after open.
    if (!sent && socket && typeof socket.readyState === 'number' && socket.readyState === 0) {
      const retryPayload = payload;
      const retrySocket = socket;
      const retryTransport = transportRef?.current;
      const onOpen = () => {
        retrySocket.removeEventListener?.('open', onOpen);
        sendPaste({
          socket: retrySocket,
          transport: retryTransport,
          text: retryPayload,
          onPtyWheelWrite,
        });
      };
      try {
        retrySocket.addEventListener?.('open', onOpen);
        setTimeout(() => {
          try {
            retrySocket.removeEventListener?.('open', onOpen);
          } catch {
            // ignore
          }
        }, 5000);
        sent = true;
      } catch {
        // ignore
      }
    }

    // Last-resort: if JSON transport failed, try raw write of the same payload
    // (some first-panel sessions report OPEN but reject structured frames briefly).
    if (!sent && socket && socket.readyState === 1 && payload) {
      try {
        if (transportRef?.current === 'raw') {
          socket.send(payload);
        } else {
          socket.send(JSON.stringify({ type: 'input', data: payload }));
        }
        sent = true;
        onPtyWheelWrite?.({ type: 'sgr-raw-send', text: payload });
      } catch {
        // ignore
      }
    }

    if (!sent) {
      logTuiPointerDebug('tui-wheel', {
        path: 'inject-wheel-failed',
        term: activeTerm,
        zone,
        cell,
        tuiSessionActive: Boolean(lifecycle.tuiSessionActiveRef?.current),
        grokTuiReady: lifecycle.grokTuiReadyRef?.current === true,
        opencodeFooterConfirmed: lifecycle.tuiSessionFooterConfirmedRef?.current === true,
        isActivePanel: lifecycle.isActivePanelRef?.current === true,
      });
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onWheelHandlerProcessed?.({ path: inTranscript ? 'inject-wheel' : 'inject-wheel-input-zone' });
    logTuiPointerDebug('tui-wheel', {
      path: inTranscript ? 'inject-wheel' : 'inject-wheel-input-zone',
      term: activeTerm,
      zone,
      cell,
      tuiSessionActive: Boolean(lifecycle.tuiSessionActiveRef?.current),
      grokTuiReady: lifecycle.grokTuiReadyRef?.current === true,
      opencodeFooterConfirmed: lifecycle.tuiSessionFooterConfirmedRef?.current === true,
      isActivePanel: lifecycle.isActivePanelRef?.current === true,
      mouseTrackingMode: terminalHasActiveMouseReporting(activeTerm) ? 1 : 0,
      domFocus: terminalHasFocus(activeTerm),
    });
  };
}

/**
 * Attach wheel inject to a DOM node (shell or term.element). Idempotent per node via WeakMap.
 * Returns dispose fn.
 */
const wheelListenerByNode = new WeakMap();

export function attachTerminalWheelListener(node, getHandler) {
  if (!node || typeof node.addEventListener !== 'function') return () => {};
  const existing = wheelListenerByNode.get(node);
  if (existing) {
    existing.dispose();
  }
  const listener = (event) => {
    const handler = typeof getHandler === 'function' ? getHandler() : null;
    if (typeof handler === 'function') handler(event);
  };
  node.addEventListener('wheel', listener, { passive: false, capture: true });
  const dispose = () => {
    try {
      node.removeEventListener('wheel', listener, { capture: true });
    } catch {
      // ignore
    }
    if (wheelListenerByNode.get(node)?.listener === listener) {
      wheelListenerByNode.delete(node);
    }
  };
  wheelListenerByNode.set(node, { listener, dispose });
  return dispose;
}

/**
 * Bind wheel to xterm root element right after terminal.open (cold-start safe).
 */
export function attachTerminalWheelToXterm(term, options = {}) {
  const el = term?.element;
  if (!el) return () => {};
  return attachTerminalWheelListener(el, () =>
    createTerminalWheelHandler({
      term,
      shell: el,
      ...options,
    })
  );
}

export default function useTerminalWheelRouter({
  lifecycleRefs,
  rendererRefs,
  sessionRefs,
  viewportRefs,
  initialCommand,
  shouldUseNativeRenderer,
  panelId,
}) {
  const monitorRef = useRef(null);
  const handlerCacheRef = useRef({ handler: null, shell: undefined, command: undefined });

  useEffect(() => {
    if (shouldUseNativeRenderer) return undefined;

    const activePanelId = panelId || lifecycleRefs?.current?.panelId || 'terminal-panel';
    const monitor = createScrollHealthMonitor(activePanelId, {
      getTerm: () => rendererRefs?.current?.termRef?.current,
      getIsActivePanel: () => lifecycleRefs?.current?.isActivePanelRef?.current ?? true,
      getTuiSessionActive: () => lifecycleRefs?.current?.tuiSessionActiveRef?.current ?? false,
      getWsReadyState: () => sessionRefs?.current?.wsRef?.current?.readyState ?? null,
      getKimiReadyNotified: () => lifecycleRefs?.current?.kimiReadyNotifiedRef?.current ?? false,
      getGrokTuiReady: () => lifecycleRefs?.current?.grokTuiReadyRef?.current ?? false,
      getOpencodeFooterConfirmed: () =>
        lifecycleRefs?.current?.tuiSessionFooterConfirmedRef?.current ?? false,
    });
    monitorRef.current = monitor;

    const shell =
      viewportRefs?.current?.viewportShellRef?.current ||
      viewportRefs?.current?.containerRef?.current ||
      rendererRefs?.current?.termRef?.current?.element;
    if (shell) {
      monitor.attach(shell);
    }

    return () => {
      monitor.dispose();
      monitorRef.current = null;
    };
  }, [panelId, shouldUseNativeRenderer]);

  const getHandler = useCallback(() => {
    const shell = viewportRefs?.current?.viewportShellRef?.current;
    // perf: reuse the cached handler while shell + command are stable.
    // Previously a fresh closure was allocated on EVERY wheel event
    // (100+/sec on trackpads), adding GC pressure during fast scroll.
    const cache = handlerCacheRef.current;
    if (cache.handler && cache.shell === shell && cache.command === initialCommand) {
      return cache.handler;
    }
    const handler = createTerminalWheelHandler({
      shell,
      initialCommand,
      lifecycleRefs,
      rendererRefs,
      sessionRefs,
      viewportRefs,
      onWheelHandlerProcessed: (info) => monitorRef.current?.onWheelHandlerProcessed(info),
      onPtyWheelWrite: (info) => monitorRef.current?.onPtyWheelWrite(info),
    });
    cache.handler = handler;
    cache.shell = shell;
    cache.command = initialCommand;
    return handler;
  }, [initialCommand, lifecycleRefs, rendererRefs, sessionRefs, viewportRefs]);

  // Bind/re-bind shell whenever it appears (poll briefly after mount + on dep change).
  useEffect(() => {
    if (shouldUseNativeRenderer) return undefined;

    let disposed = false;
    let disposeListener = null;
    let tries = 0;
    let timer = null;

    const tryBind = () => {
      if (disposed) return;
      const shell = viewportRefs?.current?.viewportShellRef?.current;
      if (shell) {
        monitorRef.current?.attach(shell);
        disposeListener = attachTerminalWheelListener(shell, getHandler);
        return;
      }
      tries += 1;
      if (tries < 40) {
        timer = setTimeout(tryBind, 50);
      }
    };

    tryBind();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      disposeListener?.();
    };
  }, [getHandler, shouldUseNativeRenderer, viewportRefs]);

  // Also re-bind when xterm element becomes available (after engine boot).
  useEffect(() => {
    if (shouldUseNativeRenderer) return undefined;

    let disposed = false;
    let disposeListener = null;
    let tries = 0;
    let timer = null;

    const tryBindTerm = () => {
      if (disposed) return;
      const term = rendererRefs?.current?.termRef?.current;
      const el = term?.element;
      if (el) {
        monitorRef.current?.attach(el);
        // perf: create the handler ONCE at bind time (term/el are stable for
        // this xterm instance) instead of allocating a fresh closure on every
        // wheel event.
        const boundHandler = createTerminalWheelHandler({
          term,
          shell: el,
          initialCommand,
          lifecycleRefs,
          rendererRefs,
          sessionRefs,
          viewportRefs,
          onWheelHandlerProcessed: (info) => monitorRef.current?.onWheelHandlerProcessed(info),
          onPtyWheelWrite: (info) => monitorRef.current?.onPtyWheelWrite(info),
        });
        disposeListener = attachTerminalWheelListener(el, () => boundHandler);
        return;
      }
      tries += 1;
      if (tries < 60) {
        timer = setTimeout(tryBindTerm, 100);
      }
    };

    tryBindTerm();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      disposeListener?.();
    };
  }, [
    initialCommand,
    lifecycleRefs,
    rendererRefs,
    sessionRefs,
    shouldUseNativeRenderer,
    viewportRefs,
  ]);

  return { getHandler };
}

/**
 * Grok TUI wheel → PTY SGR inject.
 *
 * Why a dedicated module:
 * - First Grok panel often has dead scroll; second panel / post-Ctrl+R works.
 * - xterm native mouse path + host DECSET rebind races leave mouse "on" without
 *   a listening TUI → wheel is swallowed (preventDefault) with no PTY effect.
 * - Shell capture listeners can miss first-panel mounts; binding on term.element
 *   right after open is reliable.
 *
 * Strategy: for Grok sessions, ALWAYS inject ESC[<64/65 SGR to the PTY and
 * stop the event so xterm cannot swallow it. Never rely on native passthrough.
 */

import {
  isGrokLaunchCommand,
  detectGrokReadyFromTerminalBuffer,
} from '@/lib/terminal/grokReadyMarker';
import {
  isGrokTuiInitialCommand,
  buildGrokWheelScrollPayload,
  resolveGrokWheelSgrCoords,
  resolveTerminalCellFromPointer,
  resolveTerminalPointerElement,
  resolveTerminalWheelInputZoneRows,
  resolveTerminalWheelPageSteps,
  resolveTerminalWheelScrollDirection,
  sendTerminalPasteInput,
  TERMINAL_WHEEL_FORWARD_FLAG,
} from '@/components/terminal/TerminalTTY.helpers';

/**
 * @param {object} opts
 * @param {object} opts.term - xterm Terminal instance
 * @param {() => string} [opts.getInitialCommand]
 * @param {() => object} [opts.getLifecycle] - { isGrokSessionRef, grokTuiReadyRef, tuiSessionActiveRef }
 * @param {() => object} [opts.getSession] - { wsRef, transportRef }
 * @param {() => object} [opts.getViewport] - { containerRef, viewportShellRef }
 */
export function isGrokWheelSession({ term, getInitialCommand, getLifecycle } = {}) {
  const lifecycle = typeof getLifecycle === 'function' ? getLifecycle() : {};
  if (lifecycle?.isGrokSessionRef?.current) return true;
  if (lifecycle?.grokTuiReadyRef?.current) return true;
  const cmd = (typeof getInitialCommand === 'function' ? getInitialCommand() : '') || '';
  if (isGrokLaunchCommand(cmd) || isGrokTuiInitialCommand(cmd)) return true;
  if (term && detectGrokReadyFromTerminalBuffer(term)) return true;
  return false;
}

/**
 * @returns {(event: WheelEvent) => void}
 */
export function createGrokWheelInjectHandler({
  term,
  getInitialCommand = () => '',
  getLifecycle = () => ({}),
  getSession = () => ({}),
  getViewport = () => ({}),
} = {}) {
  return function handleGrokWheel(event) {
    if (!event || event[TERMINAL_WHEEL_FORWARD_FLAG]) return;
    if (!term) return;
    if (!isGrokWheelSession({ term, getInitialCommand, getLifecycle })) return;

    // Shift+wheel: leave to xterm scrollback if any
    if (event.shiftKey) return;

    const direction = resolveTerminalWheelScrollDirection(event.deltaY);
    if (!direction) return;

    const lifecycle = getLifecycle() || {};
    // Promote flags so the rest of the app treats this as Grok TUI.
    if (lifecycle.isGrokSessionRef) lifecycle.isGrokSessionRef.current = true;
    if (lifecycle.tuiSessionActiveRef) lifecycle.tuiSessionActiveRef.current = true;
    if (lifecycle.grokTuiReadyRef) lifecycle.grokTuiReadyRef.current = true;

    try {
      term.focus?.();
    } catch {
      // ignore
    }

    const viewport = getViewport() || {};
    const shell = viewport.viewportShellRef?.current || term.element;
    const pointerEl = resolveTerminalPointerElement(term, viewport.containerRef?.current, shell);
    const cell = resolveTerminalCellFromPointer(term, pointerEl, event.clientX, event.clientY);
    const inputZoneRows = resolveTerminalWheelInputZoneRows({ isGrokSession: true });
    const coords = resolveGrokWheelSgrCoords(cell, term, inputZoneRows);
    const steps = Math.max(1, Math.min(4, resolveTerminalWheelPageSteps(event.deltaY) || 1));
    const payload = buildGrokWheelScrollPayload(direction, coords.col, coords.row, steps);

    const session = getSession() || {};
    const socket = session.wsRef?.current;
    const transport = session.transportRef?.current || 'json';

    let sent = sendTerminalPasteInput({
      socket,
      transport,
      text: payload,
    });

    if (!sent && socket && socket.readyState === 1) {
      try {
        if (transport === 'raw') {
          socket.send(payload);
        } else {
          socket.send(JSON.stringify({ type: 'input', data: payload }));
        }
        sent = true;
      } catch {
        // ignore
      }
    }

    // Always stop the event for Grok so xterm cannot swallow with dead native mouse.
    // Even if send failed, preventDefault avoids "local scrollback on alt buffer" no-op.
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();

    return sent;
  };
}

/**
 * Bind capture-phase wheel inject on term.element.
 * @returns {() => void} dispose
 */
export function attachGrokTuiWheelInject(term, options = {}) {
  if (!term?.element || typeof term.element.addEventListener !== 'function') {
    return () => {};
  }
  const handler = createGrokWheelInjectHandler({ term, ...options });
  const listener = (event) => {
    handler(event);
  };
  // Capture on the xterm root so we run before bubble mouse-protocol handlers.
  term.element.addEventListener('wheel', listener, { passive: false, capture: true });

  // Also use xterm API when mouse modes are OFF (alt-buffer arrow path).
  // When mouse modes are ON, xterm skips custom wheel — capture listener still runs.
  let customAttached = false;
  if (typeof term.attachCustomWheelEventHandler === 'function') {
    term.attachCustomWheelEventHandler((ev) => {
      if (
        !isGrokWheelSession({
          term,
          getInitialCommand: options.getInitialCommand,
          getLifecycle: options.getLifecycle,
        })
      ) {
        return true; // let xterm handle OpenCode/shell
      }
      if (ev.shiftKey) return true;
      handler(ev);
      return false; // cancel xterm default (arrows / viewport)
    });
    customAttached = true;
  }

  return () => {
    try {
      term.element?.removeEventListener('wheel', listener, { capture: true });
    } catch {
      // ignore
    }
    if (customAttached && typeof term.attachCustomWheelEventHandler === 'function') {
      try {
        // xterm has no detach API — replace with pass-through
        term.attachCustomWheelEventHandler(() => true);
      } catch {
        // ignore
      }
    }
  };
}

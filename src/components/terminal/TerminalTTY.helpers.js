/**
 * Pure helper exports extracted from TerminalTTY.jsx (TTY-2).
 * Stateless functions only — no React hooks.
 */

import {
  getTerminalRendererFallbackCopy,
  getTerminalRendererOptionLabel,
  resolveRendererSelection,
  TERMINAL_SPLIT_WEBGL_PANEL_LIMIT,
  TERMINAL_WEBGL_FALLBACK_REASONS,
} from '@/components/terminal/terminalRendererCapabilities';
import { usesLegacyTerminalSurvivorRecovery } from '@/lib/terminal/legacyTerminalSurvivorRecovery';
import { isAgentTuiCommand } from '@/lib/terminal/agentSessionExit';
import { detectAgentTypeFromCommand } from '@/lib/terminal/agentTuiMetadata';
import {
  detectOpenCodeReadyFromTerminalBuffer,
  isOpenCodeLaunchCommand,
  shouldDiscardOpenCodeCatchupReplay,
} from '@/lib/terminal/opencodeReadyMarker';
import {
  detectGrokReadyFromTerminalBuffer,
  isGrokLaunchCommand,
} from '@/lib/terminal/grokReadyMarker';
import { isKimiLaunchCommand } from '@/lib/terminal/kimiReadyMarker';
import { getPanelInitialCommandDispatch } from '@/lib/terminal/panelInitialCommandLifecycle';
import { getTuiAdapter } from '@/lib/terminal/tuiAdapter';
import { incrementPerfCounter, PERF_COUNTERS } from '@/lib/terminal/startupPerfMarks';
import { isTuiPointerDebugEnabled, logTuiPointerDebug } from '@/lib/terminal/tuiPointerDebug';

/**
 * Resize telemetry — counts every resize sent to the PTY (and every zero-delta
 * send suppressed by the dimension guard) with the previous sent dimensions,
 * so redundant SIGWINCH storms are measurable. No-op unless
 * localStorage.devhub_perf is on.
 */
function trackPtyResizeSent({ cols, rows, lastPtySizeRef, source, telemetryDetail }) {
  const prevCols = lastPtySizeRef ? Number(lastPtySizeRef.cols ?? 0) : null;
  const prevRows = lastPtySizeRef ? Number(lastPtySizeRef.rows ?? 0) : null;
  incrementPerfCounter(PERF_COUNTERS.TERMINAL_RESIZE_SENT, {
    cols,
    rows,
    prevCols,
    prevRows,
    hidden: telemetryDetail?.hidden ?? null,
    // TODO(terminal-load-performance): tuiActive is not cleanly reachable from
    // every send path yet — threaded through only where the caller knows it.
    tuiActive: telemetryDetail?.tuiActive ?? null,
    redundant: prevCols === cols && prevRows === rows,
    source,
  });
}

function cliLog(tag, msg, extra = {}) {
  try {
    fetch('/api/terminal/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag, msg, extra }),
    }).catch(() => {});
  } catch {
    // never crash
  }
}

/**
 * Pure function: returns Framer Motion animation props for the xterm container.
 * Fades in (opacity 0→1, 150ms ease-out) when the terminal viewport should be visible.
 *
 * @param {boolean} visible - whether the terminal viewport should be visible
 * @returns {{ initial, animate, transition }} Framer Motion props
 */
export function getXtermContainerAnimProps(visible) {
  return {
    // Avoid re-fading on every panel switch/reconnect — only animate the target state.
    initial: false,
    animate: { opacity: visible ? 1 : 0 },
    // Keep the transition instant during workspace/window switches. A 100 ms fade
    // combined with forced GPU repaints made the terminal look like it was blinking
    // for ~1 s while the recovery helpers ran. The workspace shell already handles
    // the visual transition; the xterm canvas should just be there once ready.
    transition: { duration: 0 },
  };
}

export function shouldShowTerminalViewport(isInitializing, initError) {
  return !isInitializing && !initError;
}

/** Max wait before first connect when viewport fit keeps deferring (mode-switch undersize). */
export const TERMINAL_CONNECT_DEFER_MAX_MS = 1800;
/** Fresh-panel command injection must wait for the host surface projection; cap the wait. */
export const TERMINAL_PROJECTION_READY_TIMEOUT_MS = 500;
/** ponytail: parallel cold mount — stagger caused left-to-right seconds-long panel pop-in. */
export const TERMINAL_COLD_MOUNT_STAGGER_MS = 0;
export function resolveColdMountStaggerMs({
  coldMountOrdinal = 0,
  isVisibleInLayout = true,
  staggerMsPerPanel = TERMINAL_COLD_MOUNT_STAGGER_MS,
} = {}) {
  if (!isVisibleInLayout || staggerMsPerPanel <= 0) return 0;
  return Math.max(0, Number(coldMountOrdinal) || 0) * staggerMsPerPanel;
}

/**
 * Full-screen blocking loader — only on the panel's first real boot, never on
 * remounts (tab switch, pizarra enter/exit, graveyard restore). Remounts seed
 * hasConnectedOnce from terminalConnectedOnceRegistry, so a reconnecting panel
 * re-initializes xterm quietly instead of flashing "Conectando…".
 */
export function shouldShowTerminalLoadingOverlay(
  isInitializing,
  connectionState,
  hasConnectedOnce
) {
  if (hasConnectedOnce) return false;
  if (isInitializing) return true;
  return connectionState === 'connecting';
}

export function shouldShowTerminalStatusOverlay(isInitializing, initError, connectionState) {
  if (connectionState === 'suspended') return true;
  if (connectionState === 'agent-exited') return true;
  if (isInitializing) return false;

  return Boolean(
    initError ||
    connectionState === 'error' ||
    connectionState === 'disconnected' ||
    connectionState === 'terminated'
  );
}

/** Focus in/out (mode 1004) — safe to disable on any panel. */
export const TERMINAL_DISABLE_FOCUS_REPORTING_SEQ = '\x1b[?1004l';

/** Mouse tracking modes — only disable on inactive/background panels so active TUIs keep wheel scroll. */
export const TERMINAL_DISABLE_MOUSE_REPORTING_SEQ =
  '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1007l\x1b[?1015l';

/** Match grok/OpenCode DECSET burst so xterm re-binds SGR wheel after panel hide. */
export const TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ =
  '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h';

export const TERMINAL_DISABLE_FOCUS_AND_MOUSE_REPORTING_SEQ =
  TERMINAL_DISABLE_FOCUS_REPORTING_SEQ + TERMINAL_DISABLE_MOUSE_REPORTING_SEQ;

/** Synchronized output (DEC mode 2026) — TUIs use this to suppress flicker during bulk repaints. */
export const TERMINAL_SYNC_OUTPUT_START_SEQ = '\x1b[?2026h';
export const TERMINAL_SYNC_OUTPUT_END_SEQ = '\x1b[?2026l';
export const TERMINAL_SYNC_OUTPUT_MAX_HOLD_MS = 100;

/** Output throttle — prevent xterm.js from choking on PTY floods. */
export const TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME = 32 * 1024;
export const TERMINAL_OUTPUT_BACKLOG_THRESHOLD = 128 * 1024;

/** Phase 3 terminal-engine-v2: SerializeAddon snapshot cadence. */
export const TERMINAL_SNAPSHOT_THRESHOLD_BYTES = 100 * 1024;
export const TERMINAL_SNAPSHOT_MAX_INTERVAL_MS = 5000;

export function disableTerminalFocusReporting(term, { disableMouse = false } = {}) {
  if (!term || typeof term.write !== 'function') return;
  try {
    term.write(
      disableMouse
        ? TERMINAL_DISABLE_FOCUS_AND_MOUSE_REPORTING_SEQ
        : TERMINAL_DISABLE_FOCUS_REPORTING_SEQ
    );
  } catch {
    // terminal may be mid-dispose
  }
}

/** Active panels: silence focus leaks. Live TUIs keep/rebind mouse modes; shells drop stale mouse tracking. */
export function prepareActiveTuiTerminalFocus(term, { tuiSessionActive = false } = {}) {
  if (!term || typeof term.write !== 'function') return;
  try {
    term.write(TERMINAL_DISABLE_FOCUS_REPORTING_SEQ);
    if (tuiSessionActive) {
      term.write(TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ);
    } else {
      term.write(TERMINAL_DISABLE_MOUSE_REPORTING_SEQ);
    }
  } catch {
    // terminal may be mid-dispose
  }
}

/** Device Attributes query — asks the TUI/shell to re-announce its active modes. */
const TERMINAL_DEVICE_ATTRIBUTES_QUERY_SEQ = '\x1b[c';
/** Full reset of private modes commonly set by TUIs; a clean slate for reattach. */
const TERMINAL_PRIVATE_MODES_RESET_SEQ =
  '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1007l\x1b[?1015l';
/** Force a full screen redraw so the TUI repaints after reconnect. */
const TERMINAL_FORCE_REDRAW_SEQ = '\x0c';

/**
 * After reconnecting to a live PTY, xterm.js is a fresh emulator with no memory
 * of the TUI's private DECSET modes. Send a mode reset, a device-attributes
 * query (so the TUI re-emits its modes), and a Ctrl+L redraw. For known agent
 * TUIs also inject the mouse-reporting burst they expect as a fallback.
 */
export function resetTerminalModesForReattach(term, { tuiSessionActive = false } = {}) {
  if (!term || typeof term.write !== 'function') return;
  try {
    term.write(TERMINAL_PRIVATE_MODES_RESET_SEQ);
    term.write(TERMINAL_DEVICE_ATTRIBUTES_QUERY_SEQ);
    if (tuiSessionActive) {
      term.write(TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ);
    }
    term.write(TERMINAL_FORCE_REDRAW_SEQ);
  } catch {
    // terminal may be mid-dispose
  }
}

export function normalizeTuiInitialCommand(initialCommand) {
  if (!initialCommand || typeof initialCommand !== 'string') return '';
  return initialCommand.replace(/\s*#recovery-\d+\s*$/, '').trim();
}

export function isLikelyTuiInitialCommand(initialCommand) {
  return isAgentTuiCommand(normalizeTuiInitialCommand(initialCommand));
}

export function isGrokTuiInitialCommand(initialCommand) {
  return detectAgentTypeFromCommand(normalizeTuiInitialCommand(initialCommand)) === 'grok';
}

/** Block injecting initialCommand that appeared after the PTY was already live. */
export function shouldBlockLateInitialCommandSend({
  hasConnectedOnce = false,
  isRecoveryRelaunch = false,
  snapshotCommand = null,
  currentCommand = null,
} = {}) {
  if (!hasConnectedOnce || isRecoveryRelaunch) return false;
  const snapshot = normalizeTuiInitialCommand(snapshotCommand);
  const current = normalizeTuiInitialCommand(currentCommand);
  return snapshot !== current;
}

/** Grok TUI shortcut bar — input/transcript chrome is ready (no opencode-style footer). */
export function detectGrokTuiReady(text) {
  if (!text || typeof text !== 'string') return false;
  return (
    /Shift\+Tab\s+mode/i.test(text) ||
    /ctrl\+c:cancel/i.test(text) ||
    /user_prompt_submit/i.test(text) ||
    /ctrl\+c\s+cancel/i.test(text) ||
    /esc\s+cancel/i.test(text)
  );
}

/** Grok sets DECSET 1000/1006 on startup and titles the PTY `grok`. */
export function detectGrokSessionFromOutput(text) {
  if (!text || typeof text !== 'string') return false;
  return /\]0;grok\b/i.test(text) || detectGrokTuiReady(text);
}

/**
 * After reload/reattach, OpenCode scroll needs footer-confirmed + wheel passthrough.
 * Scans scrollback when live PTY output has not re-fired detectOpenCodeTuiReady.
 */
export function reconcileOpenCodeTuiWheelReadiness({
  term,
  initialCommand = '',
  tuiSessionActiveRef,
  tuiSessionFooterConfirmedRef,
  setNativeWheelPassthrough,
  assumeTuiIfReattached = false,
} = {}) {
  if (!isOpenCodeLaunchCommand(initialCommand)) return false;
  const footerInBuffer = term ? detectOpenCodeReadyFromTerminalBuffer(term) : false;
  if (!footerInBuffer && !assumeTuiIfReattached) return false;
  if (tuiSessionActiveRef) tuiSessionActiveRef.current = true;
  if (tuiSessionFooterConfirmedRef) tuiSessionFooterConfirmedRef.current = true;
  if (typeof setNativeWheelPassthrough === 'function') {
    setNativeWheelPassthrough(true);
  }
  if (term) {
    prepareActiveTuiTerminalFocus(term, { tuiSessionActive: true });
  }
  return true;
}

/**
 * After reload/reattach/cold first session, Grok scroll needs mouse modes rebound on
 * xterm. Unlike OpenCode, do NOT mark grokTuiReady from launch command alone —
 * early native wheel passthrough without DECSET 1000/1006 swallows the wheel.
 * Scans scrollback when live PTY output has not re-fired detectGrokSessionFromOutput.
 */
export function reconcileGrokTuiWheelReadiness({
  term,
  initialCommand = '',
  tuiSessionActiveRef,
  isGrokSessionRef,
  grokTuiReadyRef,
  setNativeWheelPassthrough,
  assumeTuiIfReattached = false,
} = {}) {
  const isGrok = isGrokTuiInitialCommand(initialCommand) || isGrokLaunchCommand(initialCommand);
  if (!isGrok) return false;

  const readyInBuffer = term ? detectGrokReadyFromTerminalBuffer(term) : false;
  if (!readyInBuffer && !assumeTuiIfReattached) return false;

  if (tuiSessionActiveRef) tuiSessionActiveRef.current = true;
  if (isGrokSessionRef) isGrokSessionRef.current = true;
  // Only promote to native passthrough when chrome is visible in the buffer, or when
  // reattach assumes a live TUI and we re-bind mouse modes below.
  if (grokTuiReadyRef) grokTuiReadyRef.current = true;
  // Grok is inject-only — never flip native passthrough on (first-panel swallow).
  if (typeof setNativeWheelPassthrough === 'function') {
    setNativeWheelPassthrough(false);
  }
  if (term) {
    prepareActiveTuiTerminalFocus(term, { tuiSessionActive: true });
  }
  return true;
}

/** Live grok/OpenCode TUIs scroll via xterm native SGR wheel passthrough once chrome is ready. */
export function shouldPassthroughNativeTuiWheel({
  isGrokSession = false,
  grokTuiReady = false,
  opencodeFooterConfirmed = false,
} = {}) {
  if (isGrokSession) {
    const adapter = getTuiAdapter('grok');
    return adapter.wheelStrategy.passThrough && grokTuiReady;
  }
  const adapter = getTuiAdapter('opencode');
  return adapter.wheelStrategy.passThrough && opencodeFooterConfirmed;
}

export function resolveTerminalWheelScrollPrefer(
  initialCommand,
  { isGrokSession = false, isKimiSession = false, tuiActive = false } = {}
) {
  if (isKimiSession || isKimiLaunchCommand(initialCommand)) {
    return 'page';
  }
  if (isGrokSession || tuiActive) {
    return 'sgr';
  }
  if (isLikelyTuiInitialCommand(initialCommand)) {
    if (isGrokTuiInitialCommand(initialCommand) || isKimiLaunchCommand(initialCommand)) {
      return 'page';
    }
    return 'sgr';
  }
  return 'page';
}

export function shouldInjectGrokWheelSgr(isGrokSession = false, initialCommand = '') {
  return isGrokSession || isGrokTuiInitialCommand(initialCommand);
}

/**
 * Kimi behaves like a normal scrolling terminal (output flows, inline input) — not a
 * fixed-bottom-pane Ink TUI like grok/OpenCode. Wheel scrolls the xterm scrollback
 * locally via term.scrollLines; never inject wheel bytes (SGR/PageUp/PageDown) into the
 * PTY, which Kimi either ignores or routes to the prompt editor.
 */
export function shouldScrollKimiWheelLocally(isKimiSession = false) {
  return Boolean(isKimiSession);
}

/**
 * Agent TUIs that render INLINE (no alternate screen) and do NOT enable mouse
 * tracking (no DECSET 1000/1006). They follow the claude-code convention:
 * output flows into the normal screen buffer + scrollback, input is a bottom
 * prompt. SGR wheel inject is dead for these (bytes ignored by the TUI) —
 * wheel must scroll the xterm viewport locally instead.
 *
 * Alt-screen + mouse TUIs (grok, opencode, agy) stay on the SGR inject path.
 */
const INLINE_SCROLL_AGENT_TYPES = new Set(['kimi', 'qodercli', 'claude', 'codex']);

export function isInlineScrollAgentType(agentType) {
  return INLINE_SCROLL_AGENT_TYPES.has(String(agentType || '').toLowerCase());
}

/**
 * Resolve whether wheel should scroll the xterm viewport locally for this agent.
 * Checks the server-detected agentType (typed launches) and the launch command.
 */
export function shouldScrollAgentWheelLocally(initialCommand, agentType = null) {
  if (isInlineScrollAgentType(agentType)) return true;
  const detected = detectAgentTypeFromCommand(normalizeTuiInitialCommand(initialCommand));
  return isInlineScrollAgentType(detected);
}

/**
 * Inline-scroll agents (kimi, qodercli, claude, codex) must never enter xterm
 * mouse tracking: their TUIs emit DECSET ?1000/?1002/?1003 themselves, and the
 * moment xterm honors them, drags become SGR mouse reports (text selection
 * dies) and the wheel router falls back to PTY inject instead of local
 * viewport scroll. The engine blocks those DECSET set/clear at the parser
 * level (registerCsiHandler '?h'/'?l') when this returns true.
 */
export function shouldBlockInlineAgentMouseModes({
  isKimiLaunch = false,
  kimiReady = false,
  initialCommand = '',
  agentType = null,
} = {}) {
  return Boolean(
    isKimiLaunch || kimiReady || shouldScrollAgentWheelLocally(initialCommand, agentType)
  );
}

/** Keep grok wheel coords inside the transcript pane (Ink chrome owns the bottom rows). */
export function resolveGrokWheelSgrCoords(
  cell,
  term,
  inputZoneRows = TERMINAL_GROK_INPUT_ZONE_ROWS
) {
  const cols = term?.cols || 80;
  const rows = term?.rows || 24;
  const reserved = Math.max(1, Math.min(rows - 1, Math.floor(inputZoneRows)));
  const maxTranscriptRow = Math.max(0, rows - reserved - 1);
  const defaultCol = Math.max(0, Math.floor(cols / 2));
  // Ink transcript scroll is zone-based — anchor Y at transcript center, not pointer row.
  const transcriptCenterRow = Math.max(0, Math.floor(maxTranscriptRow * 0.5));
  const col =
    cell && Number.isInteger(cell.col) ? Math.max(0, Math.min(cols - 1, cell.col)) : defaultCol;
  return { col, row: transcriptCenterRow };
}

/**
 * Grok Ink scroll payload for PTY inject — same SGR 64/65 as OpenCode.
 * Keep pure SGR (no arrow keys): arrows can steal focus in the Grok prompt
 * and made cold-start scroll feel dead while OpenCode (SGR-only) worked.
 */
export function buildGrokWheelScrollPayload(direction, col, row, steps = 1) {
  const normalizedSteps = Math.max(1, Math.min(6, Math.floor(Number(steps) || 1)));
  return buildTerminalWheelSgrSequence(direction, col, row).repeat(normalizedSteps);
}

export const TERMINAL_GROK_INPUT_ZONE_ROWS = 5;

/** Grok shortcut bar + prompt; OpenCode footer/input needs a slightly guard size. */
export function resolveTerminalWheelInputZoneRows({
  isGrokSession = false,
  isKimiSession = false,
} = {}) {
  if (isKimiSession) return TERMINAL_GROK_INPUT_ZONE_ROWS;
  return isGrokSession ? TERMINAL_GROK_INPUT_ZONE_ROWS : TERMINAL_DEFAULT_INPUT_ZONE_ROWS;
}

export const TERMINAL_WHEEL_ARROW_UP_SEQ = '\x1b[A';
export const TERMINAL_WHEEL_ARROW_DOWN_SEQ = '\x1b[B';

export function buildTerminalWheelArrowSequence(direction, steps = 1) {
  const normalizedSteps = Math.max(1, Math.floor(steps));
  const sequence = direction === 'up' ? TERMINAL_WHEEL_ARROW_UP_SEQ : TERMINAL_WHEEL_ARROW_DOWN_SEQ;
  return sequence.repeat(normalizedSteps);
}

/** Ink/OpenCode/grok TUIs scroll transcript with arrows; Page Up/Down is the legacy fallback. */
export function buildTerminalWheelScrollPayload(direction, steps = 1, { prefer = 'arrow' } = {}) {
  const normalizedSteps = Math.max(1, Math.floor(steps));
  if (prefer === 'page') {
    return buildTerminalWheelPageSequence(direction, normalizedSteps);
  }
  if (prefer === 'both') {
    return (
      buildTerminalWheelArrowSequence(direction, normalizedSteps) +
      buildTerminalWheelPageSequence(direction, 1)
    );
  }
  return buildTerminalWheelArrowSequence(direction, normalizedSteps);
}

/** SGR extended mouse wheel (buttons 64/65) — OpenCode/Ink TUIs scroll via this path. */
export function buildTerminalWheelSgrSequence(direction, col, row) {
  const x = Math.max(1, Math.floor(col) + 1);
  const y = Math.max(1, Math.floor(row) + 1);
  const button = direction === 'up' ? 64 : 65;
  // Do not toggle mouse modes here — the TUI already owns ?1000/?1006 and toggling them off
  // after each wheel burst breaks subsequent scroll/click handling.
  return `\x1b[<${button};${x};${y}M`;
}

export function resolveTerminalPointerElement(term, container, shell) {
  return resolveTerminalScreenElement(term, container || shell);
}

export const TERMINAL_WHEEL_FORWARD_FLAG = '__devhubTerminalWheelForward';

export function isForwardedTerminalWheelEvent(event) {
  return Boolean(event?.[TERMINAL_WHEEL_FORWARD_FLAG]);
}

/**
 * True when xterm will convert wheel events into SGR 64/65.
 * After panel deactivate we write DECSET mouse-off into the emulator; dispatchEvent
 * still returns true but no SGR reaches the PTY — callers must fall back to inject.
 * Unknown internals → false (prefer inject; never swallow the wheel).
 */
export function terminalHasActiveMouseReporting(term) {
  try {
    const modes = term?._core?.coreService?.decPrivateModes;
    if (!modes) return false;
    const tracking = modes.mouseTrackingMode;
    if (typeof tracking === 'number') return tracking > 0;
    if (typeof tracking === 'string') return tracking !== 'none' && tracking !== 'NONE';
    if (typeof modes.isMouseTrackingActive === 'boolean') {
      return modes.isMouseTrackingActive;
    }
  } catch {
    // xterm private API may be mid-dispose
  }
  return false;
}

/**
 * xterm only turns wheel into SGR while its textarea/element holds DOM focus.
 * Zed overlay (and other modals) steal focus without clearing mouse modes —
 * native forward would swallow the wheel with no PTY input.
 */
export function terminalHasDomFocus(
  term,
  { documentRef = typeof document !== 'undefined' ? document : null } = {}
) {
  if (!term || !documentRef) return false;
  try {
    const active = documentRef.activeElement;
    if (!active) return false;
    if (term.textarea && active === term.textarea) return true;
    const root = term.element;
    if (root && typeof root.contains === 'function' && root.contains(active)) return true;
  } catch {
    // terminal may be mid-dispose
  }
  return false;
}

/** True only when native wheel→SGR can actually reach the PTY. */
export function terminalCanNativeWheelPassthrough(term, options) {
  return terminalHasActiveMouseReporting(term) && terminalHasDomFocus(term, options);
}

/** Shell capture can starve xterm's wheel listener — forward explicitly for TUI passthrough. */
export function forwardTerminalWheelToXterm(term, event, { onPtyWheelWrite } = {}) {
  const target = term?.element;
  if (!target || !event || typeof WheelEvent === 'undefined') return false;
  if (isForwardedTerminalWheelEvent(event)) return false;
  // Mouse modes off or terminal unfocused (Zed modal) → xterm will not emit SGR.
  if (!terminalCanNativeWheelPassthrough(term)) return false;

  const forwarded = new WheelEvent(event.type, {
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaZ: event.deltaZ,
    deltaMode: event.deltaMode,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    // Do not bubble — shell capture listeners would re-enter and recurse.
    bubbles: false,
    cancelable: true,
  });
  forwarded[TERMINAL_WHEEL_FORWARD_FLAG] = true;

  const dispatched = target.dispatchEvent(forwarded);
  if (dispatched) {
    if (typeof onPtyWheelWrite === 'function') {
      onPtyWheelWrite({ type: 'native-forward' });
    }
  }
  return dispatched;
}

export function refreshTerminalViewport(term) {
  if (
    !term ||
    typeof term.refresh !== 'function' ||
    !Number.isInteger(term.rows) ||
    term.rows <= 0
  ) {
    return false;
  }

  if (!isTerminalRendererReady(term)) return false;

  try {
    term.refresh(0, term.rows - 1);
    return true;
  } catch (error) {
    if (isStaleXtermRendererError(error)) return false;
    throw error;
  }
}

/**
 * Force the canvas/webgl renderer to actually repaint, even when cols/rows are
 * unchanged. `term.resize()` no-ops on identical dims, so a parked-then-shown
 * split sibling whose container preserved its size never re-renders and stays
 * black. A 1-cell nudge (resize to N-1 then back to N) is a real resize both
 * ways, which is exactly what a manual drag does — the only reliable trigger
 * for xterm's canvas bitmap to redraw. No PTY SIGWINCH is sent (xterm.resize
 * does not notify the PTY; that is done separately and we skip it here).
 */
export function forceTerminalViewportRepaint(term) {
  if (!term || typeof term.resize !== 'function') return false;
  if (!isTerminalRendererReady(term)) return false;
  const cols = Number(term.cols ?? 0);
  const rows = Number(term.rows ?? 0);
  if (cols <= 0 || rows <= 0) return false;
  try {
    term._core?._renderService?.clear?.();
    return nudgeTerminalViewportRepaint(term, { kind: 'force' });
  } catch (error) {
    if (isStaleXtermRendererError(error)) return false;
    throw error;
  }
}

/**
 * 1-cell resize nudge + refresh without clearing the render service (less blink).
 * Emits the `terminal-repaint-nudge` perf counter on every executed nudge so the
 * "zero nudges on a clean reveal" SLO is measurable (no-op when perf is off).
 */
export function nudgeTerminalViewportRepaint(term, telemetryDetail) {
  if (!term || typeof term.resize !== 'function') return false;
  if (!isTerminalRendererReady(term)) return false;
  const cols = Number(term.cols ?? 0);
  const rows = Number(term.rows ?? 0);
  if (cols <= 0 || rows <= 0) return false;
  try {
    if (rows > 1) {
      term.resize(cols, rows - 1);
      term.resize(cols, rows);
    } else if (cols > 1) {
      term.resize(cols - 1, rows);
      term.resize(cols, rows);
    } else {
      return false;
    }
    term.refresh(0, term.rows - 1);
    incrementPerfCounter(PERF_COUNTERS.TERMINAL_REPAINT_NUDGE, {
      cols,
      rows,
      kind: telemetryDetail?.kind ?? 'nudge',
    });
    return true;
  } catch (error) {
    if (isStaleXtermRendererError(error)) return false;
    throw error;
  }
}

export function stabilizeTerminalRenderer(term, { clearAtlas = true } = {}) {
  if (!term) return false;

  if (clearAtlas && typeof term.clearTextureAtlas === 'function') {
    term.clearTextureAtlas();
  }

  return refreshTerminalViewport(term);
}

export function isTerminalRendererReady(term) {
  if (!term) return false;

  if (term._core?._isDisposed) return false;
  if (term.element && !term.element.isConnected) return false;

  const renderService = term._core?._renderService;
  if (!renderService) return true;

  const rendererSlot = renderService._renderer;
  if (!rendererSlot?.value) return false;

  const cell = renderService.dimensions?.css?.cell;
  if (cell && (!Number(cell.width) || !Number(cell.height))) return false;

  return true;
}

/**
 * Defensive check for the xterm-webgl addon's underlying WebGL context.
 * The addon registers its own `webglcontextlost` listener, but on some
 * platforms/OS window switches the context is silently lost without firing
 * the event, leaving the canvas black on restore. Reading `addon._gl` is
 * private API, so every access is guarded.
 */
export function isWebglAddonContextLost(addon) {
  if (!addon) return false;
  try {
    const gl = addon._gl;
    if (!gl || typeof gl.isContextLost !== 'function') return false;
    return gl.isContextLost();
  } catch {
    return false;
  }
}

function isStaleXtermRendererError(error) {
  const message = String(error?.message || error || '');
  return (
    message.includes('_renderer') ||
    message.includes('dimensions') ||
    message.includes('RenderService') ||
    message.includes('handleResize') ||
    message.includes('_innerRefresh')
  );
}

// xterm-addon-webgl@0.16.0 keeps `_renderer` (a MutableDisposable) and the
// terminal.onResize listener as separate entries on the addon's internal
// disposable list. When the addon is disposed, the renderer is cleared
// (.value = undefined) BEFORE the resize listener is unregistered. On
// Linux/WebKitGTK the GTK compositor occasionally fires one last
// ResizeObserver / fit() during that window, and the addon's listener crashes
// with `undefined is not an object (evaluating '_this._renderer.value.handleResize')`.
//
// We can't rewrite the addon, but we can replace the live renderer's
// handleResize with a noop right before dispose so a stray resize lands on
// a safe stub instead of an undefined slot. Best-effort: the addon's internal
// shape may evolve, so we guard every access and never throw from here.
function neutralizeWebglAddonForDisposal(addon) {
  if (!addon) return;
  try {
    const renderer = addon._renderer?.value;
    if (renderer && typeof renderer.handleResize === 'function') {
      renderer.handleResize = () => {};
    }
  } catch {
    // ignore — addon internals are private API; if shape changed, skip.
  }
}

/**
 * Centralized WebGL/Canvas attach logic used during terminal boot.
 *
 * Keeping the renderer decision and addon registration in one place makes it
 * easier to reason about lifecycle ordering (create → attach → context-loss
 * handler → dispose) and avoids duplicating fallback logic between cold boot
 * and later reattach paths.
 */
function attachTerminalRendererAddons({
  terminal,
  wantsWebgl,
  wantsCanvas,
  mountCanvasOnInit,
  WebglAddonCtor,
  CanvasAddonCtor,
  panelId,
  webglAddonRef,
  canvasAddonRef,
  setWebglFallback,
  pendingWebglRecoveryRef,
  handleWebglContextLossRef,
  isActivePanel,
  visibleTerminalPanelCount,
}) {
  if (wantsWebgl) {
    if (WebglAddonCtor) {
      try {
        const webglAddon = new WebglAddonCtor();
        webglAddonRef.current = webglAddon;

        if (typeof webglAddon.onContextLoss === 'function') {
          webglAddon.onContextLoss(() => handleWebglContextLossRef.current?.());
        }

        terminal.loadAddon(webglAddon);
        setWebglFallback(null);
        pendingWebglRecoveryRef.current = false;
        cliLog(`RENDER:${panelId}`, 'webgl-attached-on-init', { isActivePanel });
      } catch (err) {
        console.warn(
          `[TTY:${panelId}] xterm-webgl addon failed to register (WebGL context issue or WebKitGTK limitation)`,
          err?.message || err
        );
        setWebglFallback({
          active: true,
          reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_REGISTER_FAILED,
        });
      }
    } else {
      setWebglFallback({
        active: true,
        reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_IMPORT_FAILED,
      });
    }
  } else if (mountCanvasOnInit && CanvasAddonCtor) {
    try {
      const canvasAddon = new CanvasAddonCtor();
      canvasAddonRef.current = canvasAddon;
      terminal.loadAddon(canvasAddon);
      cliLog(`RENDER:${panelId}`, 'canvas-attached-on-init', {
        isActivePanel,
        visibleTerminalPanelCount,
      });
    } catch (err) {
      console.warn(`[TTY:${panelId}] xterm-addon-canvas failed to register`, err?.message || err);
    }
  } else if (wantsCanvas && !mountCanvasOnInit) {
    cliLog(`RENDER:${panelId}`, 'canvas-deferred-dom-on-init', {
      isActivePanel,
      visibleTerminalPanelCount,
    });
  }
}

export const TERMINAL_VIEWPORT_MAX_ROWS = 120;
export const TERMINAL_VIEWPORT_MAX_COLS = 400;
export const TERMINAL_VIEWPORT_MIN_CELL_HEIGHT = 6;
export const TERMINAL_VIEWPORT_MIN_CELL_WIDTH = 4;

export function isPlausibleTerminalCellSize(cellH, cellW) {
  return (
    Number.isFinite(cellH) &&
    Number.isFinite(cellW) &&
    cellH >= TERMINAL_VIEWPORT_MIN_CELL_HEIGHT &&
    cellW >= TERMINAL_VIEWPORT_MIN_CELL_WIDTH
  );
}

export function clampTerminalViewportDimensions(dims) {
  if (!dims) return null;
  return {
    cols: Math.min(TERMINAL_VIEWPORT_MAX_COLS, Math.max(2, Math.floor(dims.cols))),
    rows: Math.min(TERMINAL_VIEWPORT_MAX_ROWS, Math.max(1, Math.floor(dims.rows))),
  };
}

// Horizontal: add one more column when slack remains. Vertical: keep floored rows
// unless clip cost beats slack — fillSlack on rows clips partial lines → rayitas.
function proposeTerminalAxisDimension({ available, cellSize, minValue, fillSlack = false }) {
  const avail = Number(available);
  const cell = Number(cellSize);
  if (!Number.isFinite(avail) || avail <= 0 || !Number.isFinite(cell) || cell <= 0) {
    return minValue;
  }

  const base = Math.max(minValue, Math.floor(avail / cell));
  const slack = avail - base * cell;
  if (slack <= 0) return base;
  if (fillSlack) return base + 1;

  const expanded = base + 1;
  const clip = expanded * cell - avail;
  return clip < slack ? expanded : base;
}

export function resolveTerminalHorizontalAvailWidth(rect, term) {
  const width = Number(rect?.width ?? 0);
  if (width <= 0) return 0;

  const viewport = term?._core?.viewport;
  const scrollBarW = Number(viewport?.scrollBarWidth ?? 0);
  if (scrollBarW <= 0) return width;

  const scrollBarVisible =
    viewport?.scrollBarVisible?.value ??
    viewport?.scrollBarVisible ??
    viewport?.scrollBarHasVisible ??
    false;

  return scrollBarVisible ? Math.max(0, width - scrollBarW) : width;
}

export function proposeTerminalViewportDimensions({ container, fitAddon, term }) {
  if (!container || !fitAddon || !term) return null;
  if (!isTerminalRendererReady(term)) return null;

  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const cell = term?._core?._renderService?.dimensions?.css?.cell;
  const cellH = Number(cell?.height ?? 0);
  const cellW = Number(cell?.width ?? 0);
  if (!isPlausibleTerminalCellSize(cellH, cellW)) {
    const fallback =
      typeof fitAddon.proposeDimensions === 'function' ? fitAddon.proposeDimensions() : null;
    if (!fallback || !Number.isFinite(fallback.cols) || !Number.isFinite(fallback.rows)) {
      return null;
    }
    return clampTerminalViewportDimensions({
      cols: Math.max(2, Math.floor(fallback.cols)),
      rows: Math.max(1, Math.floor(fallback.rows)),
    });
  }

  const availW = resolveTerminalHorizontalAvailWidth(rect, term);
  const availH = rect.height;
  const cols = proposeTerminalAxisDimension({
    available: availW,
    cellSize: cellW,
    minValue: 2,
    fillSlack: true,
  });
  const rows = proposeTerminalAxisDimension({
    available: availH,
    cellSize: cellH,
    minValue: 1,
    fillSlack: false,
  });

  return clampTerminalViewportDimensions({ cols, rows });
}

/** True when the fitted grid fills too little of the container — defer WS until refit. */
export function isTerminalViewportUndersized({ containerRect, term, minFillRatio = 0.72 } = {}) {
  const height = Number(containerRect?.height ?? 0);
  const rows = Number(term?.rows ?? 0);
  const cellH = Number(term?._core?._renderService?.dimensions?.css?.cell?.height ?? 0);
  if (height <= 0 || rows <= 0 || cellH <= 0) return true;
  return rows * cellH < height * minFillRatio;
}

export function shouldDeferTerminalConnectUntilViewportFitted({
  ready = false,
  fitWorked = false,
  containerRect = null,
  term = null,
  hasConnectedOnce = false,
  isVisibleInLayout = false,
} = {}) {
  if (!ready || !fitWorked || !term) return true;
  if (hasConnectedOnce) return false;
  // Visible panels: connect as soon as the container has non-degenerate
  // dimensions — the fine fit arrives via resize. Hidden/degenerate panels
  // keep deferring until the fitted grid fills the viewport (fill ratio).
  if (
    isVisibleInLayout &&
    Number(containerRect?.width ?? 0) > 0 &&
    Number(containerRect?.height ?? 0) > 0
  ) {
    return false;
  }
  return isTerminalViewportUndersized({ containerRect, term });
}

export function fitTerminalViewport({
  container,
  fitAddon,
  term,
  socket,
  websocketOpenState = WebSocket.OPEN,
  clearAtlas = true,
  lastPtySizeRef = null,
  skipPtyNotify = false,
  source = 'fit-viewport',
  telemetryDetail = null,
}) {
  if (!container || !fitAddon || !term) return false;
  if (!isTerminalRendererReady(term)) return false;

  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  try {
    const dims = proposeTerminalViewportDimensions({ container, fitAddon, term });
    if (dims && typeof term.resize === 'function') {
      if (term.cols !== dims.cols || term.rows !== dims.rows) {
        term._core?._renderService?.clear?.();
        term.resize(dims.cols, dims.rows);
      }
    } else if (dims) {
      fitAddon.fit();
    } else {
      fitAddon.fit();
    }
  } catch (error) {
    if (isStaleXtermRendererError(error)) return false;
    throw error;
  }
  stabilizeTerminalRenderer(term, { clearAtlas });

  const cols = Number(term.cols ?? 0);
  const rows = Number(term.rows ?? 0);
  const unchanged =
    lastPtySizeRef &&
    Number(lastPtySizeRef.cols) === cols &&
    Number(lastPtySizeRef.rows) === rows &&
    cols > 0 &&
    rows > 0;

  const ptyNotifiable =
    !skipPtyNotify && socket?.readyState === websocketOpenState && cols > 0 && rows > 0;

  if (ptyNotifiable) {
    // Telemetry covers both real sends and zero-delta suppressions: the
    // `redundant` detail flag splits them into the redundant counter.
    trackPtyResizeSent({ cols, rows, lastPtySizeRef, source, telemetryDetail });
  }

  if (ptyNotifiable && !unchanged) {
    socket.send(
      JSON.stringify({
        type: 'resize',
        cols,
        rows,
      })
    );
    if (lastPtySizeRef) {
      lastPtySizeRef.cols = cols;
      lastPtySizeRef.rows = rows;
    }
  }

  return true;
}

export function buildTerminalViewportDiagnosticPayload({
  reason,
  containerRect,
  term,
  documentVisibilityState,
  connectionState,
  transport,
  devicePixelRatio,
  requestedRendererMode,
  effectiveRendererMode,
  isActivePanel = false,
  isVisibleInLayout = true,
  webglAttached = false,
  webglFallbackReason = null,
  pendingWebglRecovery = false,
}) {
  const width = Number(containerRect?.width ?? 0);
  const height = Number(containerRect?.height ?? 0);

  return {
    reason,
    width,
    height,
    cols: Number(term?.cols ?? 0),
    rows: Number(term?.rows ?? 0),
    visibility: documentVisibilityState || 'unknown',
    connectionState: connectionState || 'unknown',
    transport: transport || 'unknown',
    dpr: Number(devicePixelRatio ?? 1),
    zeroSized: width <= 0 || height <= 0,
    requestedRendererMode: requestedRendererMode || 'xterm',
    effectiveRendererMode: effectiveRendererMode || 'xterm',
    isActivePanel: Boolean(isActivePanel),
    isVisibleInLayout: Boolean(isVisibleInLayout),
    webglAttached: Boolean(webglAttached),
    webglFallbackReason: webglFallbackReason || null,
    pendingWebglRecovery: Boolean(pendingWebglRecovery),
  };
}

export function shouldLogTerminalViewportDiagnostic(previousSnapshot, nextSnapshot) {
  if (!nextSnapshot) return false;
  if (!previousSnapshot) return true;

  return JSON.stringify(previousSnapshot) !== JSON.stringify(nextSnapshot);
}

export function createTerminalViewportDiagnosticLogger({
  id,
  cliLog: logFn,
  lastSnapshotRef,
  getSnapshot,
}) {
  return (reason) => {
    const snapshot = getSnapshot(reason);

    if (!shouldLogTerminalViewportDiagnostic(lastSnapshotRef.current, snapshot)) {
      return;
    }

    lastSnapshotRef.current = snapshot;
    logFn(`CLIENT:${id}`, 'viewport diagnostic', snapshot);
  };
}

export function resolveTerminalConnectionCloseState(previousState, didReceiveProcessExit) {
  if (didReceiveProcessExit || previousState === 'terminated') {
    return 'terminated';
  }

  return previousState === 'error' ? 'error' : 'disconnected';
}

/**
 * Whether the panel should schedule exponential-backoff reconnect.
 *
 * Historically gated on autoFocus only (focused panel). Split siblings stayed
 * dead after OS sleep until Ctrl+R. When `isVisibleInLayout` is true we also
 * allow reconnect so visible inactive splits recover without stealing focus.
 * Hidden workspace panels still skip — they reconnect when shown (effect re-runs).
 *
 * 4th arg accepts either a boolean (legacy isVisibleInLayout) or an options bag.
 */
export function shouldAutoReconnectTerminal(
  connectionState,
  autoFocus,
  initError = null,
  isVisibleInLayoutOrOptions = false
) {
  if (initError) return false;
  const isVisibleInLayout =
    typeof isVisibleInLayoutOrOptions === 'object' && isVisibleInLayoutOrOptions !== null
      ? Boolean(isVisibleInLayoutOrOptions.isVisibleInLayout)
      : Boolean(isVisibleInLayoutOrOptions);
  if (!autoFocus && !isVisibleInLayout) return false;
  return connectionState === 'disconnected' || connectionState === 'error';
}

/**
 * OS resume (visibility/focus/pageshow) transport recovery.
 * Separate from viewport/WebGL recovery so workspace-switch paths stay unchanged.
 *
 * Reconnect when the panel is visible in layout and either:
 * - connectionState is disconnected/error, or
 * - we had a live session but the socket is no longer OPEN (half-open after sleep).
 *
 * Never touches terminated/agent-exited/connecting/idle first-boot paths.
 */
export function shouldReconnectTerminalOnOsResume({
  connectionState = 'idle',
  isVisibleInLayout = false,
  initError = null,
  sessionClosing = false,
  hasConnectedOnce = false,
  socketReadyState = null,
  websocketOpenState = typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1,
} = {}) {
  if (sessionClosing || initError || !isVisibleInLayout) return false;
  if (!hasConnectedOnce) return false;
  if (
    connectionState === 'connecting' ||
    connectionState === 'terminated' ||
    connectionState === 'agent-exited' ||
    connectionState === 'suspended' ||
    connectionState === 'idle'
  ) {
    return false;
  }
  if (connectionState === 'disconnected' || connectionState === 'error') return true;
  // Half-open / dropped transport while UI still thinks we are connected.
  if (connectionState === 'connected') {
    if (socketReadyState == null) return true;
    if (socketReadyState !== websocketOpenState) return true;
  }
  return false;
}

export function getClipboardApi() {
  return globalThis?.navigator?.clipboard || null;
}

/**
 * xterm joins selected buffer rows with CRLF on Windows. Grok and other TUIs can
 * treat each CR/LF as a separate submit when that text is pasted back. LF-only
 * matches what most native terminals put on the system clipboard.
 */
export function normalizeTerminalSelectionForClipboard(text) {
  if (typeof text !== 'string' || text.length === 0) return text;
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** True when clipboard text contains line breaks (multi-line paste). */
export function isMultilineTerminalPaste(text) {
  return typeof text === 'string' && /[\r\n]/.test(text);
}

/** Bracketed paste markers — insert as one edit buffer (native terminal behavior). */
export const TERMINAL_BRACKETED_PASTE_START = '\x1b[200~';
export const TERMINAL_BRACKETED_PASTE_END = '\x1b[201~';

/**
 * Agent TUIs (Grok, OpenCode, Kimi) treat raw CR/LF as submit when pasted via PTY.
 * Bracketed paste inserts the whole clipboard as one edit buffer.
 */
export function shouldBracketTerminalTextPaste(lifecycleRefs, text, initialCommand) {
  if (!isMultilineTerminalPaste(text)) return false;
  if (isGrokTuiInitialCommand(initialCommand)) return true;
  if (isLikelyTuiInitialCommand(initialCommand)) return true;
  const lifecycle = lifecycleRefs?.current;
  if (!lifecycle) return true;
  if (lifecycle.isGrokSessionRef?.current === true || lifecycle.grokTuiReadyRef?.current === true) {
    return true;
  }
  if (lifecycle.kimiReadyNotifiedRef?.current === true) return true;
  if (lifecycle.tuiSessionActiveRef?.current === true) return true;
  // Prefer bracketed paste for multi-line when session hints are incomplete.
  return true;
}

export function wrapTerminalBracketedPaste(text) {
  if (typeof text !== 'string') return text;
  return `${TERMINAL_BRACKETED_PASTE_START}${text}${TERMINAL_BRACKETED_PASTE_END}`;
}

export function formatTerminalPastePayload(text, lifecycleRefs, initialCommand) {
  const normalized = normalizeTerminalSelectionForClipboard(text);
  if (shouldBracketTerminalTextPaste(lifecycleRefs, normalized, initialCommand)) {
    return wrapTerminalBracketedPaste(normalized);
  }
  return normalized;
}

export function resolveTerminalClipboardShortcut(event) {
  if (!event || event.altKey) return null;

  const key = String(event.key || '');
  const normalizedKey = key.length === 1 ? key.toLowerCase() : key;

  if (event.ctrlKey) {
    // Linux terminal semantics:
    // Ctrl+Shift+C → copy
    if (event.shiftKey && normalizedKey === 'c') return 'copy';
    // Ctrl+V and Ctrl+Shift+V → paste
    // Accept both so external transcription/voice apps that simulate Ctrl+V
    // can paste into xterm/PTY terminals, not only into native VTE.
    if (normalizedKey === 'v') return 'paste';
  }

  if (!event.ctrlKey && event.shiftKey && normalizedKey === 'Insert') {
    return 'paste';
  }

  return null;
}

/** Send clipboard text to the PTY as raw input (avoids xterm bracketed-paste breaking TUIs). */
export function sendTerminalPasteInput({
  socket,
  transport = 'json',
  text,
  websocketOpenState = WebSocket.OPEN,
  onPtyWheelWrite,
}) {
  if (!socket || socket.readyState !== websocketOpenState) return false;
  if (typeof text !== 'string' || text.length === 0) return false;

  if (transport === 'raw') {
    socket.send(text);
  } else {
    socket.send(JSON.stringify({ type: 'input', data: text }));
  }

  // eslint-disable-next-line no-control-regex
  if (/\x1b\[<(?:64|65)/.test(text)) {
    if (typeof onPtyWheelWrite === 'function') {
      onPtyWheelWrite({ type: 'sgr-paste', text });
    }
  }

  return true;
}

/** Phased fit+resize burst after split/workspace layout settles. */
export function scheduleTerminalViewportSyncBurst(runSync, { extraDelaysMs = [180, 340] } = {}) {
  if (typeof runSync !== 'function') return () => {};

  runSync('immediate');

  let raf2 = null;
  const raf1 = requestAnimationFrame(() => {
    raf2 = requestAnimationFrame(() => runSync('raf'));
  });
  const timers = extraDelaysMs.map((delayMs) =>
    setTimeout(() => runSync(`delay-${delayMs}`), delayMs)
  );

  return () => {
    cancelAnimationFrame(raf1);
    if (raf2 !== null) cancelAnimationFrame(raf2);
    timers.forEach((timerId) => clearTimeout(timerId));
  };
}

export function getTerminalRuntimePlatform(explicitPlatform) {
  if (explicitPlatform) return String(explicitPlatform).toLowerCase();
  if (typeof navigator !== 'undefined') {
    return String(
      navigator.userAgentData?.platform || navigator.platform || 'unknown'
    ).toLowerCase();
  }
  return 'unknown';
}

export function getTerminalViewportScrollOffset(term) {
  const activeBuffer = term?.buffer?.active;
  const viewportY = activeBuffer?.viewportY ?? activeBuffer?.ydisp;
  return Number.isInteger(viewportY) ? viewportY : null;
}

export function isTerminalViewportNearBottom(term, threshold = 2) {
  const activeBuffer = term?.buffer?.active;
  if (!activeBuffer) return false;
  if (activeBuffer.type === 'alternate') return true;
  const baseY = activeBuffer.baseY;
  const viewportY = activeBuffer.viewportY ?? activeBuffer.ydisp;
  if (!Number.isInteger(baseY) || !Number.isInteger(viewportY)) return false;
  return baseY - viewportY <= threshold;
}

export const TERMINAL_PAGE_UP_SEQ = '\x1b[5~';
export const TERMINAL_PAGE_DOWN_SEQ = '\x1b[6~';

/** Shift+wheel always uses xterm scrollback (shell and TUI). */
export function shouldUseTerminalScrollbackWheel(event) {
  return Boolean(event?.shiftKey);
}

/** Only Ink/OpenCode/grok TUIs need wheel bytes injected into the PTY. */
export function shouldInjectTerminalWheelIntoPty(isTuiSession = false) {
  return Boolean(isTuiSession);
}

/** Scroll the xterm viewport locally — never send escape sequences to a plain shell. */
export function scrollTerminalViewport(
  term,
  direction,
  deltaY,
  { lineHeight = 40, linesPerStep = 3, maxSteps = Infinity } = {}
) {
  if (!term || typeof term.scrollLines !== 'function') return false;
  const rawSteps = resolveTerminalWheelPageSteps(deltaY, { lineHeight });
  if (!rawSteps) return false;
  const steps = Math.min(maxSteps, rawSteps);
  if (!steps) return false;
  const lines = steps * linesPerStep;
  term.scrollLines(direction === 'up' ? -lines : lines);
  return true;
}

export function resolveTerminalWheelScrollDirection(deltaY) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return null;
  return deltaY < 0 ? 'up' : 'down';
}

export function resolveTerminalWheelPageSteps(deltaY, { lineHeight = 40 } = {}) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
  return Math.max(1, Math.round(Math.abs(deltaY) / lineHeight));
}

export function buildTerminalWheelPageSequence(direction, steps = 1) {
  const normalizedSteps = Math.max(1, Math.floor(steps));
  const sequence = direction === 'up' ? TERMINAL_PAGE_UP_SEQ : TERMINAL_PAGE_DOWN_SEQ;
  return sequence.repeat(normalizedSteps);
}

export const TERMINAL_DEFAULT_INPUT_ZONE_ROWS = 2;

export function resolveTerminalScreenElement(term, element) {
  return (
    term?._core?.screenElement ||
    term?.element?.querySelector?.('.xterm-screen') ||
    element ||
    term?.element ||
    null
  );
}

export function resolveTerminalCellFromPointer(term, element, clientX, clientY) {
  if (!term) return null;

  const screenElement = resolveTerminalScreenElement(term, element);
  const mouseService = term?._core?._mouseService;
  if (screenElement && mouseService && typeof mouseService.getMouseReportCoords === 'function') {
    const pos = mouseService.getMouseReportCoords({ clientX, clientY }, screenElement);
    if (pos && Number.isInteger(pos.col) && Number.isInteger(pos.row)) {
      return { col: pos.col, row: pos.row };
    }
  }

  if (!screenElement) return null;
  const rect = screenElement.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const cols = term.cols;
  const rows = term.rows;
  if (!Number.isInteger(cols) || cols <= 0 || !Number.isInteger(rows) || rows <= 0) {
    return null;
  }

  const cell = term?._core?._renderService?.dimensions?.css?.cell;
  const cellW = Number(cell?.width ?? 0);
  const cellH = Number(cell?.height ?? 0);
  const relX = clientX - rect.left;
  const relY = clientY - rect.top;

  if (cellW > 0 && cellH > 0) {
    const canvas = term?._core?._renderService?.dimensions?.css?.canvas;
    const maxX = Math.max(0, Number(canvas?.width ?? rect.width) - 1);
    const maxY = Math.max(0, Number(canvas?.height ?? rect.height) - 1);
    const x = Math.min(Math.max(relX, 0), maxX);
    const y = Math.min(Math.max(relY, 0), maxY);
    return {
      col: Math.min(cols - 1, Math.max(0, Math.floor(x / cellW))),
      row: Math.min(rows - 1, Math.max(0, Math.floor(y / cellH))),
    };
  }

  const col = Math.min(cols - 1, Math.max(0, Math.floor((relX / rect.width) * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor((relY / rect.height) * rows)));
  return { col, row };
}

export function isTerminalTranscriptCell(
  row,
  rows,
  inputZoneRows = TERMINAL_DEFAULT_INPUT_ZONE_ROWS
) {
  if (!Number.isInteger(row) || !Number.isInteger(rows) || rows <= 0) return true;
  const reserved = Math.max(1, Math.min(rows - 1, Math.floor(inputZoneRows)));
  return row < rows - reserved;
}

/**
 * Synthetic SGR click for TUI inject path (when native DECSET is cold/unfocused).
 * Press + release; do not toggle mouse modes off — same lesson as wheel SGR
 * (toggling ?1000l after each burst breaks the next click/scroll).
 */
export function buildTerminalMousePressSequence(col, row) {
  const x = Math.max(1, Math.floor(col) + 1);
  const y = Math.max(1, Math.floor(row) + 1);
  return `\x1b[<0;${x};${y}M\x1b[<0;${x};${y}m`;
}

/** Movement past this cancels deferred TUI transcript click injection (selection drag). */
export const TERMINAL_TUI_CLICK_DRAG_THRESHOLD_PX = 4;

/** Shift/alt/meta or non-primary button → xterm/OS selection, not TUI click. */
export function shouldSkipTuiMouseInjectionForSelectionGesture(event) {
  if (!event) return true;
  if (typeof event.button === 'number' && event.button !== 0) return true;
  if (event.shiftKey || event.altKey || event.metaKey) return true;
  return false;
}

export function terminalHasActiveSelection(term) {
  if (!term) return false;
  try {
    if (typeof term.hasSelection === 'function' && term.hasSelection()) return true;
    if (typeof term.getSelection === 'function') {
      return Boolean(String(term.getSelection() || '').length);
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * prepareActiveTuiTerminalFocus that does not re-enable TUI mouse modes while the
 * user is selecting text (or still holding the pointer after panel activate).
 * Returns a cleanup that cancels a pending deferred enable.
 */
export function prepareActiveTuiTerminalFocusRespectingSelection(
  term,
  { tuiSessionActive = false, deferMouseUntilPointerUp = false } = {},
  { documentRef = typeof document !== 'undefined' ? document : null } = {}
) {
  if (!term || typeof term.write !== 'function') return () => {};

  const writeFocusSilence = () => {
    try {
      term.write(TERMINAL_DISABLE_FOCUS_REPORTING_SEQ);
    } catch {
      // terminal may be mid-dispose
    }
  };
  const writeMouse = (enable) => {
    try {
      term.write(
        enable ? TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ : TERMINAL_DISABLE_MOUSE_REPORTING_SEQ
      );
    } catch {
      // terminal may be mid-dispose
    }
  };

  writeFocusSilence();

  if (!tuiSessionActive) {
    writeMouse(false);
    return () => {};
  }

  const shouldDefer = Boolean(deferMouseUntilPointerUp) || terminalHasActiveSelection(term);
  if (!shouldDefer) {
    writeMouse(true);
    return () => {};
  }

  let done = false;
  let selectionDisposable = null;
  let safetyTimer = null;

  const enable = () => {
    if (done) return;
    if (terminalHasActiveSelection(term)) return;
    done = true;
    cleanup();
    writeMouse(true);
  };

  const onPointerUp = () => {
    // Let xterm finalize selection from this gesture before re-binding mouse modes.
    setTimeout(enable, 0);
  };

  const cleanup = () => {
    documentRef?.removeEventListener?.('mouseup', onPointerUp, true);
    selectionDisposable?.dispose?.();
    selectionDisposable = null;
    if (safetyTimer != null) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
  };

  documentRef?.addEventListener?.('mouseup', onPointerUp, true);
  if (typeof term.onSelectionChange === 'function') {
    selectionDisposable = term.onSelectionChange(() => {
      if (!terminalHasActiveSelection(term)) enable();
    });
  }
  // ponytail: leak ceiling if mouseup never fires (programmatic activate); upgrade = pointer capture
  safetyTimer = setTimeout(() => {
    if (!terminalHasActiveSelection(term)) enable();
  }, 10000);

  return cleanup;
}

/**
 * Inject TUI transcript mouse press only for a short click (mouseup without drag).
 * Skips selection gestures (Shift/alt/meta / non-primary).
 */
export function scheduleTuiTranscriptMouseInjection({
  event,
  cell,
  eligible = false,
  inject,
  dragThresholdPx = TERMINAL_TUI_CLICK_DRAG_THRESHOLD_PX,
  windowRef = typeof window !== 'undefined' ? window : null,
} = {}) {
  if (!eligible || !cell || typeof inject !== 'function') return () => {};
  if (shouldSkipTuiMouseInjectionForSelectionGesture(event)) return () => {};

  if (!windowRef?.addEventListener) {
    inject(cell);
    return () => {};
  }

  const startX = Number(event?.clientX) || 0;
  const startY = Number(event?.clientY) || 0;
  let dragged = false;

  const onMove = (e) => {
    const dx = (Number(e?.clientX) || 0) - startX;
    const dy = (Number(e?.clientY) || 0) - startY;
    if (Math.hypot(dx, dy) > dragThresholdPx) dragged = true;
  };
  const onUp = () => {
    cleanup();
    if (!dragged) inject(cell);
  };
  const cleanup = () => {
    windowRef.removeEventListener('mousemove', onMove, true);
    windowRef.removeEventListener('mouseup', onUp, true);
  };

  windowRef.addEventListener('mousemove', onMove, true);
  windowRef.addEventListener('mouseup', onUp, true);
  return cleanup;
}

export function shouldRouteWheelToTranscript({
  shiftKey = false,
  cell,
  rows,
  lastPointerZone,
  inputZoneRows = TERMINAL_DEFAULT_INPUT_ZONE_ROWS,
} = {}) {
  if (shiftKey) return false;
  if (cell && Number.isInteger(rows)) {
    return isTerminalTranscriptCell(cell.row, rows, inputZoneRows);
  }
  return lastPointerZone === 'transcript';
}

export function restoreTerminalViewportScroll(term, targetViewportY) {
  if (!term || typeof term.scrollToLine !== 'function') return false;
  if (!Number.isInteger(targetViewportY)) return false;

  const buffer = term?.buffer?.active;
  if (!buffer) return false;

  const totalLines = buffer.length;
  const rows = term.rows;
  let clampedY = targetViewportY;
  if (
    typeof totalLines === 'number' &&
    typeof rows === 'number' &&
    !Number.isNaN(totalLines) &&
    !Number.isNaN(rows)
  ) {
    const maxY = Math.max(0, totalLines - rows);
    clampedY = Math.max(0, Math.min(targetViewportY, maxY));
  }

  // Opt-in diagnostic (devhubTuiPointerDebug=1): who scrolls the viewport while
  // the user has an active selection (selection-killer investigation).
  if (isTuiPointerDebugEnabled()) {
    logTuiPointerDebug('tui-scroll', {
      path: 'restore-viewport-scroll',
      extra: {
        targetViewportY: clampedY,
        viewportY: buffer.viewportY ?? null,
        baseY: buffer.baseY ?? null,
        bufferType: buffer.type ?? null,
        hadSelection: term?.hasSelection?.() ?? null,
        stack: String(new Error('scroll-trace').stack).split('\n').slice(1, 7).join(' | '),
      },
    });
  }

  try {
    term.scrollToLine(clampedY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reveal scroll integrity (terminal-load-performance PR6): after a workspace-show
 * fit/repaint, a user reading scrollback must land back on the viewportY captured
 * before the reveal. Users at the bottom stay at the bottom; unchanged viewports
 * are left alone (no counter).
 */
export function restoreTerminalViewportAfterReveal({
  term,
  viewportYBefore,
  wasNearBottom,
  panelId,
}) {
  if (!term || !Number.isInteger(viewportYBefore) || wasNearBottom) return false;
  const viewportYAfter = getTerminalViewportScrollOffset(term);
  if (!Number.isInteger(viewportYAfter) || viewportYAfter === viewportYBefore) return false;
  const restored = restoreTerminalViewportScroll(term, viewportYBefore);
  if (restored) {
    incrementPerfCounter(PERF_COUNTERS.TERMINAL_SCROLL_JUMP, {
      panelId: panelId ?? null,
      from: viewportYAfter,
      to: viewportYBefore,
      restored: true,
    });
  }
  return restored;
}

export function getNativeTerminalBounds(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect) return null;

  const width = Number(rect.width || 0);
  const height = Number(rect.height || 0);

  if (width <= 0 || height <= 0) return null;

  const browserWindow = typeof window !== 'undefined' ? window : null;
  if (browserWindow) {
    const viewportWidth = Number(browserWindow.innerWidth || 0);
    const viewportHeight = Number(browserWindow.innerHeight || 0);
    const left = Number(rect.left || 0);
    const top = Number(rect.top || 0);
    const right = Number(rect.right ?? left + width);
    const bottom = Number(rect.bottom ?? top + height);

    if (
      (viewportWidth > 0 && (right <= 0 || left >= viewportWidth)) ||
      (viewportHeight > 0 && (bottom <= 0 || top >= viewportHeight))
    ) {
      return null;
    }
  }

  const INSET = 1;
  return {
    x: Number(rect.left || 0) + INSET,
    y: Number(rect.top || 0) + INSET,
    width: Math.max(0, width - INSET * 2),
    height: Math.max(0, height - INSET * 2),
  };
}

export function shouldRunTerminalViewportReactivation({
  isActivePanel,
  isVisibleInLayout = true,
  documentVisibilityState,
}) {
  if (documentVisibilityState === 'hidden') return false;
  return isActivePanel && isVisibleInLayout;
}

/** Panel clicks should not rerun full WebGL/viewport recovery when already active. */
export function shouldRunPanelClickViewportRecovery(isAlreadyActivePanel) {
  return !isAlreadyActivePanel;
}

/** Heavy viewport/WebGL recovery runs only on false→true panel activation edges. */
export function shouldRecoverPanelOnActivation(previousActive, nextActive) {
  return Boolean(nextActive) && !previousActive;
}

/** Keep WebGL atlases on split siblings; only clear when attaching WebGL for the first time. */
export function shouldClearWebglAtlasOnPanelActivation(hasWebglAttached) {
  return !hasWebglAttached;
}

/** Skip fit/resize churn when a split sibling already has the correct grid and GPU renderer. */
export function shouldSkipReactivateViewportOnPanelActivation({
  hadGpuRenderer = false,
  clearAtlas = false,
  term = null,
  container = null,
  fitAddon = null,
} = {}) {
  if (!hadGpuRenderer || clearAtlas || !term || !container || !fitAddon) return false;
  const dims = proposeTerminalViewportDimensions({ container, fitAddon, term });
  if (!dims) return false;
  return term.cols === dims.cols && term.rows === dims.rows;
}

/** WebGL attach/reattach is only allowed when the operational renderer is xterm-webgl. */
export function shouldAttachWebglRenderer({ operationalRendererMode }) {
  return operationalRendererMode === 'xterm-webgl';
}

/** Phase 5 terminal-engine-v2: after WebGL context loss, stay on DOM permanently. */
export function shouldBlockV2WebglRecovery({ isEngineV2, webglFallback }) {
  return isEngineV2 && webglFallback?.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_LOST;
}

/** Phase 6 terminal-engine-v2: v2 panels never use legacy survivor recovery. */
export function shouldUseLegacySurvivorRecovery(isEngineV2) {
  return usesLegacyTerminalSurvivorRecovery(isEngineV2);
}

/**
 * True when `reason` is an OS-resume focus/visibility event (Alt+Tab back to the
 * app, window focus, pageshow). These fire as a storm (visibilitychange + focus +
 * pageshow within ~50 ms) and — unlike workspace/window switches — do NOT hide the
 * terminal in the layout, so the GPU bitmap is still valid and no disruptive
 * fit/atlas-clear/resize-nudge is required.
 */
export function isOsResumeFocusReason(reason = '') {
  const normalizedReason = String(reason);
  return (
    normalizedReason === 'visibility-visible' ||
    normalizedReason === 'window-focus' ||
    normalizedReason === 'pageshow'
  );
}

/**
 * Single-panel WebGL workspaces should not refit/resize on tab switch when the
 * PTY grid is already correct — only reattach the GPU addon if it was released
 * while the shell was hidden.
 */
export function shouldFreezeSingleWebglViewportOnWorkspaceShow({
  reason = '',
  sizeUnchanged = false,
  operationalRendererMode = 'xterm',
  visibleTerminalPanelCount = 1,
  proposedDimsMatch = true,
} = {}) {
  if (!sizeUnchanged || !proposedDimsMatch) return false;
  if (visibleTerminalPanelCount > TERMINAL_SPLIT_WEBGL_PANEL_LIMIT) return false;
  if (!shouldAttachWebglRenderer({ operationalRendererMode })) return false;

  const normalizedReason = String(reason);
  if (isWorkspaceSurvivorRecoverLayoutReason(normalizedReason)) return false;
  if (normalizedReason.includes('workspace-switch')) return true;
  if (normalizedReason.includes('workspace-window')) return true;
  if (
    normalizedReason === 'workspace-show-layout' ||
    normalizedReason === 'workspace-show-raf' ||
    normalizedReason === 'workspace-show-visible'
  ) {
    return true;
  }
  if (normalizedReason.startsWith('layout-settled-workspace-switch-')) return true;
  if (normalizedReason.startsWith('layout-settled-workspace-window-')) return true;
  // OS-resume focus/visibility with unchanged geometry: the WebGL bitmap is still
  // valid, so take the light freeze path instead of the heavy fit+atlas-clear pass.
  if (isOsResumeFocusReason(normalizedReason)) return true;
  return false;
}

/** Canvas 2D attach/reattach is used for visible split siblings (all panels). */
export function shouldAttachCanvasRenderer({ operationalRendererMode }) {
  return operationalRendererMode === 'xterm-canvas';
}

/** Visible panels with xterm-canvas operational mode all mount Canvas (including inactive split siblings). */
export function shouldMountCanvasAddon({
  operationalRendererMode,
  isActivePanel: _isActivePanel = true,
  isVisibleInLayout = true,
  visibleTerminalPanelCount = 1,
} = {}) {
  if (!shouldAttachCanvasRenderer({ operationalRendererMode })) return false;
  // ponytail: split workspaces keep canvas alive while the tab is opacity-hidden (Option B)
  if (!isVisibleInLayout && visibleTerminalPanelCount <= 1) return false;
  // Releasing canvas on inactive siblings drops to DOM and corrupts alternate-screen TUIs
  // (horizontal seam artifacts). Canvas 2D has no WebGL-style single-context limit.
  return true;
}

export function shouldUseGpuTerminalRenderer({ operationalRendererMode }) {
  return (
    shouldAttachWebglRenderer({ operationalRendererMode }) ||
    shouldAttachCanvasRenderer({ operationalRendererMode })
  );
}

/**
 * True when a GPU renderer addon should be attached but isn't. Uses the addon REF
 * (not isTerminalRendererReady) as the source of truth: after a workspace hide the
 * addon is disposed and *AddonRef.current is null, yet RenderService._renderer.value
 * still holds the disposed renderer object, so isTerminalRendererReady() returns
 * true and forceTerminalViewportRepaint() "succeeds" without painting. The ref is
 * the only truthful signal that a reattach is needed to clear the black panel.
 */
export function needsGpuRendererReattach({
  operationalRendererMode,
  webglAddon = null,
  canvasAddon = null,
} = {}) {
  if (shouldAttachWebglRenderer({ operationalRendererMode })) return !webglAddon;
  if (shouldAttachCanvasRenderer({ operationalRendererMode })) return !canvasAddon;
  return false;
}

/**
 * Option B pure visibility reveal: the GPU addon stayed attached while the shell
 * was visibility:hidden. The compositor already holds a valid framebuffer — any
 * forceTerminalViewportRepaint (clear + 1-cell nudge) causes the single blink users
 * see after an otherwise instant tab switch.
 */
export function shouldSkipGpuVisibilityReveal({
  reason = '',
  noGpuRecoveryPending = false,
  sizeUnchanged = false,
  proposedDimsMatch = true,
  hiddenOutputCatchupPending = false,
  operationalRendererMode = 'xterm',
} = {}) {
  if (String(reason) !== 'workspace-show-visible') return false;
  if (!noGpuRecoveryPending || !sizeUnchanged || !proposedDimsMatch) return false;
  if (hiddenOutputCatchupPending) return false;
  return shouldUseGpuTerminalRenderer({ operationalRendererMode });
}

/** Option B tab/window reveal: GPU addon stayed attached, no teardown pending. */
export function shouldSoftGpuWorkspaceReveal({
  operationalRendererMode = 'xterm',
  webglAddon = null,
  canvasAddon = null,
  visibleTerminalPanelCount: _visibleTerminalPanelCount = 1,
  pendingWebglRecovery = false,
  webglReleasedOnLayoutHide = false,
  canvasReleasedOnLayoutHide = false,
} = {}) {
  if (!shouldUseGpuTerminalRenderer({ operationalRendererMode })) return false;
  if (pendingWebglRecovery || webglReleasedOnLayoutHide || canvasReleasedOnLayoutHide) return false;
  return !needsGpuRendererReattach({ operationalRendererMode, webglAddon, canvasAddon });
}

/** @deprecated alias — use shouldSoftGpuWorkspaceReveal */
export const shouldPureGpuWorkspaceReveal = shouldSoftGpuWorkspaceReveal;

/**
 * Workspace tab reveal used to skip JS repaint (`pure`), but logs show active TUIs
 * (Grok/OpenCode) stay black under opacity-hidden shells — WebGL needs at least
 * refresh(). Window park always needed soft. When softGpuEligible, always soft.
 */
export function resolveWorkspaceLayoutShowRevealMode({
  softGpuEligible = false,
  hiddenOutputCatchupPending = false,
  tuiSessionActive = false,
  // kept for callers; tab vs window both use soft when eligible
  isWorkspaceTabReveal: _isWorkspaceTabReveal = false,
} = {}) {
  if (!softGpuEligible) return 'full';
  if (hiddenOutputCatchupPending || tuiSessionActive) return 'soft';
  return 'soft';
}

/** Flush buffered PTY output and nudge the GPU bitmap — no renderService.clear(). */
export function performSoftGpuVisibilityReveal(term, bufferRef, catchupPendingRef) {
  flushHiddenTerminalCatchupToTerm(term, bufferRef, catchupPendingRef);
  if (term && isTerminalRendererReady(term)) {
    refreshTerminalViewport(term);
    nudgeTerminalViewportRepaint(term);
  }
}

/** Flush PTY output buffered while layout-hidden — write only, no repaint nudge. */
export function flushHiddenTerminalCatchupToTerm(term, bufferRef, catchupPendingRef) {
  if (!catchupPendingRef?.current || !term) return false;
  const buffered = takeHiddenTerminalOutputBuffer(bufferRef);
  catchupPendingRef.current = false;
  if (!buffered) return false;
  for (const chunk of chunkTerminalOutputForCatchup(buffered)) {
    term.write(chunk);
  }
  return true;
}

/** Visible split siblings that are not focused still need fit+resize on layout churn. */
export function shouldRefitVisibleInactiveSplitPanel({
  isActivePanel,
  isVisibleInLayout = true,
} = {}) {
  return Boolean(isVisibleInLayout && !isActivePanel);
}

/** Full viewport sync when a workspace shell becomes visible again after being hidden. */
export function shouldSyncTerminalViewportOnLayoutShow(prevVisible, nextVisible) {
  return !prevVisible && nextVisible;
}

/** Guards initialCommand re-injection when connect() runs after a live PTY session. */
export function resolveConnectInitialCommandState({
  hasConnectedOnce = false,
  panelId = '',
  initialCommand = '',
} = {}) {
  const dispatched = getPanelInitialCommandDispatch(panelId);
  if (!hasConnectedOnce) {
    // If a lifecycle record already exists for this panel ID, the component was
    // remounted (e.g. workspace layout churn) while the PTY session stayed live.
    // Keep the guard so opencode/grok are not restarted; only a truly fresh panel
    // should start with a clean lifecycle.
    const isRemount = Boolean(dispatched);
    return {
      clearLifecycle: !isRemount,
      sessionReattached: false,
      hasSentInitialCommand: isRemount,
      markDispatched: false,
    };
  }
  return {
    clearLifecycle: false,
    sessionReattached: true,
    hasSentInitialCommand: Boolean(dispatched) || Boolean(initialCommand),
    markDispatched: Boolean(initialCommand) && !dispatched,
  };
}

/** Workspace tab switch and in-workspace V1/V2/V3 window switch share the same GPU recovery path. */
export function isWorkspaceLayoutSwitchReason(reason = '') {
  const normalized = String(reason);
  if (normalized.includes('workspace-window')) return true;
  return normalized.includes('workspace-switch');
}

/** Workspace tab close / survivor recovery — must not use nested viewport bursts (phases cancel each other). */
export function isWorkspaceCloseRecoverReason(reason = '') {
  const normalized = String(reason);
  return isWorkspaceLayoutSwitchReason(normalized) || normalized.includes('workspace-removed');
}

/** Golden-path replay for panels that stayed visible while a peer workspace unmounted. */
export const WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON = 'workspace-survivor-recover';

export function isWorkspaceSurvivorRecoverLayoutReason(reason = '') {
  return String(reason).includes(WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON);
}

/**
 * DOM renderer on WebKitGTK: skip fit/resize on app resume when a live TUI already
 * has the correct grid. Refitting corrupts alternate-screen Ink layouts.
 */
export function shouldFreezeDomViewportOnAppResume({
  operationalRendererMode = 'xterm',
  tuiSessionActive = false,
  term = null,
  container = null,
  fitAddon = null,
} = {}) {
  if (operationalRendererMode !== 'xterm') return false;
  if (!tuiSessionActive) return false;
  if (!term || !container || !fitAddon) return false;
  const dims = proposeTerminalViewportDimensions({ container, fitAddon, term });
  if (!dims) return false;
  return term.cols === dims.cols && term.rows === dims.rows;
}

/** Same freeze policy as single-panel WebGL, but for DOM + live TUI on workspace show. */
export function shouldFreezeDomViewportOnWorkspaceShow({
  reason = '',
  sizeUnchanged = false,
  operationalRendererMode = 'xterm',
  tuiSessionActive = false,
  proposedDimsMatch = true,
} = {}) {
  if (!sizeUnchanged || !tuiSessionActive || !proposedDimsMatch) return false;
  if (operationalRendererMode !== 'xterm') return false;

  const normalizedReason = String(reason);
  if (isWorkspaceSurvivorRecoverLayoutReason(normalizedReason)) return false;
  if (normalizedReason.includes('workspace-switch')) return true;
  if (
    normalizedReason === 'workspace-show-layout' ||
    normalizedReason === 'workspace-show-raf' ||
    normalizedReason === 'workspace-show-visible'
  ) {
    return true;
  }
  if (isWorkspaceLayoutSwitchReason(normalizedReason)) return true;
  if (normalizedReason.startsWith('layout-settled-workspace-switch-')) return true;
  if (/^reactivate-/.test(normalizedReason)) return true;
  if (
    normalizedReason.includes('window-focus') ||
    normalizedReason.includes('visibility-visible')
  ) {
    return true;
  }
  return false;
}

/** Skip redundant fit/PTY resize when layout-settled fires but cols/rows are already correct. */
export function shouldSkipRedundantLayoutSettleViewportSync({
  reason = '',
  sizeUnchanged,
  pendingWebglRecovery = false,
  canvasReleasedOnLayoutHide = false,
  hasGpuRenderer = false,
} = {}) {
  if (!sizeUnchanged || pendingWebglRecovery || canvasReleasedOnLayoutHide || !hasGpuRenderer) {
    return false;
  }
  const normalized = String(reason);
  if (
    normalized.includes('panel-group-layout') ||
    normalized.includes('internal-split-drag-end') ||
    normalized.includes('right-dock-drag-end')
  ) {
    return false;
  }
  if (normalized.includes('pizarra-mode-exit') || normalized.includes('pizarra-mode-enter')) {
    return true;
  }
  return /layout-settled-|workspace-switch|workspace-window/.test(normalized);
}

/** Buffer PTY output while layout-hidden. */
export function shouldSkipTerminalOutputWhileLayoutHidden({
  isVisibleInLayout = true,
  isActivePanel = true,
  operationalRendererMode,
  canvasAttached = false,
} = {}) {
  if (!isVisibleInLayout) {
    return shouldUseGpuTerminalRenderer({ operationalRendererMode });
  }
  return false;
}

export const HIDDEN_TERMINAL_OUTPUT_BUFFER_MAX = 256 * 1024;

export function appendHiddenTerminalOutputBuffer(
  bufferRef,
  chunk,
  maxBytes = HIDDEN_TERMINAL_OUTPUT_BUFFER_MAX
) {
  if (typeof chunk !== 'string' || !chunk || !bufferRef) return 0;
  const next = `${bufferRef.value || ''}${chunk}`;
  bufferRef.value = next.length > maxBytes ? next.slice(-maxBytes) : next;
  return chunk.length;
}

export function takeHiddenTerminalOutputBuffer(bufferRef) {
  if (!bufferRef) return '';
  const value = bufferRef.value || '';
  bufferRef.value = '';
  return value;
}

export const HIDDEN_OUTPUT_CATCHUP_DISCARD_BYTES = 32 * 1024;
export const HIDDEN_OUTPUT_CATCHUP_CHUNK_BYTES = 8 * 1024;

/** Stale mega-buffers after reattach do more harm than good — PTY redraw beats replay. */
export function shouldDiscardHiddenOutputCatchup({
  bufferedBytes = 0,
  sessionReattached = false,
  tuiSessionActive = false,
  bufferText = '',
  termHasContent = false,
  maxBytes = HIDDEN_OUTPUT_CATCHUP_DISCARD_BYTES,
} = {}) {
  if (sessionReattached) return true;
  if (tuiSessionActive) return true;
  if (termHasContent) return true;
  if (shouldDiscardOpenCodeCatchupReplay(bufferText)) return true;
  return bufferedBytes > maxBytes;
}

export function terminalBufferHasRenderableContent(term) {
  const buffer = term?.buffer?.active;
  if (!buffer || buffer.length === 0) return false;

  try {
    const start = Math.max(0, buffer.length - 4);
    for (let lineIndex = start; lineIndex < buffer.length; lineIndex += 1) {
      const line = buffer.getLine(lineIndex);
      if (line && line.translateToString(true).trim().length > 0) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

export function chunkTerminalOutputForCatchup(
  buffer,
  chunkSize = HIDDEN_OUTPUT_CATCHUP_CHUNK_BYTES
) {
  if (typeof buffer !== 'string' || !buffer) return [];
  const chunks = [];
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    chunks.push(buffer.slice(offset, offset + chunkSize));
  }
  return chunks;
}

/** Nudge PTY dimensions so TUIs redraw after a layout-hidden catch-up flush. */
/**
 * Peer-workspace close soft reveal: empty shells need only refresh; live Ink TUIs
 * need a forced PTY SIGWINCH so alternate-screen (OpenCode/Grok) repaints.
 */
export function shouldForcePtyNudgeOnSurvivorSoftReveal({
  tuiSessionActive = false,
  kimiLive = false,
  hasSocket = false,
} = {}) {
  return Boolean(tuiSessionActive && hasSocket && !kimiLive);
}

export function nudgeTerminalPtyResize({
  term,
  socket,
  lastPtySizeRef = null,
  websocketOpenState = WebSocket.OPEN,
  skipPtyNotify = false,
  force = false,
  source = 'pty-nudge',
  telemetryDetail = null,
} = {}) {
  if (skipPtyNotify) return false;
  if (!term || !socket || socket.readyState !== websocketOpenState) return false;
  const cols = Number(term.cols ?? 0);
  const rows = Number(term.rows ?? 0);
  if (cols <= 0 || rows <= 0 || typeof term.resize !== 'function') return false;

  // Avoid SIGWINCH to live TUIs when the PTY dimensions are already in sync.
  // The forced path is reserved for callers that intentionally need a redraw.
  if (
    !force &&
    lastPtySizeRef &&
    Number(lastPtySizeRef.cols) === cols &&
    Number(lastPtySizeRef.rows) === rows
  ) {
    trackPtyResizeSent({ cols, rows, lastPtySizeRef, source, telemetryDetail });
    return false;
  }

  if (rows > 2) {
    term.resize(cols, rows - 1);
    term.resize(cols, rows);
  }
  trackPtyResizeSent({ cols, rows, lastPtySizeRef, source, telemetryDetail });
  socket.send(JSON.stringify({ type: 'resize', cols, rows }));
  if (lastPtySizeRef) {
    lastPtySizeRef.cols = cols;
    lastPtySizeRef.rows = rows;
  }
  return true;
}

/** Canvas split siblings need atlas clears after geometry churn to avoid ghost glyphs (G-01). */
export function shouldClearAtlasForSplitCanvas({
  operationalRendererMode,
  visibleTerminalPanelCount = 1,
} = {}) {
  return (
    shouldAttachCanvasRenderer({ operationalRendererMode }) &&
    visibleTerminalPanelCount > TERMINAL_SPLIT_WEBGL_PANEL_LIMIT
  );
}

const CANVAS_SPLIT_LAYOUT_ATLAS_CLEAR_REASON =
  /layout-settled-(panel-group-layout|panel-focus-toggle|internal-split-drag-end|right-dock-drag-end|swarm-launch|shared-surface|panel-split|panel-relaunch)/;
const CANVAS_WORKSPACE_SHOW_ATLAS_CLEAR_REASON =
  /layout-recover-|layout-settled-workspace-window|layout-settled-workspace-switch/;

/** Canvas uses release-on-hide + reattach-on-show; avoid repeated atlas clears on delayed bursts. */
export function shouldClearGpuAtlasOnWorkspaceShow({
  operationalRendererMode,
  reason = '',
  explicitClearAtlas,
  canvasReleasedOnLayoutHide = false,
} = {}) {
  if (typeof explicitClearAtlas === 'boolean') return explicitClearAtlas;
  if (operationalRendererMode === 'xterm-canvas') {
    if (canvasReleasedOnLayoutHide) return true;
    if (reason.startsWith('workspace-show-')) return true;
    if (reason === 'workspace-show-pending') return true;
    if (CANVAS_SPLIT_LAYOUT_ATLAS_CLEAR_REASON.test(reason)) return true;
    if (CANVAS_WORKSPACE_SHOW_ATLAS_CLEAR_REASON.test(reason)) return true;
    return false;
  }
  if (reason.startsWith('layout-settled-')) {
    if (reason.includes('workspace-removed')) return false;
    return reason.includes('delay-1000') || reason.includes('recover');
  }
  if (reason.startsWith('workspace-show-')) {
    return reason === 'workspace-show-recover';
  }
  return reason.includes('recover');
}

/**
 * Release WebGL only when the whole workspace shell hides — NOT on window park.
 * Keeping WebGL attached while a window is parked (workspace still visible) avoids
 * the reattach race that leaves split siblings black on switch-back; PTY output is
 * buffered while hidden so the glyph atlas cannot corrupt.
 */
export function shouldReleaseWebglRendererOnLayoutHide({
  operationalRendererMode,
  isVisibleInLayout,
  prevVisibleInLayout,
  isWorkspaceShellVisible = true,
} = {}) {
  if (prevVisibleInLayout && !isVisibleInLayout && isWorkspaceShellVisible) {
    return false;
  }
  return (
    prevVisibleInLayout &&
    !isVisibleInLayout &&
    shouldAttachWebglRenderer({ operationalRendererMode })
  );
}

/**
 * Release Canvas only when the whole workspace shell hides — NOT on window park.
 * Same rationale as WebGL: avoid the reattach race for nested-window split siblings.
 */
export function shouldReleaseCanvasRendererOnLayoutHide({
  operationalRendererMode,
  isVisibleInLayout,
  prevVisibleInLayout,
  isWorkspaceShellVisible = true,
} = {}) {
  if (prevVisibleInLayout && !isVisibleInLayout && isWorkspaceShellVisible) {
    return false;
  }
  return (
    prevVisibleInLayout &&
    !isVisibleInLayout &&
    shouldAttachCanvasRenderer({ operationalRendererMode })
  );
}

export function resolveTerminalRuntimePhase() {
  return 'xterm';
}

export function shouldBootXtermRuntime() {
  return true;
}

export function resolveTerminalRendererViewModel({
  requestedRendererMode,
  rendererCapabilities,
} = {}) {
  const selection = resolveRendererSelection({
    requestedMode: requestedRendererMode || 'xterm',
    capabilities: rendererCapabilities,
  });

  return {
    ...selection,
    requestedLabel: getTerminalRendererOptionLabel(selection.requestedMode),
    effectiveLabel: getTerminalRendererOptionLabel(selection.effectiveMode),
    showRecoveryBanner: false,
  };
}

export function getTerminalRendererStatusCopy(rendererViewModel) {
  return getTerminalRendererFallbackCopy(rendererViewModel);
}

export function getTerminalRendererRecoveryActionLabel() {
  return 'Volver a xterm';
}

export function shouldReinitializeTerminalForRenderer(previousEffectiveMode, nextEffectiveMode) {
  // TERM-02 cares about runtime churn only when the live renderer changes.
  // Requested-mode flips that still resolve to xterm must stay on the same imperative instance.
  return previousEffectiveMode !== nextEffectiveMode;
}

/** Context loss is recoverable — keep the xterm viewport on DOM fallback instead of blocking it. */
export function shouldBlockTerminalViewportForWebglFallback(webglFallback) {
  if (!webglFallback?.active) return false;
  return webglFallback.reason !== TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_LOST;
}

export const TERMINAL_VIEWPORT_SHELL_STYLE = Object.freeze({
  isolation: 'isolate',
});

export const TERMINAL_NATIVE_CONTENT_BODY_STYLE = Object.freeze({
  isolation: 'isolate',
});

const DEFAULT_TERMINAL_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

export function resolveTerminalFontFamily() {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return DEFAULT_TERMINAL_FONT_FAMILY;
  }

  const cssMonoStack = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--font-family-mono')
    .replace(/\s+/g, ' ')
    .trim();

  return cssMonoStack || DEFAULT_TERMINAL_FONT_FAMILY;
}

export {
  cliLog,
  attachTerminalRendererAddons,
  neutralizeWebglAddonForDisposal,
  isStaleXtermRendererError,
  TERMINAL_SPLIT_WEBGL_PANEL_LIMIT,
};

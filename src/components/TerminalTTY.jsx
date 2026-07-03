'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ClipboardPaste, Copy, Loader2, RotateCcw, Wifi, WifiOff, X } from 'lucide-react';
import { getTerminalTheme } from '@/components/terminal/TerminalThemeSync';
import {
  getTerminalAppShellStyle,
  getTerminalFloatingControlStyle,
  getTerminalTitleBarStyle,
  getTerminalViewportFrameStyle,
} from '@/components/terminal/terminalChromeStyles';
import {
  closeNativeVtePanel,
  focusNativeVtePanel,
  isNativeVteRuntimeAvailable,
  openNativeVtePanel,
  pasteNativeVtePanel,
  probeNativeVte,
  resizeNativeVtePanel,
  setNativeVtePanelVisibility,
  subscribeNativeVteEvents,
} from '@/lib/terminal/nativeVteBridge';
import WebglErrorSection from './terminal/components/WebglErrorSection';
import {
  readClipboardImage,
  readClipboardText,
  saveClipboardImageToTempFile,
  terminalClipboardEventBelongsToPanel,
} from '@/lib/terminal/terminalClipboard';
import {
  getTerminalRendererFallbackCopy,
  getTerminalRendererOptionLabel,
  getTerminalRendererRuntimeCapabilities,
  getTerminalRendererWebglFallbackCopy,
  probeWebglSupport,
  resolveOperationalRendererMode,
  resolveRendererSelection,
  TERMINAL_OPERATIONAL_CANVAS_MODE,
  TERMINAL_SPLIT_WEBGL_PANEL_LIMIT,
  TERMINAL_WEBGL_FALLBACK_REASONS,
} from '@/components/terminal/terminalRendererCapabilities';
import { getTerminalFontOptions } from '@/components/terminal/TerminalThemeSync';
import {
  extractOpenCodeSessionId,
  isSwarmLaunchWrapperCommand,
  readAgentRunForPanel,
  resolveTerminalInjectCommand,
} from '@/lib/terminal/restorePolicyResolver';
import {
  containsTerminalResponseNoise,
  filterTerminalInputForSession,
  filterTerminalOutputForSession,
} from '@/lib/terminal/terminalNoiseFilter';
import { getTuiAdapter } from '@/lib/terminal/tuiAdapter';
import { buildSwarmTmuxSessionName } from '@/lib/terminal/viewportReadyMarker';
import {
  detectOpenCodeTuiReady,
  shouldDiscardOpenCodeCatchupReplay,
} from '@/lib/terminal/opencodeReadyMarker';
import {
  detectKimiReadyFromTerminalBuffer,
  detectKimiTuiReady,
  isKimiLaunchCommand,
  isKimiTuiLive,
  shouldFreezeKimiTuiViewportOnWorkspaceShow,
  shouldSkipKimiTuiPtyResize,
} from '@/lib/terminal/kimiReadyMarker';
import { detectAgentTypeFromCommand } from '@/lib/terminal/agentTuiMetadata';
import { createPanelActivityTracker } from '@/components/terminal/utils/panelActivityTracker';
import { clearPanelActivity } from '@/components/terminal/utils/panelActivityStore';
import {
  isSwarmLaunchWrapperDispatched,
  markSwarmLaunchWrapperDispatched,
} from '@/lib/terminal/swarmLaunchWrapperLifecycle';
import {
  clearPanelInitialCommandLifecycle,
  getPanelInitialCommandDispatch,
  markPanelInitialCommandDispatched,
  shouldSkipRedundantInitialCommandSend,
} from '@/lib/terminal/panelInitialCommandLifecycle';
import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';
import { getTerminalLayoutSettledGeneration } from '@/components/terminal/nativeLayoutSync';
import {
  takeTerminalPanelBridge,
  stashTerminalPanelBridge,
} from '@/lib/terminal/terminalPanelBridge';
import {
  cancelNativeVteLayoutHide,
  clearNativeVteLease,
  consumeHiddenNativeVteLease,
  deferNativeVteLayoutHide,
  hasHiddenNativeVteLease,
  markNativeVteLeaseHidden,
} from '@/lib/terminal/nativeVteLayoutLifecycle';
import { buildTerminalLifecycleEvent } from '@/lib/terminal/terminalLifecycleEvent';
import {
  buildTerminalExitOverlayCopy,
  clearPanelSessionExit,
  isAgentTuiCommand,
  parseTerminalExitReason,
  persistPanelSessionExit,
  readPanelSessionExit,
} from '@/lib/terminal/agentSessionExit';

/**
 * Fire-and-forget logger → POST to /api/terminal/log (writes to data/logs/terminal-debug.log).
 * Never awaited — diagnostic only, does not affect control flow.
 */
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
 * Bump this string whenever you need to PROVE the running dev server picked up a
 * new edit to this file — it re-fires on every fresh module evaluation (full
 * restart, or a Fast-Refresh full-reload of this module). Read it two ways:
 *   1. Watch the `pnpm tauri dev` terminal for `[devhub-log] [BUILD] ...` on startup.
 *   2. In the running app's devtools console: window.__DEVHUB_BUILD_MARKERS__.terminalTTY
 * If the marker you see does NOT match the one below, the running window is on stale code.
 */
const TERMINAL_TTY_BUILD_MARKER = '2026-07-03-window-focus-workspace-sync-v2';
if (typeof window !== 'undefined') {
  window.__DEVHUB_BUILD_MARKERS__ = window.__DEVHUB_BUILD_MARKERS__ || {};
  if (window.__DEVHUB_BUILD_MARKERS__.terminalTTY !== TERMINAL_TTY_BUILD_MARKER) {
    window.__DEVHUB_BUILD_MARKERS__.terminalTTY = TERMINAL_TTY_BUILD_MARKER;
    cliLog('BUILD', `TerminalTTY.jsx loaded — marker=${TERMINAL_TTY_BUILD_MARKER}`);
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
    transition: { duration: 0.1, ease: 'easeOut' },
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

/** Full-screen blocking loader — only on first boot, never on panel-switch reconnects. */
export function shouldShowTerminalLoadingOverlay(
  isInitializing,
  connectionState,
  hasConnectedOnce
) {
  if (isInitializing) return true;
  return connectionState === 'connecting' && !hasConnectedOnce;
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
const TERMINAL_SYNC_OUTPUT_START_SEQ = '\x1b[?2026h';
const TERMINAL_SYNC_OUTPUT_END_SEQ = '\x1b[?2026l';
const TERMINAL_SYNC_OUTPUT_MAX_HOLD_MS = 100;

/** Output throttle — prevent xterm.js from choking on PTY floods. */
const TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME = 32 * 1024;
const TERMINAL_OUTPUT_BACKLOG_THRESHOLD = 128 * 1024;

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

/** Grok Ink accepts SGR wheel and/or arrow scroll depending on focus — send both. */
export function buildGrokWheelScrollPayload(direction, col, row, steps = 1) {
  return buildTerminalWheelSgrSequence(direction, col, row);
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

/** Shell capture can starve xterm's wheel listener — forward explicitly for TUI passthrough. */
export function forwardTerminalWheelToXterm(term, event) {
  const target = term?.element;
  if (!target || !event || typeof WheelEvent === 'undefined') return false;
  if (isForwardedTerminalWheelEvent(event)) return false;

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

  return target.dispatchEvent(forwarded);
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
    return nudgeTerminalViewportRepaint(term);
  } catch (error) {
    if (isStaleXtermRendererError(error)) return false;
    throw error;
  }
}

/** 1-cell resize nudge + refresh without clearing the render service (less blink). */
export function nudgeTerminalViewportRepaint(term) {
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
} = {}) {
  if (!ready || !fitWorked || !term) return true;
  if (hasConnectedOnce) return false;
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

  if (
    !skipPtyNotify &&
    !unchanged &&
    socket?.readyState === websocketOpenState &&
    cols > 0 &&
    rows > 0
  ) {
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

export function shouldAutoReconnectTerminal(connectionState, autoFocus, initError = null) {
  if (!autoFocus) return false;
  if (initError) return false;
  return connectionState === 'disconnected' || connectionState === 'error';
}

function getClipboardApi() {
  return globalThis?.navigator?.clipboard || null;
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
}) {
  if (!socket || socket.readyState !== websocketOpenState) return false;
  if (typeof text !== 'string' || text.length === 0) return false;

  if (transport === 'raw') {
    socket.send(text);
  } else {
    socket.send(JSON.stringify({ type: 'input', data: text }));
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
  const baseY = activeBuffer?.baseY;
  const viewportY = activeBuffer?.viewportY ?? activeBuffer?.ydisp;
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

export function buildTerminalMousePressSequence(col, row) {
  const x = Math.max(1, Math.floor(col) + 1);
  const y = Math.max(1, Math.floor(row) + 1);
  return `\x1b[?1006h\x1b[?1000h\x1b[<0;${x};${y}M\x1b[?1000l\x1b[?1006l`;
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

  try {
    term.scrollToLine(clampedY);
    return true;
  } catch {
    return false;
  }
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
  if (!hasConnectedOnce) {
    return {
      clearLifecycle: true,
      sessionReattached: false,
      hasSentInitialCommand: false,
      markDispatched: false,
    };
  }
  const dispatched = getPanelInitialCommandDispatch(panelId);
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
export function nudgeTerminalPtyResize({
  term,
  socket,
  lastPtySizeRef = null,
  websocketOpenState = WebSocket.OPEN,
  skipPtyNotify = false,
  force = false,
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
    return false;
  }

  if (rows > 2) {
    term.resize(cols, rows - 1);
    term.resize(cols, rows);
  }
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

export function shouldOpenNativeVtePanel({
  isActivePanel,
  isVisibleInLayout = true,
  suspendNativeSurface = false,
  nativeVteOpenFailure,
  nativeVteProbe,
  requestedRendererMode,
  runtimePlatform,
  tauriAvailable,
} = {}) {
  return Boolean(
    isVisibleInLayout &&
    !suspendNativeSurface &&
    requestedRendererMode === 'vte-experimental' &&
    tauriAvailable &&
    getTerminalRuntimePlatform(runtimePlatform).includes('linux') &&
    nativeVteProbe?.ready &&
    !nativeVteOpenFailure
  );
}

export function resolveTerminalRuntimePhase({
  isActivePanel,
  isVisibleInLayout = true,
  suspendNativeSurface = false,
  nativeSurfacePolicy = 'live',
  nativeVteOpenFailure,
  nativeVteOpened,
  nativeVteProbe,
  requestedRendererMode,
  runtimePlatform,
  tauriAvailable,
} = {}) {
  const nativeCandidate = Boolean(
    requestedRendererMode === 'vte-experimental' &&
    tauriAvailable &&
    getTerminalRuntimePlatform(runtimePlatform).includes('linux')
  );

  if (!nativeCandidate) return 'xterm';
  if (!isVisibleInLayout) return nativeVteOpened ? 'native-hidden' : 'xterm';
  if (suspendNativeSurface) return nativeVteOpened ? 'native-suspended' : 'xterm';
  if (!isActivePanel)
    return nativeVteOpened ? 'native-idle' : nativeVteProbe?.ready ? 'native-opening' : 'xterm';
  if (nativeVteOpened) return 'native-opened';
  if (nativeVteOpenFailure) return 'fallback-xterm';
  if (nativeVteProbe?.ready) return 'native-opening';
  if (!nativeVteProbe) return 'native-probing';
  return 'fallback-xterm';
}

export function shouldBootXtermRuntime(input = {}) {
  const runtimePhase = resolveTerminalRuntimePhase(input);
  return runtimePhase === 'xterm' || runtimePhase === 'fallback-xterm';
}

export function resolveTerminalRendererViewModel({
  requestedRendererMode,
  rendererCapabilities,
  nativeVteReady = false,
} = {}) {
  const selection = resolveRendererSelection({
    requestedMode: requestedRendererMode || 'xterm',
    capabilities: rendererCapabilities,
  });

  if (ENABLE_NATIVE_VTE && requestedRendererMode === 'vte-experimental' && nativeVteReady) {
    return {
      ...selection,
      effectiveMode: 'vte-experimental',
      didFallback: false,
      fallbackReason: null,
      capability: rendererCapabilities?.['vte-experimental'] || selection.capability,
      requestedLabel: getTerminalRendererOptionLabel(selection.requestedMode),
      effectiveLabel: getTerminalRendererOptionLabel('vte-experimental'),
      showRecoveryBanner: false,
    };
  }

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

const MAX_NATIVE_VTE_PROBE_RETRIES = 4;

// Master switch for the legacy native VTE (GTK) backend.
// We keep the entire implementation (nativeVteBridge, probes, lease logic, etc.)
// in the tree exactly as-is so it can be re-enabled later if needed.
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
const ENABLE_NATIVE_VTE = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

export default function TerminalTTY({
  id,
  onClose,
  onActivatePanel,
  cwd,
  autoFocus,
  hideTitleBar,
  initialCommand,
  restored,
  // Enforced: we only ever activate xterm-webgl (with plain xterm fallback on webgl failure).
  // Legacy 'vte-experimental' requests are normalized upstream; we still accept the prop
  // for compatibility but force the webgl path and skip all native VTE mounting.
  requestedRendererMode = 'xterm-webgl',
  onResetRendererToXterm,
  visibleTerminalPanelCount = 1,
  isActivePanel = autoFocus,
  isVisibleInLayout = true,
  isWorkspaceShellVisible = true,
  suspendNativeSurface = false,
  nativeSurfacePolicy = 'live',
  runtimePlatform,
  showQuickCopyButton = true,
  swarmContext = null,
  connectionState: externalConnectionState,
  onConnectionStateChange,
  surfaceHost = 'workspace',
  coldMountOrdinal = 0,
}) {
  const terminalRootRef = useRef(null);
  const containerRef = useRef(null);
  const viewportShellRef = useRef(null);

  // We keep the root bg in sync with the terminal theme so there are no
  // "letterbox" flashes or thin frames when the TUI draws full-bleed boxes.
  // The real content (xterm canvas) now starts closer to the panel edges.
  const nativePlaceholderRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  // True only while disposeXtermRuntime is tearing the runtime down. Async
  // callbacks queued before teardown (fit rAFs, resize observers, ws onmessage,
  // font-size refit) re-check this and bail, so they cannot touch a terminal
  // whose renderer slot is being cleared — the WebKitGTK `_renderer.value
  // .handleResize` stale-renderer race (docs/errores/03-*). A.4.
  const isDisposingRef = useRef(false);
  const panelActivityTrackerRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const nativeResizeObserverRef = useRef(null);
  const nativeResizeRafRef = useRef(null);
  const nativeResizeSettleTimersRef = useRef([]);
  const wsRef = useRef(null);
  const connectInFlightRef = useRef(false);
  const connectEpochRef = useRef(0);
  const connectAbortRef = useRef(null);
  const sessionClosingRef = useRef(false);
  const searchRef = useRef(null);
  const transportRef = useRef('json');
  const lastViewportDiagnosticRef = useRef(null);
  const connectionStateRef = useRef('idle');
  const requestedRendererModeRef = useRef(requestedRendererMode);
  const nativeLeaseRef = useRef(false);
  const nativeVteProbeRetryCountRef = useRef(0);
  const nativeVteProbeRetryTimerRef = useRef(null);
  const nativeVteProbeRetryDelayRef = useRef(null);
  const shouldRetryNativeVteProbeRef = useRef(false);
  const hideTimerRef = useRef(null);
  const prevRequestedRendererModeRef = useRef(requestedRendererMode);
  const restoredHiddenLeaseThisMountRef = useRef(false);
  const lastViewportYRef = useRef(null);
  const lastPointerZoneRef = useRef('transcript');
  const tuiSessionActiveRef = useRef(isLikelyTuiInitialCommand(initialCommand));
  const tuiSessionFooterConfirmedRef = useRef(false);
  const grokTuiReadyRef = useRef(isGrokTuiInitialCommand(initialCommand));
  const isGrokSessionRef = useRef(isGrokTuiInitialCommand(initialCommand));
  const [nativeWheelPassthrough, setNativeWheelPassthrough] = useState(false);

  const FONT_SIZE_KEY = 'devhub:terminalFontSize';
  const [fontSize, setFontSize] = useState(() => {
    try {
      // Simple local per-device size (persisted via the +/- buttons).
      // Base default (14) balances density in multi-panel grids with legibility.
      const stored = typeof window !== 'undefined' && window.localStorage.getItem(FONT_SIZE_KEY);
      const parsed = stored ? parseInt(stored, 10) : NaN;
      if (Number.isFinite(parsed) && parsed >= 8 && parsed <= 24) return parsed;
      return 14;
    } catch {
      return 14;
    }
  });

  const [isInitializing, setIsInitializing] = useState(true);
  const isInitializingRef = useRef(false);
  const [initError, setInitError] = useState(null);
  const [internalConnectionState, setInternalConnectionState] = useState('idle');
  const connectionState =
    externalConnectionState !== undefined ? externalConnectionState : internalConnectionState;
  const setConnectionState =
    externalConnectionState !== undefined ? () => {} : setInternalConnectionState;
  const [copied, setCopied] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [restoredToast, setRestoredToast] = useState(false);
  const [nativeVteProbeResult, setNativeVteProbeResult] = useState(null);
  const [nativeVteOpenFailure, setNativeVteOpenFailure] = useState(null);
  const [nativeVteOpened, setNativeVteOpened] = useState(false);
  const [sessionExitReason, setSessionExitReason] = useState(null);
  const [nativeVteProbeAttempt, setNativeVteProbeAttempt] = useState(0);
  const [nativeVteRecoveryAttempt, setNativeVteRecoveryAttempt] = useState(0);
  const [webglProbeResult, setWebglProbeResult] = useState(() => probeWebglSupport());
  const [webglFallback, setWebglFallback] = useState(null);
  const [xtermBootNonce, setXtermBootNonce] = useState(0);
  const webglAddonRef = useRef(null);
  const canvasAddonRef = useRef(null);
  const webglFallbackRef = useRef(webglFallback);
  webglFallbackRef.current = webglFallback;
  const terminalBlurCleanupRef = useRef(null);
  const tauriAvailable = isNativeVteRuntimeAvailable();
  const resolvedRuntimePlatform = getTerminalRuntimePlatform(runtimePlatform);
  // Force the only supported active renderer. Any vte request (from stored
  // prefs or old callers) is redirected here so we never boot the native VTE surface.
  const effectiveRequestedMode =
    !ENABLE_NATIVE_VTE && requestedRendererMode === 'vte-experimental'
      ? 'xterm-webgl'
      : requestedRendererMode;

  const rendererCapabilities = getTerminalRendererRuntimeCapabilities({
    platform: resolvedRuntimePlatform,
    tauriAvailable,
    nativeVteProbe: nativeVteProbeResult,
    nativeVteOpenFailure,
    webglProbe: webglProbeResult,
  });
  const rendererViewModel = resolveTerminalRendererViewModel({
    requestedRendererMode: effectiveRequestedMode,
    rendererCapabilities,
    nativeVteReady:
      ENABLE_NATIVE_VTE && effectiveRequestedMode === 'vte-experimental' && nativeVteOpened,
  });
  const operationalRendererMode = resolveOperationalRendererMode({
    requestedMode: effectiveRequestedMode,
    effectiveMode: rendererViewModel.effectiveMode,
    visibleTerminalPanelCount,
  });
  const hasSentInitialCommand = useRef(false);
  const sessionReattachedRef = useRef(false);
  // True once the server's `ready` message arrives. Initial commands must never be
  // sent before this (the server may report `reattached: true`, meaning the tmux pane
  // already has a live TUI — typing the launch command into it injects it into the
  // conversation as visible text). See Bug B: resume-command injection on reload.
  const serverReadyReceivedRef = useRef(false);
  const initialCommandConnectSnapshotRef = useRef(null);
  const viewportFitConfirmedRef = useRef(false);
  // Fresh panels created from the workspace modal must wait until the host layout has
  // projected the surface before injecting the launch command; sending too early can
  // leave the terminal blank because xterm has not rendered the viewport yet.
  const projectionReadyRef = useRef(false);
  const panelCreatedAtRef = useRef(Date.now());
  const opencodeReadyNotifiedRef = useRef(false);
  const kimiReadyNotifiedRef = useRef(false);
  const tuiOutputTailRef = useRef('');
  const lastViewportReadyPostedRef = useRef({ cols: 0, rows: 0 });
  const viewportReadyNotifyTimerRef = useRef(null);
  const initialCommandDelayTimerRef = useRef(null);
  const initialCommandDelayScheduledRef = useRef(false);
  const initialCommandProjectionRetryTimerRef = useRef(null);
  const lastPtySizeRef = useRef({ cols: 0, rows: 0 });
  const hasConnectedOnceRef = useRef(false);
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const connectRef = useRef(null);
  const sendResizeRef = useRef(null);
  const isActivePanelRef = useRef(isActivePanel);
  const isVisibleInLayoutRef = useRef(isVisibleInLayout);
  const isWorkspaceShellVisibleRef = useRef(isWorkspaceShellVisible);
  const prevWorkspaceShellVisibleRef = useRef(isWorkspaceShellVisible);
  const prevVisibleInLayoutRef = useRef(isVisibleInLayout);
  const needsViewportSyncOnShowRef = useRef(false);
  // Set by layout-settled/survivor-recover events that arrive while the panel
  // is hidden (e.g. split/close in another workspace). When the panel is shown
  // again we must run the heavy recovery path instead of the soft/skip paths,
  // because the GPU framebuffer may have been discarded while the shell was
  // opacity-hidden even though the addon stayed attached.
  const layoutChurnedWhileHiddenRef = useRef(false);
  // Snapshot of the global layout-settled generation taken when this panel
  // becomes hidden. On reveal we compare it against the current generation to
  // detect churn that happened in *other* workspaces whose panelIds filter
  // prevented the layout-settled event from reaching this panel.
  const layoutHiddenGenerationRef = useRef(0);
  const survivorGpuRecycleAtRef = useRef(0);
  const containerWasZeroSizedOnShowRef = useRef(false);
  const syncTerminalViewportOnWorkspaceShowRef = useRef(null);
  const workspaceShowSyncTimerRef = useRef(null);
  const workspaceShowRecoverTimerRef = useRef(null);
  const workspaceShowZeroSizeObserverRef = useRef(null);
  const inactiveRepaintRafRef = useRef(null);
  const pendingWebglRecoveryRef = useRef(false);
  const webglReleasedOnLayoutHideRef = useRef(false);
  const canvasReleasedOnLayoutHideRef = useRef(false);
  const webglRecoveryTimerRef = useRef(null);
  const handleWebglContextLossRef = useRef(null);
  const scheduleWorkspaceShowRecoveryRef = useRef(null);
  // handleWebglContextLoss is declared before scheduleBoundedFitRepaint/
  // scheduleBoundedGpuRecover further down this component — calling those
  // consts directly in handleWebglContextLoss's body is fine (deferred), but
  // putting them in its useCallback deps array reads them in the same TDZ
  // block before their own declaration runs, throwing "Cannot access ... before
  // initialization" on EVERY render. Route the calls through refs instead.
  const scheduleBoundedFitRepaintRef = useRef(null);
  const scheduleBoundedGpuRecoverRef = useRef(null);
  const prevIsActivePanelRef = useRef(false);
  const reactivateTerminalViewportRef = useRef(null);
  const reactivateCoalesceTimerRef = useRef(null);
  const tryReattachWebglAddonRef = useRef(null);
  const tryReattachCanvasAddonRef = useRef(null);
  const outputPendingRef = useRef({ value: '' });
  const hiddenOutputBufferRef = useRef({ value: '' });
  const hiddenOutputCatchupPendingRef = useRef(false);
  const terminalOutputQueueRef = useRef([]);
  const terminalOutputFlushRafRef = useRef(null);
  const syncOutputActiveRef = useRef(false);
  const syncOutputBufferRef = useRef('');
  const syncOutputTimeoutRef = useRef(null);
  const surfaceHostRef = useRef(surfaceHost);
  const connectPendingUntilFitRef = useRef(false);
  const connectDeferTimerRef = useRef(null);
  const processExitedRef = useRef(false);
  const rafRef = useRef(null);
  const timeoutRef = useRef(null);
  const initTimeoutRef = useRef(null);
  const autoScrollRafRef = useRef(null);
  const tuiResizeDebounceTimerRef = useRef(null);
  const effectiveRendererModeRef = useRef(operationalRendererMode);
  const operationalRendererModeRef = useRef(operationalRendererMode);
  const visibleTerminalPanelCountRef = useRef(visibleTerminalPanelCount);
  const prevVisibleTerminalPanelCountRef = useRef(visibleTerminalPanelCount);
  const runtimePhase = resolveTerminalRuntimePhase({
    isActivePanel,
    isVisibleInLayout,
    suspendNativeSurface,
    nativeSurfacePolicy,
    nativeVteOpenFailure,
    nativeVteOpened,
    nativeVteProbe: nativeVteProbeResult,
    requestedRendererMode,
    runtimePlatform: resolvedRuntimePlatform,
    tauriAvailable,
  });
  const shouldUseNativeRenderer =
    rendererViewModel.effectiveMode === 'vte-experimental' && runtimePhase !== 'fallback-xterm';
  const shouldBootXterm =
    shouldBootXtermRuntime({
      isActivePanel,
      isVisibleInLayout,
      suspendNativeSurface,
      nativeSurfacePolicy,
      nativeVteOpenFailure,
      nativeVteOpened,
      nativeVteProbe: nativeVteProbeResult,
      requestedRendererMode,
      runtimePlatform: resolvedRuntimePlatform,
      tauriAvailable,
    }) && connectionState !== 'suspended';

  const clearTimers = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (nativeVteProbeRetryTimerRef.current) {
      clearTimeout(nativeVteProbeRetryTimerRef.current);
      nativeVteProbeRetryTimerRef.current = null;
      nativeVteProbeRetryDelayRef.current = null;
    }

    if (viewportReadyNotifyTimerRef.current) {
      clearTimeout(viewportReadyNotifyTimerRef.current);
      viewportReadyNotifyTimerRef.current = null;
    }

    if (initialCommandDelayTimerRef.current) {
      clearTimeout(initialCommandDelayTimerRef.current);
      initialCommandDelayTimerRef.current = null;
    }

    if (initialCommandProjectionRetryTimerRef.current) {
      clearTimeout(initialCommandProjectionRetryTimerRef.current);
      initialCommandProjectionRetryTimerRef.current = null;
    }

    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
    if (tuiResizeDebounceTimerRef.current) {
      clearTimeout(tuiResizeDebounceTimerRef.current);
      tuiResizeDebounceTimerRef.current = null;
    }

    if (webglRecoveryTimerRef.current) {
      clearTimeout(webglRecoveryTimerRef.current);
      webglRecoveryTimerRef.current = null;
    }

    if (workspaceShowRecoverTimerRef.current) {
      clearTimeout(workspaceShowRecoverTimerRef.current);
      workspaceShowRecoverTimerRef.current = null;
    }

    if (inactiveRepaintRafRef.current) {
      cancelAnimationFrame(inactiveRepaintRafRef.current);
      inactiveRepaintRafRef.current = null;
    }
  }, []);

  const clearConnectDeferTimer = useCallback(() => {
    if (connectDeferTimerRef.current) {
      clearTimeout(connectDeferTimerRef.current);
      connectDeferTimerRef.current = null;
    }
  }, []);

  const scheduleConnectDeferForce = useCallback(() => {
    if (hasConnectedOnceRef.current || connectDeferTimerRef.current) return;
    connectDeferTimerRef.current = setTimeout(() => {
      connectDeferTimerRef.current = null;
      if (
        hasConnectedOnceRef.current ||
        sessionClosingRef.current ||
        !termRef.current ||
        !containerRef.current
      ) {
        return;
      }
      connectPendingUntilFitRef.current = false;
      cliLog(`CLIENT:${id}`, 'connect defer timeout — forcing connect', {
        maxMs: TERMINAL_CONNECT_DEFER_MAX_MS,
      });
      connectRef.current?.();
    }, TERMINAL_CONNECT_DEFER_MAX_MS);
  }, [id]);

  const clearNativeVteProbeRetryTimer = useCallback(() => {
    if (!nativeVteProbeRetryTimerRef.current) return;

    clearTimeout(nativeVteProbeRetryTimerRef.current);
    nativeVteProbeRetryTimerRef.current = null;
    nativeVteProbeRetryDelayRef.current = null;
  }, []);

  const disposeXtermRuntime = useCallback(() => {
    // 0. Mark disposing BEFORE touching anything. Any callback that re-enters
    //    during teardown (or a stray rAF/observer that fires while the renderer
    //    slot is half-cleared) sees this and bails. Cleared in the finally so a
    //    later boot is never wrongly blocked. A.4.
    if (isDisposingRef.current) return;
    isDisposingRef.current = true;
    connectEpochRef.current += 1;
    if (panelActivityTrackerRef.current) {
      panelActivityTrackerRef.current.dispose();
      panelActivityTrackerRef.current = null;
    }
    clearPanelActivity(id);
    if (connectAbortRef.current) {
      connectAbortRef.current.abort();
      connectAbortRef.current = null;
    }
    // A.0 lifecycle telemetry: capture renderer + dims BEFORE refs are nulled.
    // This is the dispose-count-per-toggle signal A.1 must drive to zero.
    cliLog(
      `LIFECYCLE:${id}`,
      'dispose',
      buildTerminalLifecycleEvent({
        event: 'dispose',
        panelId: id,
        renderer: requestedRendererModeRef.current,
        isVisible: isVisibleInLayoutRef.current,
        cols: termRef.current?.cols,
        rows: termRef.current?.rows,
      })
    );
    try {
      // 1. Stop observing the container FIRST so no new resize callbacks queue.
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;

      // 2. Cancel any RAF / setTimeout that might call fit() or sendResize()
      //    after the runtime is gone. Without this, a queued RAF can fire
      //    fitAddon.fit() on a terminal that has already started disposing
      //    and trigger the WebGL addon's stale-renderer crash on Linux.
      clearTimers();
      clearConnectDeferTimer();
      if (terminalOutputFlushRafRef.current) {
        cancelAnimationFrame(terminalOutputFlushRafRef.current);
        terminalOutputFlushRafRef.current = null;
      }
      if (syncOutputTimeoutRef.current) {
        clearTimeout(syncOutputTimeoutRef.current);
        syncOutputTimeoutRef.current = null;
      }

      // 3. Silence and close the websocket. Closing it first means the
      //    onmessage/onclose can't push more output into a disposed terminal.
      if (wsRef.current) {
        const stale = wsRef.current;
        stale.onopen = null;
        stale.onmessage = null;
        stale.onerror = null;
        stale.onclose = null;
        try {
          stale.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }

      if (terminalBlurCleanupRef.current) {
        try {
          terminalBlurCleanupRef.current();
        } catch {
          // ignore
        }
        terminalBlurCleanupRef.current = null;
      }

      // 4. Snapshot refs and null them out IMMEDIATELY. Any concurrent code
      //    (queued resize, focus handler, paste handler) that re-checks the
      //    refs now sees null and bails out before we start tearing things
      //    down. This is the key ordering change for the Linux/WebKitGTK race.
      const webglAddon = webglAddonRef.current;
      const canvasAddon = canvasAddonRef.current;
      const term = termRef.current;
      webglAddonRef.current = null;
      canvasAddonRef.current = null;
      const bufferedOutput = hiddenOutputBufferRef.current?.value || '';
      const pendingOutput = outputPendingRef.current?.value || '';
      if (bufferedOutput || pendingOutput || hiddenOutputCatchupPendingRef.current) {
        stashTerminalPanelBridge(id, {
          buffer: bufferedOutput,
          catchupPending: hiddenOutputCatchupPendingRef.current || Boolean(bufferedOutput),
          outputPending: pendingOutput,
          lastPtySize: { ...lastPtySizeRef.current },
          host: surfaceHostRef.current,
          reason: 'xterm-dispose',
        });
      }
      if (outputPendingRef.current) {
        outputPendingRef.current.value = '';
      }
      if (hiddenOutputBufferRef.current) {
        hiddenOutputBufferRef.current.value = '';
      }
      hiddenOutputCatchupPendingRef.current = false;
      connectPendingUntilFitRef.current = false;
      if (connectDeferTimerRef.current) {
        clearTimeout(connectDeferTimerRef.current);
        connectDeferTimerRef.current = null;
      }
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;

      if (containerRef.current) {
        try {
          containerRef.current.replaceChildren();
        } catch {
          // ignore — container may already be detached
        }
      }

      // 5. Neutralize the WebGL addon's internal handleResize before any
      //    dispose runs. See neutralizeWebglAddonForDisposal — this is the
      //    fix for the `_renderer.value.handleResize` undefined crash that
      //    xterm-addon-webgl@0.16.0 exposes during teardown.
      neutralizeWebglAddonForDisposal(webglAddon);

      // 6. Dispose the terminal FIRST. xterm's AddonManager will walk the
      //    registered addons (including WebglAddon) in a safe internal order
      //    and detach the resize listener before clearing the renderer slot.
      if (term) {
        try {
          term.dispose();
        } catch (err) {
          if (!isStaleXtermRendererError(err)) {
            console.warn('Error disposing Terminal instance:', err);
          }
        }
      }

      // 7. Defensive second dispose for the addon ref. xterm cascades the
      //    dispose in step 6, but if loadAddon never completed (WebGL context
      //    creation threw) the addon won't be in the AddonManager's list, so
      //    we still need to release its handlers explicitly. dispose() is
      //    idempotent on the official addon.
      if (webglAddon) {
        try {
          webglAddon.dispose?.();
        } catch (err) {
          if (!isStaleXtermRendererError(err)) {
            console.warn('Error disposing WebglAddon:', err);
          }
        }
      }

      if (canvasAddon) {
        try {
          canvasAddon.dispose?.();
        } catch (err) {
          if (!isStaleXtermRendererError(err)) {
            console.warn('Error disposing CanvasAddon:', err);
          }
        }
      }
    } finally {
      isDisposingRef.current = false;
    }
  }, [clearTimers, id]);

  const shouldRetryNativeVteProbe =
    ENABLE_NATIVE_VTE &&
    isActivePanel &&
    requestedRendererMode === 'vte-experimental' &&
    !nativeVteOpened &&
    !nativeVteOpenFailure &&
    nativeVteProbeResult?.ready === false &&
    nativeVteProbeResult?.reason === 'probe-failed';

  useEffect(() => {
    shouldRetryNativeVteProbeRef.current = shouldRetryNativeVteProbe;
  }, [shouldRetryNativeVteProbe]);

  const queueNativeVteProbeRetry = useCallback(
    (delayMs = 80) => {
      if (!shouldRetryNativeVteProbeRef.current) return;
      if (nativeVteProbeRetryCountRef.current >= MAX_NATIVE_VTE_PROBE_RETRIES) return;

      if (delayMs <= 0) {
        clearNativeVteProbeRetryTimer();
        nativeVteProbeRetryCountRef.current += 1;
        setNativeVteProbeAttempt((attempt) => attempt + 1);
        return;
      }

      if (nativeVteProbeRetryTimerRef.current) {
        const pendingDelay = nativeVteProbeRetryDelayRef.current ?? Number.POSITIVE_INFINITY;
        if (delayMs >= pendingDelay) return;

        clearTimeout(nativeVteProbeRetryTimerRef.current);
        nativeVteProbeRetryTimerRef.current = null;
      }

      nativeVteProbeRetryDelayRef.current = delayMs;

      nativeVteProbeRetryTimerRef.current = setTimeout(() => {
        nativeVteProbeRetryTimerRef.current = null;
        nativeVteProbeRetryDelayRef.current = null;

        if (!shouldRetryNativeVteProbeRef.current) return;

        nativeVteProbeRetryCountRef.current += 1;
        setNativeVteProbeAttempt((attempt) => attempt + 1);
      }, delayMs);
    },
    [clearNativeVteProbeRetryTimer]
  );

  useLayoutEffect(() => {
    isVisibleInLayoutRef.current = isVisibleInLayout;
    isWorkspaceShellVisibleRef.current = isWorkspaceShellVisible;
  }, [isVisibleInLayout, isWorkspaceShellVisible]);

  useEffect(() => {
    connectionStateRef.current = connectionState;
    if (typeof onConnectionStateChange === 'function') {
      onConnectionStateChange(id, connectionState);
    }
  }, [connectionState, id, onConnectionStateChange]);

  useEffect(() => {
    requestedRendererModeRef.current = requestedRendererMode;
  }, [requestedRendererMode]);

  useLayoutEffect(() => {
    effectiveRendererModeRef.current = operationalRendererMode;
    operationalRendererModeRef.current = operationalRendererMode;
  }, [operationalRendererMode]);

  useLayoutEffect(() => {
    visibleTerminalPanelCountRef.current = visibleTerminalPanelCount;
  }, [visibleTerminalPanelCount]);

  // Real WebGL capability probe (runs once per mount, cheap detached canvas test).
  // Populates webglProbeResult so the runtime capabilities and switcher labels are honest.
  useEffect(() => {
    try {
      const result = probeWebglSupport();
      setWebglProbeResult((prev) => {
        if (prev && prev.ready === result.ready && prev.reason === result.reason) {
          return prev;
        }
        return result;
      });
    } catch {
      setWebglProbeResult((prev) => {
        const result = {
          ready: false,
          reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED,
        };
        if (prev && prev.ready === result.ready && prev.reason === result.reason) {
          return prev;
        }
        return result;
      });
    }
  }, []);

  // Surface xterm-webgl demotion as a visible warning when the user asked for WebGL
  // but the resolver (or probe) forced fallback to plain xterm. Clears only demotion-shaped
  // reasons when the user picks a different renderer.
  useEffect(() => {
    if (operationalRendererMode === TERMINAL_OPERATIONAL_CANVAS_MODE) {
      if (
        webglFallback &&
        (webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_UNSUPPORTED_IN_WEBVIEW ||
          webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED ||
          webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_IMPORT_FAILED)
      ) {
        setWebglFallback(null);
      }
      return;
    }

    if (
      requestedRendererMode === 'xterm-webgl' &&
      rendererViewModel.effectiveMode !== 'xterm-webgl'
    ) {
      setWebglFallback({
        active: true,
        reason:
          webglProbeResult?.reason || TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_UNSUPPORTED_IN_WEBVIEW,
      });
    } else if (
      webglFallback &&
      (webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_UNSUPPORTED_IN_WEBVIEW ||
        webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED ||
        webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_IMPORT_FAILED)
    ) {
      // user moved away from the demoted choice — clear the demotion banner
      setWebglFallback(null);
    }
  }, [
    operationalRendererMode,
    requestedRendererMode,
    rendererViewModel.effectiveMode,
    webglProbeResult,
    webglFallback,
  ]);

  const handleSwitchToXterm = useCallback(() => {
    if (typeof onResetRendererToXterm === 'function') {
      onResetRendererToXterm();
      return;
    }
    setWebglFallback(null);
    setWebglProbeResult(probeWebglSupport());
  }, [onResetRendererToXterm]);

  const handleRetryProbe = useCallback(() => {
    setWebglProbeResult(probeWebglSupport());
    setXtermBootNonce((n) => n + 1);
  }, []);

  const buildViewportSnapshot = useCallback(
    (reason) =>
      buildTerminalViewportDiagnosticPayload({
        reason,
        containerRect: containerRef.current?.getBoundingClientRect?.(),
        term: termRef.current,
        documentVisibilityState:
          typeof document !== 'undefined' ? document.visibilityState : 'unknown',
        connectionState: connectionStateRef.current,
        transport: transportRef.current,
        devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
        requestedRendererMode: requestedRendererModeRef.current,
        effectiveRendererMode: effectiveRendererModeRef.current,
        isActivePanel: isActivePanelRef.current,
        isVisibleInLayout: isVisibleInLayoutRef.current,
        webglAttached: Boolean(webglAddonRef.current),
        webglFallbackReason: webglFallback?.reason || null,
        pendingWebglRecovery: Boolean(pendingWebglRecoveryRef.current),
      }),
    [webglFallback?.reason]
  );

  const logViewportDiagnostic = useCallback(
    createTerminalViewportDiagnosticLogger({
      id,
      cliLog,
      lastSnapshotRef: lastViewportDiagnosticRef,
      getSnapshot: buildViewportSnapshot,
    }),
    [buildViewportSnapshot, id]
  );

  const logRenderHealth = useCallback(
    (event, extra = {}) => {
      cliLog(`RENDER:${id}`, event, {
        ...buildViewportSnapshot(event),
        ...extra,
      });
    },
    [buildViewportSnapshot, id]
  );

  const closeNativeLease = useCallback(
    async (reason = 'deactivate') => {
      if (reason === 'renderer-disabled' && restoredHiddenLeaseThisMountRef.current) {
        restoredHiddenLeaseThisMountRef.current = false;
        if (requestedRendererModeRef.current === 'vte-experimental') {
          return;
        }
      }
      if (!nativeLeaseRef.current) {
        clearNativeVteLease(id);
        return;
      }
      nativeLeaseRef.current = false;
      setNativeVteOpened(false);
      clearNativeVteLease(id);
      await Promise.resolve(closeNativeVtePanel({ panelId: id, reason })).catch(() => {});
    },
    [id]
  );

  const tearDownClientSession = useCallback(
    (reason = 'session-close') => {
      sessionClosingRef.current = true;
      cancelNativeVteLayoutHide(id);
      clearNativeVteLease(id);
      clearPanelInitialCommandLifecycle(id);
      clearTimers();
      if (wsRef.current) {
        const stale = wsRef.current;
        stale.onopen = null;
        stale.onmessage = null;
        stale.onerror = null;
        stale.onclose = null;
        stale.close();
        wsRef.current = null;
      }
      disposeXtermRuntime();
      // Native GTK teardown is owned by handleClosePanel → closeNativeVtePanel (single close).
      setConnectionState('terminated');
    },
    [clearTimers, disposeXtermRuntime, id]
  );

  const hideNativeLease = useCallback(
    async (reason = 'inactive') => {
      if (!nativeLeaseRef.current) return;
      cliLog(`CLIENT:${id}`, 'native VTE hide requested', { reason });
      await Promise.resolve(
        setNativeVtePanelVisibility({
          panelId: id,
          visible: false,
          reason,
        })
      ).catch(() => {});
      if (reason === 'layout-unmount') {
        markNativeVteLeaseHidden(id);
      }
    },
    [id]
  );

  const applyTerminalSessionExit = useCallback(
    (detail = {}, { emitBrowserEvent = false } = {}) => {
      const panelId = detail?.id || detail?.panelId;
      if (panelId && panelId !== id) return;

      const reason = detail?.reason || null;
      const command = detail?.initialCommand || initialCommand;
      const parsed = parseTerminalExitReason(reason);
      const agentSession = parsed.kind === 'agent' || isAgentTuiCommand(command);

      processExitedRef.current = true;
      tuiSessionActiveRef.current = false;
      isGrokSessionRef.current = false;
      grokTuiReadyRef.current = false;
      tuiSessionFooterConfirmedRef.current = false;
      setNativeWheelPassthrough(false);
      setSessionExitReason(reason);
      disableTerminalFocusReporting(termRef.current, { disableMouse: true });

      if (agentSession && parsed.kind === 'agent') {
        setConnectionState('agent-exited');
        persistPanelSessionExit(id, { reason, connectionState: 'agent-exited' });
      } else if (agentSession && parsed.abnormal) {
        setConnectionState('terminated');
        clearPanelSessionExit(id);
      } else {
        setConnectionState('terminated');
        clearPanelSessionExit(id);
      }

      if (requestedRendererModeRef.current === 'vte-experimental' && nativeLeaseRef.current) {
        const bounds = getNativeTerminalBounds(
          containerRef.current || nativePlaceholderRef.current
        );
        if (bounds) {
          void Promise.resolve(
            setNativeVtePanelVisibility({
              panelId: id,
              visible: true,
              bounds,
            })
          ).catch(() => {});
        }
      }

      if (requestedRendererModeRef.current !== 'vte-experimental' && termRef.current) {
        const overlayCopy = buildTerminalExitOverlayCopy({
          initialCommand: command,
          reason,
          connectionState: agentSession && parsed.kind === 'agent' ? 'agent-exited' : 'terminated',
        });
        termRef.current?.writeln(`\r\n\x1b[33m[${overlayCopy.title}]\x1b[0m`);
      }

      if (emitBrowserEvent) {
        window.dispatchEvent(
          new CustomEvent('devhub:terminal-exit', {
            detail: { id, initialCommand: command, reason },
          })
        );
      }
    },
    [id, initialCommand, setConnectionState]
  );

  useLayoutEffect(() => {
    cancelNativeVteLayoutHide(id);
    const persistedExit = readPanelSessionExit(id);
    const restoredLease = consumeHiddenNativeVteLease(id);
    if (!restoredLease && !persistedExit) return;

    nativeLeaseRef.current = true;
    restoredHiddenLeaseThisMountRef.current = Boolean(restoredLease);
    setNativeVteOpened(true);
    setNativeVteProbeResult((prev) => prev ?? { ready: true, reason: null });

    if (persistedExit) {
      processExitedRef.current = true;
      setSessionExitReason(persistedExit.reason);
      setConnectionState(persistedExit.connectionState);
      return;
    }

    setConnectionState('connected');
  }, [id]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      // Window/view switches unmount React but must keep the GTK lease + PTY alive.
      // Permanent teardown runs via tearDownClientSession / handleClosePanel first.
      if (sessionClosingRef.current) {
        cancelNativeVteLayoutHide(id);
        clearNativeVteLease(id);
        return;
      }
      deferNativeVteLayoutHide(id, () => {
        hideNativeLease('layout-unmount');
      });
    };
  }, [closeNativeLease, hideNativeLease, id]);

  const handleNativeLeaseCommandError = useCallback(
    (error) => {
      const reason = String(error?.message || error || '');
      if (!reason.includes('panel-not-active')) return;

      nativeLeaseRef.current = false;
      setNativeVteOpened(false);
      setNativeVteOpenFailure(null);
      nativeVteProbeRetryCountRef.current = 0;
      clearNativeVteProbeRetryTimer();
      setNativeVteRecoveryAttempt((attempt) => attempt + 1);
    },
    [clearNativeVteProbeRetryTimer]
  );

  const showNativeLease = useCallback(async () => {
    if (!nativeLeaseRef.current) return;
    const bounds = getNativeTerminalBounds(containerRef.current || nativePlaceholderRef.current);
    if (!bounds) {
      cliLog(`CLIENT:${id}`, 'native VTE show skipped — invalid bounds');
      return;
    }
    cliLog(`CLIENT:${id}`, 'native VTE show requested', { bounds });
    await Promise.resolve(
      setNativeVtePanelVisibility({
        panelId: id,
        visible: true,
        bounds,
      })
    ).catch(handleNativeLeaseCommandError);
  }, [handleNativeLeaseCommandError, id]);

  const resizeNativeLease = useCallback(async () => {
    if (!nativeLeaseRef.current) return;
    const bounds = getNativeTerminalBounds(containerRef.current || nativePlaceholderRef.current);
    if (!bounds) {
      cliLog(`CLIENT:${id}`, 'native VTE resize skipped — invalid bounds');
      return;
    }
    cliLog(`CLIENT:${id}`, 'native VTE resize requested', { bounds });
    await Promise.resolve(
      resizeNativeVtePanel({
        panelId: id,
        bounds,
      })
    ).catch(handleNativeLeaseCommandError);
  }, [handleNativeLeaseCommandError, id]);

  const showAndResizeNativeLease = useCallback(async () => {
    await showNativeLease();
    await resizeNativeLease();
  }, [resizeNativeLease, showNativeLease]);

  const waitForVisibleDimensions = useCallback(async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const container = containerRef.current;
      if (!container) return false;

      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && document.visibilityState !== 'hidden') {
        return true;
      }

      await new Promise((resolve) => {
        rafRef.current = requestAnimationFrame(() => {
          timeoutRef.current = setTimeout(resolve, 16);
        });
      });
    }

    const rect = containerRef.current?.getBoundingClientRect();
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  }, []);

  const resolveSwarmTmuxSessionName = useCallback(() => {
    if (!swarmContext?.isSwarmRole) return null;
    return buildSwarmTmuxSessionName(swarmContext.launchId, swarmContext.roleKey);
  }, [swarmContext]);

  const notifyAgentReady = useCallback(
    async (program = 'opencode', opencodeSessionId, reason = 'client-tui-footer') => {
      const normalizedProgram = String(program || 'opencode').trim() || 'opencode';
      const notifiedRef =
        normalizedProgram === 'kimi' ? kimiReadyNotifiedRef : opencodeReadyNotifiedRef;
      if (notifiedRef.current) return;
      const tmuxSession = resolveSwarmTmuxSessionName();
      if (!tmuxSession) return;

      const storageKey = `devhub:agent-ready-posted:${normalizedProgram}:${tmuxSession}`;
      try {
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(storageKey)) {
          notifiedRef.current = true;
          return;
        }
      } catch {
        /* ignore */
      }

      notifiedRef.current = true;
      try {
        await fetch('/api/terminal/opencode-ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: id,
            tmuxSession,
            program: normalizedProgram,
            opencodeSessionId: opencodeSessionId || null,
            reason,
          }),
        });
        cliLog(`CLIENT:${id}`, 'agent-ready-notified', {
          tmuxSession,
          program: normalizedProgram,
          opencodeSessionId,
          reason,
        });
        try {
          sessionStorage?.setItem(storageKey, String(Date.now()));
        } catch {
          /* ignore */
        }
      } catch (error) {
        notifiedRef.current = false;
        cliLog(`CLIENT:${id}`, 'agent-ready-failed', {
          program: normalizedProgram,
          error: error?.message,
        });
      }
    },
    [id, resolveSwarmTmuxSessionName]
  );

  const notifyOpencodeReady = useCallback(
    (opencodeSessionId, reason = 'client-tui-footer') =>
      notifyAgentReady('opencode', opencodeSessionId, reason),
    [notifyAgentReady]
  );

  const notifyViewportReady = useCallback(
    (cols, rows) => {
      const tmuxSession = resolveSwarmTmuxSessionName();
      if (!tmuxSession) return;

      const lastPosted = lastViewportReadyPostedRef.current;
      if (lastPosted.cols === cols && lastPosted.rows === rows) return;

      if (viewportReadyNotifyTimerRef.current) {
        clearTimeout(viewportReadyNotifyTimerRef.current);
      }

      viewportReadyNotifyTimerRef.current = setTimeout(() => {
        viewportReadyNotifyTimerRef.current = null;
        lastViewportReadyPostedRef.current = { cols, rows };

        void (async () => {
          try {
            await fetch('/api/terminal/viewport-ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: id,
                tmuxSession,
                cols,
                rows,
              }),
            });
            cliLog(`CLIENT:${id}`, 'viewport-ready-notified', { tmuxSession, cols, rows });
            // Bootstrap waits for client-tui-footer (OpenCode MCP /status row), not
            // viewport attach — posting opencode-ready here caused premature paste and
            // ANSI garbage while OpenCode was still starting.
          } catch (error) {
            cliLog(`CLIENT:${id}`, 'viewport-ready-failed', { error: error?.message });
          }
        })();
      }, 200);
    },
    [id, resolveSwarmTmuxSessionName]
  );

  const skipRedundantInitialCommandSend = useCallback(
    (commandToSend, isRecoveryRelaunch = false) =>
      shouldSkipRedundantInitialCommandSend({
        panelId: id,
        command: commandToSend,
        isRecoveryRelaunch,
        sessionReattached: sessionReattachedRef.current,
      }),
    [id]
  );

  const restoreInitialCommandDispatchGuard = useCallback(() => {
    if (hasSentInitialCommand.current) return;
    const record = getPanelInitialCommandDispatch(id);
    if (record?.command) {
      hasSentInitialCommand.current = true;
      sessionReattachedRef.current = true;
      return;
    }
    // Only suppress a fresh initialCommand when the server has already declared the
    // session reattached (live tmux pane). The first connection of a fresh panel has
    // hasConnectedOnceRef === true but is NOT a reattach, so relying on that flag alone
    // prevented workspace-modal panels from ever injecting their launch command.
    if (sessionReattachedRef.current && hasConnectedOnceRef.current && initialCommand) {
      sessionReattachedRef.current = true;
      hasSentInitialCommand.current = true;
    }
  }, [id, initialCommand]);

  const resolveInjectCommand = useCallback(() => {
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    const agentRun = readAgentRunForPanel(storage, id);
    return resolveTerminalInjectCommand(initialCommand, agentRun);
  }, [id, initialCommand]);

  const sendInitialCommandIfReady = useCallback(() => {
    if (!initialCommand || hasSentInitialCommand.current) return;
    // Extra guard against re-injection when the local ref was reset (e.g. a reconnect
    // race or a remount that kept the panel ID). The lifecycle store survives remounts.
    if (
      shouldSkipRedundantInitialCommandSend({
        panelId: id,
        command: initialCommand,
        sessionReattached: sessionReattachedRef.current,
      })
    ) {
      logTerminalSession('initial-command-skipped', {
        panelId: id,
        reason: 'redundant-lifecycle-early',
        command: initialCommand,
        sessionReattached: sessionReattachedRef.current,
      });
      hasSentInitialCommand.current = true;
      return;
    }
    // Never send the launch/resume command before the server's `ready` message, and
    // never on reattach — a reattach means the tmux pane already has a live TUI, so
    // typing `opencode --session …` / `grok` into it would echo as visible text in the
    // conversation (Bug B). Only a fresh (reattached: false) session should be launched.
    if (!serverReadyReceivedRef.current) return;
    if (sessionReattachedRef.current) {
      hasSentInitialCommand.current = true;
      markPanelInitialCommandDispatched(id, initialCommand);
      return;
    }
    if (!viewportFitConfirmedRef.current) return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    // Fresh panels created from the workspace modal must wait for the host surface
    // projection before injecting the launch command. Sending too early can leave the
    // terminal blank because xterm has not rendered the viewport yet.
    const projectionElapsedMs = Date.now() - panelCreatedAtRef.current;
    console.log(
      `[DEBUG TTY:${id}] sendInitialCommandIfReady called. cmd=${initialCommand}, projectionReady=${projectionReadyRef.current}, elapsed=${projectionElapsedMs}ms, viewportFit=${viewportFitConfirmedRef.current}, wsOpen=${wsRef.current?.readyState === WebSocket.OPEN}`
    );
    if (!projectionReadyRef.current && projectionElapsedMs < TERMINAL_PROJECTION_READY_TIMEOUT_MS) {
      if (initialCommandProjectionRetryTimerRef.current) {
        window.clearTimeout(initialCommandProjectionRetryTimerRef.current);
      }
      console.log(`[DEBUG TTY:${id}] projection not ready, scheduling retry in 50ms`);
      initialCommandProjectionRetryTimerRef.current = window.setTimeout(() => {
        initialCommandProjectionRetryTimerRef.current = null;
        sendInitialCommandIfReady();
      }, 50);
      return;
    }

    const isRecoveryRelaunch = /#recovery-\d+\s*$/i.test(initialCommand);
    let commandToSend = null;

    if (swarmContext?.isSwarmRole) {
      const wrapperAlreadyDispatched = isSwarmLaunchWrapperDispatched(
        {
          launchId: swarmContext.launchId,
          roleKey: swarmContext.roleKey,
        },
        typeof window !== 'undefined' ? window.localStorage : null
      );
      if (wrapperAlreadyDispatched || swarmContext?.needsLaunchWrapper !== true) {
        logTerminalSession('initial-command-skipped', {
          panelId: id,
          reason: wrapperAlreadyDispatched
            ? 'swarm-wrapper-already-dispatched'
            : 'swarm-tmux-reattach',
          command: initialCommand,
        });
        hasSentInitialCommand.current = true;
        markPanelInitialCommandDispatched(id, initialCommand);
        return;
      }

      // Fresh swarm launch: inject materialized bash wrapper directly.
      // resolveTerminalInjectCommand intentionally returns null for wrappers (reconnect safety).
      commandToSend = String(initialCommand || '')
        .replace(/\s*#recovery-\d+\s*$/i, '')
        .trim();
      if (!commandToSend || !isSwarmLaunchWrapperCommand(commandToSend)) {
        logTerminalSession('initial-command-skipped', {
          panelId: id,
          reason: 'swarm-wrapper-command-missing',
          command: initialCommand,
        });
        hasSentInitialCommand.current = true;
        return;
      }
    } else {
      commandToSend = resolveInjectCommand();
      if (!commandToSend) {
        logTerminalSession('initial-command-skipped', {
          panelId: id,
          reason: 'no-resolved-inject-command',
          command: initialCommand,
          isRecoveryRelaunch,
        });
        hasSentInitialCommand.current = true;
        return;
      }
    }

    if (skipRedundantInitialCommandSend(commandToSend, isRecoveryRelaunch)) {
      logTerminalSession('initial-command-skipped', {
        panelId: id,
        reason: 'redundant-lifecycle',
        command: initialCommand,
        isRecoveryRelaunch,
      });
      hasSentInitialCommand.current = true;
      markPanelInitialCommandDispatched(id, initialCommand);
      return;
    }
    if (
      shouldBlockLateInitialCommandSend({
        hasConnectedOnce: hasConnectedOnceRef.current,
        isRecoveryRelaunch,
        snapshotCommand: initialCommandConnectSnapshotRef.current,
        currentCommand: initialCommand,
      })
    ) {
      logTerminalSession('initial-command-blocked', {
        panelId: id,
        reason: 'late-command-change',
        snapshotCommand: initialCommandConnectSnapshotRef.current,
        currentCommand: initialCommand,
      });
      hasSentInitialCommand.current = true;
      markPanelInitialCommandDispatched(id, initialCommand);
      return;
    }

    const cleanCommand = commandToSend.replace(/\s*#recovery-\d+\s*$/, '');
    logTerminalSession('initial-command-sent', {
      panelId: id,
      command: cleanCommand,
      sourceCommand: initialCommand,
      isRecoveryRelaunch,
      transport: transportRef.current,
    });
    console.log(`[TTY:${id}] Sending initial command: ${cleanCommand}`);
    if (transportRef.current === 'raw') {
      wsRef.current.send(cleanCommand + '\r');
    } else {
      wsRef.current.send(JSON.stringify({ type: 'input', data: cleanCommand + '\r' }));
    }
    hasSentInitialCommand.current = true;
    markPanelInitialCommandDispatched(id, commandToSend);
    if (swarmContext?.isSwarmRole && swarmContext?.needsLaunchWrapper === true) {
      markSwarmLaunchWrapperDispatched(
        {
          launchId: swarmContext.launchId,
          roleKey: swarmContext.roleKey,
          panelId: id,
        },
        typeof window !== 'undefined' ? window.localStorage : null
      );
      window.dispatchEvent(
        new CustomEvent('devhub:swarm-launch-wrapper-sent', { detail: { panelId: id } })
      );
    }
  }, [id, initialCommand, resolveInjectCommand, skipRedundantInitialCommandSend, swarmContext]);

  const scheduleInitialCommandAfterViewport = useCallback(() => {
    if (initialCommandDelayScheduledRef.current) return;
    initialCommandDelayScheduledRef.current = true;

    const delayMs = Math.max(0, Number(swarmContext?.startAfterMs) || 0);
    if (initialCommandDelayTimerRef.current) {
      window.clearTimeout(initialCommandDelayTimerRef.current);
      initialCommandDelayTimerRef.current = null;
    }
    if (delayMs > 0) {
      initialCommandDelayTimerRef.current = window.setTimeout(() => {
        initialCommandDelayTimerRef.current = null;
        sendInitialCommandIfReady();
      }, delayMs);
      return;
    }
    sendInitialCommandIfReady();
  }, [sendInitialCommandIfReady, swarmContext?.startAfterMs]);

  const confirmViewportFit = useCallback(
    (cols, rows) => {
      if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) return;
      viewportFitConfirmedRef.current = true;

      const lastPosted = lastViewportReadyPostedRef.current;
      const sizeChanged = lastPosted.cols !== cols || lastPosted.rows !== rows;
      if (sizeChanged) {
        notifyViewportReady(cols, rows);
      }

      restoreInitialCommandDispatchGuard();
      if (!hasSentInitialCommand.current) {
        scheduleInitialCommandAfterViewport();
      }
    },
    [notifyViewportReady, restoreInitialCommandDispatchGuard, scheduleInitialCommandAfterViewport]
  );

  const maybeConnectAfterViewportFit = useCallback(
    (fitWorked) => {
      if (!fitWorked || !termRef.current || !containerRef.current) {
        if (!hasConnectedOnceRef.current) {
          connectPendingUntilFitRef.current = true;
          scheduleConnectDeferForce();
        }
        return false;
      }

      const rect = containerRef.current.getBoundingClientRect();
      if (
        shouldDeferTerminalConnectUntilViewportFitted({
          ready: true,
          fitWorked,
          containerRect: rect,
          term: termRef.current,
          hasConnectedOnce: hasConnectedOnceRef.current,
        })
      ) {
        if (!hasConnectedOnceRef.current) {
          connectPendingUntilFitRef.current = true;
          scheduleConnectDeferForce();
        }
        return false;
      }

      clearConnectDeferTimer();
      connectPendingUntilFitRef.current = false;
      if (!hasConnectedOnceRef.current || wsRef.current?.readyState !== WebSocket.OPEN) {
        const staggerMs = resolveColdMountStaggerMs({
          coldMountOrdinal,
          isVisibleInLayout: isVisibleInLayoutRef.current,
        });
        if (staggerMs > 0 && !hasConnectedOnceRef.current) {
          connectDeferTimerRef.current = setTimeout(() => {
            connectDeferTimerRef.current = null;
            if (!hasConnectedOnceRef.current && !sessionClosingRef.current) {
              connectRef.current?.();
            }
          }, staggerMs);
        } else {
          connectRef.current?.();
        }
      }
      return true;
    },
    [clearConnectDeferTimer, coldMountOrdinal, scheduleConnectDeferForce]
  );

  const fitAndResize = useCallback(
    (options = {}) => {
      // Never fit/resize while the runtime is being disposed: the WebGL/Canvas
      // addon's renderer slot may be half-cleared (A.4 guard).
      if (isDisposingRef.current) {
        logViewportDiagnostic('fit-skip');
        return false;
      }
      const clearAtlas =
        options.clearAtlas ??
        (isActivePanelRef.current ||
          shouldClearAtlasForSplitCanvas({
            operationalRendererMode: operationalRendererModeRef.current,
            visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
          }));
      const fitWorked = fitTerminalViewport({
        container: containerRef.current,
        fitAddon: fitRef.current,
        term: termRef.current,
        socket: wsRef.current,
        clearAtlas,
        lastPtySizeRef: lastPtySizeRef.current,
        skipPtyNotify:
          options.skipPtyNotify ??
          (hasConnectedOnceRef.current &&
            (tuiSessionActiveRef.current ||
              shouldSkipKimiTuiPtyResize({
                initialCommand,
                hasConnectedOnce: hasConnectedOnceRef.current,
                kimiReady: kimiReadyNotifiedRef.current,
              })) &&
            !options.forcePtyResize),
      });

      if (fitWorked && termRef.current) {
        confirmViewportFit(termRef.current.cols, termRef.current.rows);
      }

      if (connectPendingUntilFitRef.current) {
        maybeConnectAfterViewportFit(fitWorked);
      }

      logViewportDiagnostic(fitWorked ? 'fit-resize' : 'fit-skipped');
      return fitWorked;
    },
    [confirmViewportFit, initialCommand, logViewportDiagnostic, maybeConnectAfterViewportFit]
  );

  const scrollTerminalToBottom = useCallback((force = false) => {
    if (!termRef.current) return;
    if (!force && !isTerminalViewportNearBottom(termRef.current)) return;

    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
    }

    autoScrollRafRef.current = requestAnimationFrame(() => {
      autoScrollRafRef.current = null;
      termRef.current?.scrollToBottom?.();
    });
  }, []);

  const scrollIfActivePanel = useCallback(() => {
    if (isActivePanelRef.current) scrollTerminalToBottom();
  }, [scrollTerminalToBottom]);

  /**
   * Best-effort disposal of a WebGL addon whose context was lost while the
   * OS window was in the background. Marks the panel for reattach so the
   * bounded GPU recover loop will recreate the renderer on restore.
   */
  const disposeWebglAddonForContextLoss = useCallback(
    (reason = 'webgl-context-lost') => {
      const addon = webglAddonRef.current;
      if (!addon) return false;

      cliLog(`RENDER:${id}`, reason, buildViewportSnapshot(reason));

      neutralizeWebglAddonForDisposal(addon);
      try {
        addon.dispose?.();
      } catch {
        // ignore double dispose
      }
      webglAddonRef.current = null;
      pendingWebglRecoveryRef.current = true;
      webglReleasedOnLayoutHideRef.current = true;

      stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
      return true;
    },
    [buildViewportSnapshot, id]
  );

  const scheduleInactiveViewportRepaint = useCallback(() => {
    if (isActivePanelRef.current && isVisibleInLayoutRef.current) return;
    if (!termRef.current) return;
    if (inactiveRepaintRafRef.current) return;

    inactiveRepaintRafRef.current = requestAnimationFrame(() => {
      inactiveRepaintRafRef.current = null;
      if (!isVisibleInLayoutRef.current) {
        needsViewportSyncOnShowRef.current = true;
        return;
      }
      const term = termRef.current;
      const container = containerRef.current;
      const fitAddon = fitRef.current;
      const rect = container?.getBoundingClientRect();
      const splitCanvasClear = shouldClearAtlasForSplitCanvas({
        operationalRendererMode: operationalRendererModeRef.current,
        visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
      });
      let colsBefore = term?.cols;
      let rowsBefore = term?.rows;
      let geometryChanged = false;
      const kimiConnected = shouldSkipKimiTuiPtyResize({
        initialCommand,
        hasConnectedOnce: hasConnectedOnceRef.current,
        kimiReady: kimiReadyNotifiedRef.current,
      });

      if (!rect || rect.width <= 0 || rect.height <= 0) {
        needsViewportSyncOnShowRef.current = true;
        if (workspaceShowRecoverTimerRef.current) {
          clearTimeout(workspaceShowRecoverTimerRef.current);
        }
        workspaceShowRecoverTimerRef.current = window.setTimeout(() => {
          workspaceShowRecoverTimerRef.current = null;
          scheduleInactiveViewportRepaint();
        }, 80);
        return;
      }

      if (!kimiConnected && fitAddon && term) {
        colsBefore = term.cols;
        rowsBefore = term.rows;
        const fitWorked = fitTerminalViewport({
          container,
          fitAddon,
          term,
          socket: wsRef.current,
          clearAtlas: false,
          lastPtySizeRef: lastPtySizeRef.current,
        });
        geometryChanged = fitWorked && (term.cols !== colsBefore || term.rows !== rowsBefore);
        if (fitWorked) {
          confirmViewportFit(term.cols, term.rows);
          if (geometryChanged) {
            nudgeTerminalPtyResize({
              term,
              socket: wsRef.current,
              lastPtySizeRef: lastPtySizeRef.current,
            });
          }
          if (connectPendingUntilFitRef.current) {
            maybeConnectAfterViewportFit(fitWorked);
          }
        }
      }
      if (
        shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        isWebglAddonContextLost(webglAddonRef.current)
      ) {
        disposeWebglAddonForContextLoss('inactive-webgl-context-lost');
        void tryReattachWebglAddonRef.current?.({ clearAtlas: true }).then((reattached) => {
          if (reattached && termRef.current && isTerminalRendererReady(termRef.current)) {
            refreshTerminalViewport(termRef.current);
          }
        });
        return;
      }
      if (
        shouldAttachCanvasRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        !canvasAddonRef.current
      ) {
        void tryReattachCanvasAddonRef.current?.().then(() => {
          if (termRef.current && isTerminalRendererReady(termRef.current)) {
            refreshTerminalViewport(termRef.current);
          }
        });
        return;
      }
      if (termRef.current && isTerminalRendererReady(termRef.current)) {
        if (geometryChanged) {
          stabilizeTerminalRenderer(termRef.current, {
            clearAtlas: splitCanvasClear,
          });
        }
        refreshTerminalViewport(termRef.current);
        // Same stale-bitmap fix as reactivateTerminalViewport: an inactive split TUI
        // panel whose geometry didn't change won't redraw on OS window restore without
        // a real resize nudge (Bug A).
        if (tuiSessionActiveRef.current) {
          forceTerminalViewportRepaint(termRef.current);
        }
      }
    });
  }, [confirmViewportFit, disposeWebglAddonForContextLoss, initialCommand]);

  const releaseCanvasAddon = useCallback(
    (reason = 'canvas-released') => {
      const addon = canvasAddonRef.current;
      if (!addon) return false;

      cliLog(`RENDER:${id}`, 'canvas-released', buildViewportSnapshot(reason));

      try {
        addon.dispose?.();
      } catch {
        // ignore double dispose
      }
      canvasAddonRef.current = null;
      canvasReleasedOnLayoutHideRef.current = true;
      stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
      return true;
    },
    [buildViewportSnapshot, id]
  );

  const releaseWebglAddonForInactivePanel = useCallback(
    (reason = 'panel-inactive-dom-fallback') => {
      const addon = webglAddonRef.current;
      if (!addon) return false;

      if (webglRecoveryTimerRef.current) {
        clearTimeout(webglRecoveryTimerRef.current);
        webglRecoveryTimerRef.current = null;
      }

      cliLog(`RENDER:${id}`, 'webgl-released-inactive-panel', buildViewportSnapshot(reason));

      neutralizeWebglAddonForDisposal(addon);
      try {
        addon.dispose?.();
      } catch {
        // ignore double dispose
      }
      webglAddonRef.current = null;
      pendingWebglRecoveryRef.current = true;
      webglReleasedOnLayoutHideRef.current = true;

      stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
      return true;
    },
    [buildViewportSnapshot, id]
  );

  const tryReattachCanvasAddon = useCallback(async () => {
    const term = termRef.current;
    if (!term || canvasAddonRef.current) return false;
    if (
      !shouldMountCanvasAddon({
        operationalRendererMode: effectiveRendererModeRef.current,
        isActivePanel: isActivePanelRef.current,
        isVisibleInLayout: isVisibleInLayoutRef.current,
        visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
      })
    ) {
      return false;
    }
    // ponytail: empty RenderService slot fails isTerminalRendererReady but loadAddon still revives GPU
    if (!term.element?.isConnected || term._core?._isDisposed) return false;

    try {
      const { CanvasAddon: CanvasAddonCtor } = await import('xterm-addon-canvas');
      if (!termRef.current || canvasAddonRef.current) return false;

      const canvasAddon = new CanvasAddonCtor();
      canvasAddonRef.current = canvasAddon;
      termRef.current.loadAddon(canvasAddon);

      const fitWorked = fitTerminalViewport({
        container: containerRef.current,
        fitAddon: fitRef.current,
        term: termRef.current,
        socket: wsRef.current,
        clearAtlas: true,
        lastPtySizeRef: lastPtySizeRef.current,
        skipPtyNotify:
          tuiSessionActiveRef.current ||
          shouldSkipKimiTuiPtyResize({
            initialCommand,
            hasConnectedOnce: hasConnectedOnceRef.current,
            kimiReady: kimiReadyNotifiedRef.current,
          }),
      });
      if (!fitWorked) {
        try {
          canvasAddon.dispose?.();
        } catch {
          // ignore double dispose
        }
        canvasAddonRef.current = null;
        canvasReleasedOnLayoutHideRef.current = true;
        return false;
      }
      stabilizeTerminalRenderer(termRef.current, { clearAtlas: true });
      canvasReleasedOnLayoutHideRef.current = false;
      cliLog(`RENDER:${id}`, 'canvas-attached', buildViewportSnapshot('canvas-reattach'));
      return true;
    } catch (error) {
      console.warn(
        `[TTY:${id}] Canvas reattach failed, staying on DOM renderer`,
        error?.message || error
      );
      return false;
    }
  }, [buildViewportSnapshot, id, initialCommand]);

  const tryReattachWebglAddon = useCallback(
    async ({ clearAtlas = true, skipFitWhenUnchanged = false } = {}) => {
      const term = termRef.current;
      if (!term || webglAddonRef.current) return false;
      if (
        !shouldAttachWebglRenderer({ operationalRendererMode: effectiveRendererModeRef.current })
      ) {
        return false;
      }
      if (!isVisibleInLayoutRef.current) {
        pendingWebglRecoveryRef.current = true;
        return false;
      }
      if (!isTerminalRendererReady(term)) return false;

      try {
        const { WebglAddon: WebglAddonCtor } = await import('xterm-addon-webgl');
        if (!termRef.current || webglAddonRef.current) return false;

        const webglAddon = new WebglAddonCtor();
        webglAddonRef.current = webglAddon;

        if (typeof webglAddon.onContextLoss === 'function') {
          webglAddon.onContextLoss(() => handleWebglContextLossRef.current?.());
        }

        termRef.current.loadAddon(webglAddon);
        setWebglFallback(null);
        pendingWebglRecoveryRef.current = false;
        webglReleasedOnLayoutHideRef.current = false;

        const colsBefore = Number(termRef.current.cols ?? 0);
        const rowsBefore = Number(termRef.current.rows ?? 0);
        const proposedDims = proposeTerminalViewportDimensions({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
        });
        const viewportUnchanged =
          skipFitWhenUnchanged &&
          colsBefore > 0 &&
          rowsBefore > 0 &&
          proposedDims?.cols === colsBefore &&
          proposedDims?.rows === rowsBefore;

        if (viewportUnchanged) {
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        } else {
          fitTerminalViewport({
            container: containerRef.current,
            fitAddon: fitRef.current,
            term: termRef.current,
            socket: wsRef.current,
            clearAtlas,
            lastPtySizeRef: lastPtySizeRef.current,
            skipPtyNotify:
              tuiSessionActiveRef.current ||
              shouldSkipKimiTuiPtyResize({
                initialCommand,
                hasConnectedOnce: hasConnectedOnceRef.current,
                kimiReady: kimiReadyNotifiedRef.current,
              }),
          });
          stabilizeTerminalRenderer(termRef.current, { clearAtlas });
        }
        cliLog(`CLIENT:${id}`, 'WebGL addon reattached after context loss');
        return true;
      } catch (error) {
        console.warn(
          `[TTY:${id}] WebGL reattach failed, staying on DOM renderer`,
          error?.message || error
        );
        pendingWebglRecoveryRef.current = true;
        return false;
      }
    },
    [id, initialCommand]
  );

  const scheduleWebglRecovery = useCallback(
    (delayMs = 400, { clearAtlas = true } = {}) => {
      if (webglRecoveryTimerRef.current) {
        clearTimeout(webglRecoveryTimerRef.current);
      }
      webglRecoveryTimerRef.current = setTimeout(() => {
        webglRecoveryTimerRef.current = null;
        void tryReattachWebglAddon({ clearAtlas });
      }, delayMs);
    },
    [tryReattachWebglAddon]
  );

  const handleWebglContextLoss = useCallback(() => {
    const addon = webglAddonRef.current;
    console.warn(`[TTY:${id}] WebGL context lost — falling back to DOM renderer`);
    cliLog(
      `RENDER:${id}`,
      'webgl-context-lost-dom-fallback',
      buildViewportSnapshot('webgl-context-lost')
    );

    try {
      addon?.dispose?.();
    } catch {
      // Ignore double dispose
    }
    webglAddonRef.current = null;
    setWebglFallback(null);
    pendingWebglRecoveryRef.current = true;

    stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });

    if (isVisibleInLayoutRef.current) {
      scheduleWebglRecovery();
      scheduleBoundedGpuRecoverRef.current?.(40);
      scheduleBoundedFitRepaintRef.current?.(40);
      scheduleWorkspaceShowRecoveryRef.current?.(WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON);
      if (!isActivePanelRef.current) {
        scheduleInactiveViewportRepaint();
      }
    }
  }, [id, scheduleInactiveViewportRepaint, scheduleWebglRecovery]);

  useEffect(() => {
    handleWebglContextLossRef.current = handleWebglContextLoss;
  }, [handleWebglContextLoss]);

  // Bounded retry that forces a REAL canvas repaint (1-cell nudge = equivalent to
  // a manual resize) across frames until forceTerminalViewportRepaint returns true.
  // Needed because the GPU renderer (canvas/webgl) is released while the workspace
  // shell is hidden and reattached async; the first attempt usually runs before the
  // reattach completes so the renderer slot is empty and force bails. Without retry,
  // panels stay black until a manual resize. Guards bail on dispose/hide; no PTY
  // SIGWINCH is ever sent (forceTerminalViewportRepaint never notifies the PTY).
  const scheduleBoundedForceRepaint = useCallback((maxAttempts = 24) => {
    let attempts = 0;
    const attempt = () => {
      if (isDisposingRef.current || !termRef.current || !isVisibleInLayoutRef.current) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        if (attempts++ < maxAttempts) requestAnimationFrame(attempt);
        return;
      }
      if (forceTerminalViewportRepaint(termRef.current)) return;
      if (attempts++ < maxAttempts) requestAnimationFrame(attempt);
    };
    attempt();
  }, []);

  // Bounded retry that does a REAL fit (recalculate cols/rows from the container
  // AND send SIGWINCH to the PTY when cols change) across frames until the
  // terminal's cols/rows match the container's real capacity. This is the
  // automatic equivalent of a manual split-drag resize — the ONLY thing that
  // reliably fixes the "black gutters on the right" symptom, where a TUI (grok,
  // OpenCode, etc.) paints at a stale smaller width after a workspace switch and
  // leaves a dead black strip between the TUI content and the panel border.
  //
  // Why a new helper and not scheduleBoundedForceRepaint: the 1-cell nudge only
  // repaints xterm's bitmap at the CURRENT cols/rows — it never recomputes them
  // from the container and never notifies the PTY, so a TUI drawing at stale dims
  // stays guted. And syncTerminalViewportOnWorkspaceShow's DOM-TUI freeze path
  // calls nudgeTerminalPtyResize WITHOUT force, which bails when lastPtySizeRef
  // matches the (stale) cols → no SIGWINCH → the TUI never redraws at full width.
  // fitTerminalViewport does both jobs (resize term + PTY notify) but bails until
  // isTerminalRendererReady (async GPU reattach) and while the container is
  // zero-sized during the switch transition, so it must be retried across frames.
  //
  // ponytail: skip kimi's live Ink TUI — its workspace-show path intentionally
  // uses skipPtyNotify to avoid disrupting Ink's re-render loop; sending it a
  // SIGWINCH here could worsen the "kimi crashes sometimes" symptom. Kimi keeps
  // its existing specialized freeze path. fitTerminalViewport only sends SIGWINCH
  // when cols actually change (lastPtySizeRef guard), so bounded fit is safe for
  // Kimi/OpenCode once container dims differ from the stale grid.
  const scheduleBoundedFitRepaint = useCallback(
    (maxAttempts = 24) => {
      let attempts = 0;
      // ponytail: require the container's proposed dims to be STABLE across 2
      // consecutive frames before stopping. On a workspace switch the PanelGroup /
      // xterm canvas is still settling a frame or two after the first fit, so the
      // container often reports a transient narrow width; stopping on the first
      // settled frame leaves the term at those narrow cols → black strip on the
      // right (Grok/DOM TUI symptom). Waiting one extra frame for stability costs
      // one no-op fit and catches the container's final width. Ceiling: a container
      // that keeps oscillating forever would burn maxAttempts no-op fits then stop;
      // upgrade path is a ResizeObserver-driven fit instead of rAF polling.
      let lastProposed = null;
      const attempt = () => {
        if (isDisposingRef.current || !termRef.current || !isVisibleInLayoutRef.current) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          if (attempts++ < maxAttempts) requestAnimationFrame(attempt);
          return;
        }
        const fitWorked = fitTerminalViewport({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
          socket: wsRef.current,
          clearAtlas: false,
          lastPtySizeRef: lastPtySizeRef.current,
        });
        const proposed = proposeTerminalViewportDimensions({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
        });
        const settled =
          fitWorked &&
          proposed &&
          Number(proposed.cols) === Number(termRef.current.cols) &&
          Number(proposed.rows) === Number(termRef.current.rows);
        const stable =
          lastProposed !== null &&
          proposed &&
          Number(lastProposed.cols) === Number(proposed.cols) &&
          Number(lastProposed.rows) === Number(proposed.rows);
        lastProposed =
          proposed && Number(proposed.cols) > 0
            ? { cols: Number(proposed.cols), rows: Number(proposed.rows) }
            : lastProposed;
        if (settled && stable) {
          forceTerminalViewportRepaint(termRef.current);
          return;
        }
        if (attempts++ < maxAttempts) requestAnimationFrame(attempt);
      };
      attempt();
    },
    [initialCommand]
  );

  useEffect(() => {
    scheduleBoundedFitRepaintRef.current = scheduleBoundedFitRepaint;
  }, [scheduleBoundedFitRepaint]);

  // Bounded ASYNC retry that guarantees the GPU renderer addon is reattached after a
  // workspace show, then force-repaints. This is the deterministic backbone that ends
  // the recurring black-screen-on-switch: it does not rely on the scattered
  // reattach calls inside syncTerminalViewportOnWorkspaceShow's branches (some of
  // which return early without reattaching) nor on the release/reattach flags (which
  // diverge from the actual addon-ref state under rapid switching).
  //
  // Why this is needed on top of scheduleBoundedForceRepaint: when the GPU addon is
  // disposed on hide, RenderService._renderer.value still holds the disposed renderer,
  // so isTerminalRendererReady() returns true and forceTerminalViewportRepaint()
  // returns true without painting (disposed renderer no-ops). The force-repaint retry
  // therefore stops on its first "success" and never reattaches -> black panel. The
  // addon REF is the truthful signal; reattach replaces the disposed renderer with a
  // live one, then the force-repaint actually paints.
  const scheduleBoundedGpuRecover = useCallback(
    (maxAttempts = 30) => {
      let attempts = 0;
      // ponytail: same 2-frame stability gate as scheduleBoundedFitRepaint — stopping
      // when forceTerminalViewportRepaint "succeeds" at stale narrow cols leaves Grok
      // TUIs drawing in a tiny corner with a black gutter on the right.
      let lastProposed = null;
      const tick = async () => {
        if (isDisposingRef.current || !termRef.current || !isVisibleInLayoutRef.current) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          if (attempts++ < maxAttempts) requestAnimationFrame(tick);
          return;
        }
        if (
          needsGpuRendererReattach({
            operationalRendererMode: operationalRendererModeRef.current,
            webglAddon: webglAddonRef.current,
            canvasAddon: canvasAddonRef.current,
          })
        ) {
          if (
            shouldAttachWebglRenderer({
              operationalRendererMode: operationalRendererModeRef.current,
            })
          ) {
            await tryReattachWebglAddonRef.current?.({
              clearAtlas: false,
              skipFitWhenUnchanged: true,
            });
          } else {
            await tryReattachCanvasAddonRef.current?.();
          }
        }
        if (isDisposingRef.current || !termRef.current || !isVisibleInLayoutRef.current) return;
        let fitWorked = false;
        fitWorked = fitTerminalViewport({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
          socket: wsRef.current,
          clearAtlas: false,
          lastPtySizeRef: lastPtySizeRef.current,
        });
        const proposed = proposeTerminalViewportDimensions({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
        });
        const settled =
          fitWorked &&
          proposed &&
          Number(proposed.cols) === Number(termRef.current.cols) &&
          Number(proposed.rows) === Number(termRef.current.rows);
        const stable =
          lastProposed !== null &&
          proposed &&
          Number(lastProposed.cols) === Number(proposed.cols) &&
          Number(lastProposed.rows) === Number(proposed.rows);
        lastProposed =
          proposed && Number(proposed.cols) > 0
            ? { cols: Number(proposed.cols), rows: Number(proposed.rows) }
            : lastProposed;
        const gpuReady = !needsGpuRendererReattach({
          operationalRendererMode: operationalRendererModeRef.current,
          webglAddon: webglAddonRef.current,
          canvasAddon: canvasAddonRef.current,
        });
        if (gpuReady && settled && stable) {
          forceTerminalViewportRepaint(termRef.current);
          return;
        }
        if (attempts++ < maxAttempts) requestAnimationFrame(tick);
      };
      tick();
    },
    [initialCommand]
  );

  useEffect(() => {
    scheduleBoundedGpuRecoverRef.current = scheduleBoundedGpuRecover;
  }, [scheduleBoundedGpuRecover]);

  const syncTerminalViewportOnWorkspaceShow = useCallback(
    async (reason = 'workspace-show', { clearAtlas, forceScroll = true } = {}) => {
      if (isDisposingRef.current) return;
      if (!termRef.current || !fitRef.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        containerWasZeroSizedOnShowRef.current = true;
        logViewportDiagnostic(`${reason}-skipped-zero-size`);
        needsViewportSyncOnShowRef.current = true;

        // Defensive recovery: the panel container may still be zero-sized because
        // react-resizable-panels has not laid out the right sibling yet. Schedule a
        // bounded retry so we don't rely on a later event that may never fire.
        const scheduleZeroSizeRecovery = ({
          attempt = 1,
          maxAttempts = /workspace-show/.test(reason) ? 12 : 2,
          baseDelayMs = 50,
        } = {}) => {
          if (workspaceShowRecoverTimerRef.current) {
            clearTimeout(workspaceShowRecoverTimerRef.current);
            workspaceShowRecoverTimerRef.current = null;
          }
          if (attempt > maxAttempts) {
            logViewportDiagnostic(`${reason}-zero-size-gave-up`);
            return;
          }
          logViewportDiagnostic(`${reason}-zero-size-retry-scheduled`, { attempt, maxAttempts });
          workspaceShowRecoverTimerRef.current = setTimeout(() => {
            workspaceShowRecoverTimerRef.current = null;
            if (isDisposingRef.current) return;
            if (!isVisibleInLayoutRef.current) {
              needsViewportSyncOnShowRef.current = true;
              return;
            }
            if (!termRef.current || !fitRef.current || !containerRef.current) return;
            const retryRect = containerRef.current.getBoundingClientRect();
            if (!retryRect || retryRect.width <= 0 || retryRect.height <= 0) {
              scheduleZeroSizeRecovery({ attempt: attempt + 1, maxAttempts, baseDelayMs });
              return;
            }
            void syncTerminalViewportOnWorkspaceShowRef.current?.(`${reason}-zero-size-recovered`, {
              clearAtlas,
            });
          }, baseDelayMs * attempt);
        };

        if (
          typeof ResizeObserver !== 'undefined' &&
          containerRef.current &&
          !workspaceShowZeroSizeObserverRef.current
        ) {
          const observed = containerRef.current;
          workspaceShowZeroSizeObserverRef.current = new ResizeObserver((entries) => {
            const entry = entries[0];
            const width = entry?.contentRect?.width ?? 0;
            const height = entry?.contentRect?.height ?? 0;
            if (width <= 0 || height <= 0) return;
            workspaceShowZeroSizeObserverRef.current?.disconnect();
            workspaceShowZeroSizeObserverRef.current = null;
            if (workspaceShowRecoverTimerRef.current) {
              clearTimeout(workspaceShowRecoverTimerRef.current);
              workspaceShowRecoverTimerRef.current = null;
            }
            void syncTerminalViewportOnWorkspaceShowRef.current?.(
              `${reason}-resize-observer-recovered`,
              { clearAtlas }
            );
          });
          workspaceShowZeroSizeObserverRef.current.observe(observed);
        }

        scheduleZeroSizeRecovery();
        return;
      }

      const recoveredFromZeroSizeThisPass = containerWasZeroSizedOnShowRef.current;
      containerWasZeroSizedOnShowRef.current = false;

      const colsBefore = Number(termRef.current.cols ?? 0);
      const rowsBefore = Number(termRef.current.rows ?? 0);
      const proposedDims = proposeTerminalViewportDimensions({
        container: containerRef.current,
        fitAddon: fitRef.current,
        term: termRef.current,
      });
      const proposedDimsMatch =
        proposedDims && proposedDims.cols === colsBefore && proposedDims.rows === rowsBefore;
      const sizeUnchanged =
        ((lastPtySizeRef.current.cols === colsBefore &&
          lastPtySizeRef.current.rows === rowsBefore) ||
          proposedDimsMatch) &&
        colsBefore > 0 &&
        rowsBefore > 0;
      const isDeferredShowPass = /workspace-show-(settled|recover|raf)/.test(reason);
      // When the GPU addon stayed attached (workspace switch with no release),
      // the first 'workspace-show-layout' pass is also safe to skip if dims are
      // unchanged. This removes a forced fit+repaint that caused visible flicker.
      const noGpuRecoveryPending =
        !pendingWebglRecoveryRef.current &&
        !canvasReleasedOnLayoutHideRef.current &&
        !webglReleasedOnLayoutHideRef.current;
      const isSurvivorRecover = isWorkspaceSurvivorRecoverLayoutReason(reason);
      const isLayoutSettledImmediate =
        String(reason).startsWith('layout-settled-') && String(reason).endsWith('-immediate');
      // Window-switch survivors actually toggled visibility; keep the recovery pass
      // non-skippable so the destination panel repaints. Workspace removals that
      // did not release the GPU and left dims untouched can skip the heavy burst.
      const isWindowSwitchRecover = String(reason).includes('workspace-window');
      if (
        shouldSkipGpuVisibilityReveal({
          reason,
          noGpuRecoveryPending,
          sizeUnchanged,
          proposedDimsMatch,
          hiddenOutputCatchupPending: hiddenOutputCatchupPendingRef.current,
          operationalRendererMode: operationalRendererModeRef.current,
        })
      ) {
        needsViewportSyncOnShowRef.current = false;
        logViewportDiagnostic(`${reason}-skipped-gpu-visibility-reveal`);
        return;
      }
      const canSkipUnchanged =
        isDeferredShowPass ||
        (reason === 'workspace-show-layout' && noGpuRecoveryPending) ||
        ((isSurvivorRecover || isLayoutSettledImmediate) &&
          noGpuRecoveryPending &&
          !isWindowSwitchRecover);
      if (
        canSkipUnchanged &&
        sizeUnchanged &&
        noGpuRecoveryPending &&
        !shouldFreezeKimiTuiViewportOnWorkspaceShow({
          initialCommand,
          kimiReady: kimiReadyNotifiedRef.current,
          proposedDimsMatch,
        })
      ) {
        logViewportDiagnostic(`${reason}-skipped-unchanged`);
        return;
      }

      if (!kimiReadyNotifiedRef.current && termRef.current) {
        const isKimiLaunch = isKimiLaunchCommand(initialCommand);
        if (isKimiLaunch || detectKimiReadyFromTerminalBuffer(termRef.current)) {
          kimiReadyNotifiedRef.current = true;
        }
      }

      if (
        shouldFreezeKimiTuiViewportOnWorkspaceShow({
          initialCommand,
          kimiReady: kimiReadyNotifiedRef.current,
          proposedDimsMatch,
        })
      ) {
        needsViewportSyncOnShowRef.current = false;
        logViewportDiagnostic(`${reason}-frozen-kimi-tui`);
        stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        if (hiddenOutputCatchupPendingRef.current && termRef.current) {
          const buffered = takeHiddenTerminalOutputBuffer(hiddenOutputBufferRef.current);
          hiddenOutputCatchupPendingRef.current = false;
          if (buffered) {
            for (const chunk of chunkTerminalOutputForCatchup(buffered)) {
              termRef.current.write(chunk);
            }
            stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
          }
        }
        if (pendingWebglRecoveryRef.current && !webglAddonRef.current) {
          await tryReattachWebglAddonRef.current?.({
            clearAtlas: false,
            skipFitWhenUnchanged: true,
          });
        } else if (
          webglReleasedOnLayoutHideRef.current &&
          shouldAttachWebglRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          })
        ) {
          await tryReattachWebglAddonRef.current?.({
            clearAtlas: false,
            skipFitWhenUnchanged: true,
          });
        } else if (
          canvasReleasedOnLayoutHideRef.current &&
          shouldAttachCanvasRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          })
        ) {
          await tryReattachCanvasAddonRef.current?.();
        } else {
          fitTerminalViewport({
            container: containerRef.current,
            fitAddon: fitRef.current,
            term: termRef.current,
            socket: wsRef.current,
            clearAtlas: false,
            lastPtySizeRef: lastPtySizeRef.current,
            skipPtyNotify: true,
          });
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        }

        // If this panel just recovered from a zero-sized container, nudge the
        // viewport without notifying the PTY. This forces xterm to repaint with
        // real dimensions without sending SIGWINCH to Kimi's Ink TUI.
        if (
          recoveredFromZeroSizeThisPass &&
          termRef.current &&
          containerRef.current &&
          fitRef.current
        ) {
          logViewportDiagnostic(`${reason}-kimi-viewport-fit-probe`);
          fitTerminalViewport({
            container: containerRef.current,
            fitAddon: fitRef.current,
            term: termRef.current,
            socket: wsRef.current,
            clearAtlas: false,
            lastPtySizeRef: lastPtySizeRef.current,
            skipPtyNotify: true,
          });
        }

        if (termRef.current && isTerminalRendererReady(termRef.current)) {
          refreshTerminalViewport(termRef.current);
          forceTerminalViewportRepaint(termRef.current);
        }
        return;
      }

      if (
        shouldFreezeSingleWebglViewportOnWorkspaceShow({
          reason,
          sizeUnchanged,
          operationalRendererMode: operationalRendererModeRef.current,
          visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
          proposedDimsMatch,
        })
      ) {
        needsViewportSyncOnShowRef.current = false;
        logViewportDiagnostic(`${reason}-frozen-single-webgl`);
        if (pendingWebglRecoveryRef.current && !webglAddonRef.current) {
          await tryReattachWebglAddonRef.current?.({
            clearAtlas: false,
            skipFitWhenUnchanged: true,
          });
        } else if (
          webglReleasedOnLayoutHideRef.current &&
          shouldAttachWebglRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          })
        ) {
          await tryReattachWebglAddonRef.current?.({
            clearAtlas: true,
            skipFitWhenUnchanged: true,
          });
        } else if (
          canvasReleasedOnLayoutHideRef.current &&
          shouldAttachCanvasRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          })
        ) {
          await tryReattachCanvasAddonRef.current?.();
        } else {
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        }
        if (termRef.current && isTerminalRendererReady(termRef.current)) {
          refreshTerminalViewport(termRef.current);
          const skipForceRepaintOnReveal =
            reason === 'workspace-show-visible' &&
            !pendingWebglRecoveryRef.current &&
            !webglReleasedOnLayoutHideRef.current &&
            !canvasReleasedOnLayoutHideRef.current;
          if (!skipForceRepaintOnReveal) {
            forceTerminalViewportRepaint(termRef.current);
          }
        }
        return;
      }

      if (
        shouldFreezeDomViewportOnWorkspaceShow({
          reason,
          sizeUnchanged,
          operationalRendererMode: operationalRendererModeRef.current,
          tuiSessionActive: tuiSessionActiveRef.current,
          proposedDimsMatch,
        })
      ) {
        needsViewportSyncOnShowRef.current = false;
        logViewportDiagnostic(`${reason}-frozen-dom-tui`);
        fitTerminalViewport({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
          socket: wsRef.current,
          clearAtlas: false,
          lastPtySizeRef: lastPtySizeRef.current,
          skipPtyNotify: true,
        });
        stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        refreshTerminalViewport(termRef.current);
        if (termRef.current && isTerminalRendererReady(termRef.current)) {
          forceTerminalViewportRepaint(termRef.current);
        }
        return;
      }

      // If the container was zero-sized earlier in this show transition, force a
      // real viewport sync now that it finally has dimensions. Otherwise the
      // redundant-skip guard can leave a blank panel forever.
      const recoveredFromZeroSize = containerWasZeroSizedOnShowRef.current;

      if (
        shouldSkipRedundantLayoutSettleViewportSync({
          reason,
          sizeUnchanged,
          pendingWebglRecovery: pendingWebglRecoveryRef.current,
          canvasReleasedOnLayoutHide: canvasReleasedOnLayoutHideRef.current,
          hasGpuRenderer: Boolean(webglAddonRef.current || canvasAddonRef.current),
        }) &&
        proposedDimsMatch &&
        !hiddenOutputCatchupPendingRef.current &&
        !recoveredFromZeroSize
      ) {
        needsViewportSyncOnShowRef.current = false;
        logViewportDiagnostic(`${reason}-skipped-unchanged-dims`);
        stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        return;
      }

      needsViewportSyncOnShowRef.current = false;
      logViewportDiagnostic(reason);

      const shouldClearAtlas =
        clearAtlas ??
        shouldClearGpuAtlasOnWorkspaceShow({
          operationalRendererMode: operationalRendererModeRef.current,
          reason,
          canvasReleasedOnLayoutHide: canvasReleasedOnLayoutHideRef.current,
        });

      let fitWorked = false;

      if (
        webglReleasedOnLayoutHideRef.current &&
        shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        })
      ) {
        fitWorked = await tryReattachWebglAddonRef.current?.({ clearAtlas: shouldClearAtlas });
      } else if (
        canvasReleasedOnLayoutHideRef.current &&
        shouldAttachCanvasRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        })
      ) {
        fitWorked = await tryReattachCanvasAddonRef.current?.();
      } else {
        if (shouldClearAtlas && canvasReleasedOnLayoutHideRef.current) {
          canvasReleasedOnLayoutHideRef.current = false;
        }

        fitWorked = fitTerminalViewport({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
          socket: wsRef.current,
          clearAtlas: shouldClearAtlas,
          lastPtySizeRef: lastPtySizeRef.current,
        });

        stabilizeTerminalRenderer(termRef.current, { clearAtlas: shouldClearAtlas });

        if (fitWorked && termRef.current) {
          confirmViewportFit(termRef.current.cols, termRef.current.rows);
        }
      }

      const kimiTuiLive = isKimiTuiLive({
        initialCommand,
        kimiReady: kimiReadyNotifiedRef.current,
      });

      if (fitWorked && isActivePanelRef.current && !kimiTuiLive) {
        scrollTerminalToBottom(forceScroll);
      }

      if (
        isActivePanelRef.current &&
        shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        (pendingWebglRecoveryRef.current || !webglAddonRef.current)
      ) {
        scheduleWebglRecovery(80, { clearAtlas: false });
      }

      if (
        shouldMountCanvasAddon({
          operationalRendererMode: operationalRendererModeRef.current,
          isActivePanel: isActivePanelRef.current,
          isVisibleInLayout: isVisibleInLayoutRef.current,
          visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
        }) &&
        !canvasAddonRef.current
      ) {
        await tryReattachCanvasAddonRef.current?.();
      }

      if (hiddenOutputCatchupPendingRef.current && termRef.current) {
        const buffered = takeHiddenTerminalOutputBuffer(hiddenOutputBufferRef.current);
        hiddenOutputCatchupPendingRef.current = false;
        if (buffered) {
          const discardCatchup = shouldDiscardHiddenOutputCatchup({
            bufferedBytes: buffered.length,
            sessionReattached: sessionReattachedRef.current,
            tuiSessionActive: tuiSessionActiveRef.current,
            bufferText: buffered,
            termHasContent: terminalBufferHasRenderableContent(termRef.current),
          });
          if (discardCatchup) {
            const discardBecauseTermHasContent =
              terminalBufferHasRenderableContent(termRef.current) &&
              !sessionReattachedRef.current &&
              !tuiSessionActiveRef.current;
            if (
              !discardBecauseTermHasContent &&
              !shouldSkipKimiTuiPtyResize({
                initialCommand,
                hasConnectedOnce: hasConnectedOnceRef.current,
                kimiReady: kimiReadyNotifiedRef.current,
              })
            ) {
              nudgeTerminalPtyResize({
                term: termRef.current,
                socket: wsRef.current,
                lastPtySizeRef: lastPtySizeRef.current,
              });
            }
            stabilizeTerminalRenderer(termRef.current, { clearAtlas: true });
            refreshTerminalViewport(termRef.current);
            if (isTerminalRendererReady(termRef.current)) {
              forceTerminalViewportRepaint(termRef.current);
            }
          } else {
            for (const chunk of chunkTerminalOutputForCatchup(buffered)) {
              termRef.current.write(chunk);
            }
            stabilizeTerminalRenderer(termRef.current, { clearAtlas: true });
            refreshTerminalViewport(termRef.current);
            if (isTerminalRendererReady(termRef.current)) {
              forceTerminalViewportRepaint(termRef.current);
            }
            if (tuiSessionActiveRef.current && !kimiTuiLive) {
              nudgeTerminalPtyResize({
                term: termRef.current,
                socket: wsRef.current,
                lastPtySizeRef: lastPtySizeRef.current,
              });
            }
          }
        }
      }

      if (
        fitWorked &&
        visibleTerminalPanelCountRef.current > TERMINAL_SPLIT_WEBGL_PANEL_LIMIT &&
        canvasAddonRef.current &&
        termRef.current &&
        !shouldSkipKimiTuiPtyResize({
          initialCommand,
          hasConnectedOnce: hasConnectedOnceRef.current,
          kimiReady: kimiReadyNotifiedRef.current,
        })
      ) {
        nudgeTerminalPtyResize({
          term: termRef.current,
          socket: wsRef.current,
          lastPtySizeRef: lastPtySizeRef.current,
        });
      }

      // ponytail: force a real canvas repaint, not just term.refresh(). refresh()
      // only marks rows dirty — it does NOT recreate the canvas/webgl bitmap, so a
      // panel that was hidden (or recovered from a zero-sized container) stays black
      // when cols/rows are unchanged. This is the only terminal-ready repaint spot
      // that previously lacked the 1-cell nudge; without it the zero-size-recovery
      // pass (and any general-path show pass) leaves the destination terminal black
      // until a manual resize. See docs/errores/06-terminal-status-and-workspace-switch.
      if (termRef.current && isTerminalRendererReady(termRef.current)) {
        refreshTerminalViewport(termRef.current);
        forceTerminalViewportRepaint(termRef.current);
      }

      // Panel-close churn can discard the GPU bitmap of a live TUI even when the
      // viewport dimensions never changed. The force repaint above redraws the
      // current xterm buffer, but if the TUI itself needs to repaint (OpenCode,
      // Grok, etc.) we must send a same-dimension SIGWINCH so it emits fresh frames.
      if (
        String(reason).includes('panel-closed') &&
        tuiSessionActiveRef.current &&
        wsRef.current &&
        !shouldSkipKimiTuiPtyResize({
          initialCommand,
          hasConnectedOnce: hasConnectedOnceRef.current,
          kimiReady: kimiReadyNotifiedRef.current,
        })
      ) {
        nudgeTerminalPtyResize({
          term: termRef.current,
          socket: wsRef.current,
          lastPtySizeRef: lastPtySizeRef.current,
          force: true,
        });
      }
    },
    [
      confirmViewportFit,
      id,
      initialCommand,
      logViewportDiagnostic,
      scheduleWebglRecovery,
      scrollTerminalToBottom,
    ]
  );

  useEffect(() => {
    syncTerminalViewportOnWorkspaceShowRef.current = syncTerminalViewportOnWorkspaceShow;
  }, [syncTerminalViewportOnWorkspaceShow]);

  // Golden recovery path: dashboard→terminales route return runs this via the
  // layout-show useLayoutEffect (isVisibleInLayout false→true). Workspace close
  // must call the same pipeline — layout-settled with different reason strings
  // hit different freeze branches and peer WebGL dispose can land after the first pass.
  const scheduleWorkspaceShowRecovery = useCallback(
    (layoutReason = 'workspace-show-layout') => {
      if (isDisposingRef.current || !termRef.current) return;

      const survivorRecover = isWorkspaceSurvivorRecoverLayoutReason(layoutReason);
      const gpuShowRecover =
        pendingWebglRecoveryRef.current ||
        webglReleasedOnLayoutHideRef.current ||
        canvasReleasedOnLayoutHideRef.current;
      const splitGridVisible = visibleTerminalPanelCountRef.current > 1;
      const gpuStillAttached = !needsGpuRendererReattach({
        operationalRendererMode: operationalRendererModeRef.current,
        webglAddon: webglAddonRef.current,
        canvasAddon: canvasAddonRef.current,
      });
      const clearAtlasForShow = gpuShowRecover || (splitGridVisible && !gpuStillAttached);
      // Option B: GPU addons stay attached while the workspace is mounted. A plain
      // visibility toggle (tab switch, window park) only needs the freeze-path sync
      // (stabilize + one repaint) — not bounded fit/GPU recover loops.
      const needsHeavyRecovery =
        gpuShowRecover ||
        (survivorRecover && !gpuStillAttached) ||
        (splitGridVisible && !gpuStillAttached);
      const needsRafRecovery = needsHeavyRecovery;
      const needsForcedRepaint = needsHeavyRecovery;

      if (!needsHeavyRecovery) {
        void syncTerminalViewportOnWorkspaceShow(layoutReason, { clearAtlas: false });
        return;
      }

      const runPass = (reason) => {
        if (!isVisibleInLayoutRef.current) {
          needsViewportSyncOnShowRef.current = true;
          if (gpuShowRecover || survivorRecover) {
            scheduleBoundedGpuRecover();
          }
          if (needsForcedRepaint) {
            scheduleBoundedFitRepaint(survivorRecover ? 40 : 24);
          }
          return;
        }
        void syncTerminalViewportOnWorkspaceShow(reason, { clearAtlas: clearAtlasForShow });
        if (needsForcedRepaint) {
          scheduleBoundedForceRepaint(survivorRecover ? 32 : 24);
          scheduleBoundedFitRepaint(survivorRecover ? 40 : 24);
        }
        if (gpuShowRecover || survivorRecover) {
          scheduleBoundedGpuRecover(survivorRecover ? 48 : 40);
        }
        if (
          !splitGridVisible &&
          shouldRefitVisibleInactiveSplitPanel({
            isActivePanel: isActivePanelRef.current,
            isVisibleInLayout: isVisibleInLayoutRef.current,
          })
        ) {
          scheduleInactiveViewportRepaint();
        }
      };

      requestAnimationFrame(() => {
        runPass(layoutReason);
        if (needsRafRecovery) {
          requestAnimationFrame(() => {
            if (!isVisibleInLayoutRef.current) return;
            runPass(
              survivorRecover
                ? `${WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON}-raf`
                : 'workspace-show-raf'
            );
          });
        }
      });
    },
    [
      scheduleBoundedFitRepaint,
      scheduleBoundedForceRepaint,
      scheduleBoundedGpuRecover,
      scheduleInactiveViewportRepaint,
      syncTerminalViewportOnWorkspaceShow,
    ]
  );

  useEffect(() => {
    scheduleWorkspaceShowRecoveryRef.current = scheduleWorkspaceShowRecovery;
  }, [scheduleWorkspaceShowRecovery]);

  const sendResize = useCallback(() => {
    if (!termRef.current || !fitRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    if (connectPendingUntilFitRef.current) {
      const worked = fitAndResize({ clearAtlas: true });
      maybeConnectAfterViewportFit(worked);
      return;
    }

    if (!isVisibleInLayoutRef.current) {
      needsViewportSyncOnShowRef.current = true;
      return;
    }

    // Visible inactive siblings still need fit+PTY resize when split geometry changes.
    if (
      shouldRefitVisibleInactiveSplitPanel({
        isActivePanel: isActivePanelRef.current,
        isVisibleInLayout: isVisibleInLayoutRef.current,
      })
    ) {
      scheduleInactiveViewportRepaint();
      return;
    }

    const kimiConnected = shouldSkipKimiTuiPtyResize({
      initialCommand,
      hasConnectedOnce: hasConnectedOnceRef.current,
      kimiReady: kimiReadyNotifiedRef.current,
    });
    fitAndResize({ clearAtlas: true, forcePtyResize: true });
    if (!kimiConnected) scrollTerminalToBottom();
    clearTimers();
    rafRef.current = requestAnimationFrame(() => {
      fitAndResize({ clearAtlas: false, forcePtyResize: true });
      if (!kimiConnected) scrollTerminalToBottom();
    });
  }, [
    clearTimers,
    fitAndResize,
    initialCommand,
    maybeConnectAfterViewportFit,
    scheduleInactiveViewportRepaint,
    scrollTerminalToBottom,
  ]);

  const reactivateTerminalViewport = useCallback(
    (options = {}) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const zeroSized = !rect || rect.width <= 0 || rect.height <= 0;
      if (zeroSized) {
        logViewportDiagnostic('reactivate-skipped-zero-size');
        if (autoFocus && isActivePanelRef.current) {
          prepareActiveTuiTerminalFocus(termRef.current, {
            tuiSessionActive: tuiSessionActiveRef.current,
          });
          termRef.current?.focus?.();
        }
        return;
      }

      const clearAtlas =
        options.clearAtlas ??
        shouldMountCanvasAddon({
          operationalRendererMode: operationalRendererModeRef.current,
          isActivePanel: isActivePanelRef.current,
          isVisibleInLayout: isVisibleInLayoutRef.current,
          visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
        });

      const skipDomFit =
        !options.survivorRecover &&
        shouldFreezeDomViewportOnAppResume({
          operationalRendererMode: operationalRendererModeRef.current,
          tuiSessionActive: tuiSessionActiveRef.current,
          term: termRef.current,
          container: containerRef.current,
          fitAddon: fitRef.current,
        });

      const kimiConnected = shouldSkipKimiTuiPtyResize({
        initialCommand,
        hasConnectedOnce: hasConnectedOnceRef.current,
        kimiReady: kimiReadyNotifiedRef.current,
      });

      logViewportDiagnostic('reactivate-start');
      prepareActiveTuiTerminalFocus(termRef.current, {
        tuiSessionActive: tuiSessionActiveRef.current,
      });
      if (skipDomFit) {
        logViewportDiagnostic('reactivate-frozen-dom-tui');
        nudgeTerminalPtyResize({
          term: termRef.current,
          socket: wsRef.current,
          lastPtySizeRef: lastPtySizeRef.current,
        });
        stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        refreshTerminalViewport(termRef.current);
      } else if (options.survivorRecover) {
        const grokLive = isGrokSessionRef.current || isGrokTuiInitialCommand(initialCommand);
        const liveTui = tuiSessionActiveRef.current || grokLive;
        if (liveTui) {
          logViewportDiagnostic('reactivate-survivor-dom-tui');
          fitTerminalViewport({
            container: containerRef.current,
            fitAddon: fitRef.current,
            term: termRef.current,
            socket: wsRef.current,
            clearAtlas: Boolean(clearAtlas),
            lastPtySizeRef: lastPtySizeRef.current,
            skipPtyNotify: true,
          });
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
          refreshTerminalViewport(termRef.current);
        } else {
          fitAndResize({ clearAtlas });
          stabilizeTerminalRenderer(termRef.current, { clearAtlas });
        }
      } else if (!kimiConnected) {
        fitAndResize({ clearAtlas });
        stabilizeTerminalRenderer(termRef.current, { clearAtlas });
        if (isActivePanelRef.current) scrollTerminalToBottom();
      } else {
        stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
      }

      // OS window restore (Alt+Tab back to DevHub) leaves the GPU canvas bitmap stale
      // when cols/rows are unchanged — fitAndResize no-ops and clearAtlas+refresh alone
      // don't redraw alt-screen Ink TUIs, so grok/OpenCode render garbled until the user
      // clicks. Force a real 1-cell resize nudge so the canvas bitmap redraws (Bug A).
      // No PTY SIGWINCH is sent (forceTerminalViewportRepaint never notifies the PTY).
      if (clearAtlas && tuiSessionActiveRef.current) {
        forceTerminalViewportRepaint(termRef.current);
      }

      if (autoFocus) {
        termRef.current?.focus?.();
      }

      rafRef.current = requestAnimationFrame(() => {
        if (skipDomFit) {
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        } else if (!kimiConnected) {
          fitAndResize({ clearAtlas: false });
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
          if (isActivePanelRef.current) scrollTerminalToBottom();
        } else {
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        }
        logViewportDiagnostic('reactivate-settled');
      });
    },
    [autoFocus, fitAndResize, initialCommand, logViewportDiagnostic, scrollTerminalToBottom]
  );

  useEffect(() => {
    if (!isNativeVteRuntimeAvailable()) return undefined;

    let cancelled = false;

    Promise.resolve(subscribeNativeVteEvents())
      .then((unsubscribe) => {
        if (cancelled) {
          unsubscribe?.();
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const prevMode = prevRequestedRendererModeRef.current;
    prevRequestedRendererModeRef.current = requestedRendererMode;

    if (!ENABLE_NATIVE_VTE || requestedRendererMode !== 'vte-experimental') {
      setNativeVteProbeResult(null);
      setNativeVteOpenFailure(null);
      setNativeVteOpened(false);
      nativeVteProbeRetryCountRef.current = 0;
      clearNativeVteProbeRetryTimer();
      // Only close when actually leaving native mode, not on every remount/probe cycle.
      if (prevMode === 'vte-experimental' || nativeLeaseRef.current) {
        closeNativeLease('renderer-disabled');
      }
      return undefined;
    }

    if (!isVisibleInLayout) {
      clearNativeVteProbeRetryTimer();
      return undefined;
    }

    probeNativeVte({
      panelId: id,
      requestedMode: requestedRendererMode,
      tauriAvailable,
    })
      .then((result) => {
        if (cancelled) return;
        cliLog(`CLIENT:${id}`, 'native VTE probe result', {
          result,
          requestedRendererMode,
          tauriAvailable,
        });
        setNativeVteProbeResult(result);
        if (result?.ready) {
          nativeVteProbeRetryCountRef.current = 0;
          clearNativeVteProbeRetryTimer();
        } else {
          setNativeVteOpenFailure(null);
          setNativeVteOpened(false);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        cliLog(`CLIENT:${id}`, 'native VTE probe failed', {
          error: error?.message,
          requestedRendererMode,
          tauriAvailable,
        });
        setNativeVteProbeResult({ ready: false, reason: error?.message || 'probe-failed' });
        setNativeVteOpened(false);
        setNativeVteOpenFailure(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    clearNativeVteProbeRetryTimer,
    closeNativeLease,
    id,
    isActivePanel,
    nativeVteProbeAttempt,
    requestedRendererMode,
    tauriAvailable,
  ]);

  useEffect(() => {
    if (!shouldRetryNativeVteProbe) return undefined;

    queueNativeVteProbeRetry(160);
    return undefined;
  }, [queueNativeVteProbeRetry, shouldRetryNativeVteProbe]);

  useEffect(() => {
    let cancelled = false;

    if (
      !shouldOpenNativeVtePanel({
        isActivePanel,
        isVisibleInLayout,
        suspendNativeSurface,
        nativeVteOpenFailure,
        nativeVteProbe: nativeVteProbeResult,
        requestedRendererMode,
        runtimePlatform: resolvedRuntimePlatform,
        tauriAvailable,
      })
    ) {
      if (requestedRendererMode !== 'vte-experimental') {
        closeNativeLease('renderer-disabled');
      }
      return undefined;
    }

    const bounds = getNativeTerminalBounds(containerRef.current || nativePlaceholderRef.current);
    if (!bounds) return undefined;

    const nativeOpenRequest = {
      panelId: id,
      bounds,
      cwd: cwd || null,
      initialCommand: initialCommand || null,
      sessionId: id,
    };

    const applyNativeOpenResult = (result) => {
      cliLog(`CLIENT:${id}`, 'native VTE open result', {
        opened: Boolean(result?.opened),
        reason: result?.reason || null,
      });
      if (result?.opened) {
        nativeLeaseRef.current = true;
        setNativeVteOpenFailure(null);
        setNativeVteOpened(true);
        setConnectionState('connected');
        setSessionExitReason(null);
        processExitedRef.current = false;
        setIsInitializing(false);
        clearNativeVteProbeRetryTimer();
        void showAndResizeNativeLease();
        return true;
      }

      nativeLeaseRef.current = false;
      setNativeVteOpened(false);
      setNativeVteOpenFailure(result?.reason || 'open-failed');
      nativeVteProbeRetryCountRef.current = 0;
      clearNativeVteProbeRetryTimer();
      return false;
    };

    if (nativeLeaseRef.current && nativeVteOpened) {
      (async () => {
        try {
          await showAndResizeNativeLease();
        } catch (error) {
          if (cancelled) return;
          const reason = String(error?.message || error || '');
          handleNativeLeaseCommandError(error);

          if (!reason.includes('panel-not-active')) return;

          try {
            const reopenResult = await openNativeVtePanel(nativeOpenRequest);
            if (cancelled) return;
            applyNativeOpenResult(reopenResult);
          } catch (reopenError) {
            if (cancelled) return;
            applyNativeOpenResult({ opened: false, reason: reopenError?.message || 'open-failed' });
          }
        }
      })();
      return undefined;
    }

    cliLog(`CLIENT:${id}`, 'native VTE open requested', {
      bounds,
      cwd: cwd || null,
      hasInitialCommand: Boolean(initialCommand),
    });

    openNativeVtePanel(nativeOpenRequest)
      .then((result) => {
        if (cancelled) {
          if (result?.opened) {
            Promise.resolve(
              setNativeVtePanelVisibility({
                panelId: id,
                visible: false,
                reason: 'layout-hidden',
              })
            ).catch(handleNativeLeaseCommandError);
          }
          return;
        }
        applyNativeOpenResult(result);
      })
      .catch((error) => {
        if (cancelled) return;
        applyNativeOpenResult({ opened: false, reason: error?.message || 'open-failed' });
      });

    return () => {
      cancelled = true;
    };
  }, [
    closeNativeLease,
    clearNativeVteProbeRetryTimer,
    cwd,
    handleNativeLeaseCommandError,
    id,
    initialCommand,
    isActivePanel,
    isVisibleInLayout,
    nativeVteOpenFailure,
    nativeVteOpened,
    nativeVteRecoveryAttempt,
    nativeVteProbeResult,
    requestedRendererMode,
    resolvedRuntimePlatform,
    showNativeLease,
    showAndResizeNativeLease,
    suspendNativeSurface,
    tauriAvailable,
  ]);

  useEffect(() => {
    if (
      nativeVteOpened ||
      !shouldOpenNativeVtePanel({
        isActivePanel,
        isVisibleInLayout,
        suspendNativeSurface,
        nativeVteOpenFailure,
        nativeVteProbe: nativeVteProbeResult,
        requestedRendererMode,
        runtimePlatform: resolvedRuntimePlatform,
        tauriAvailable,
      })
    ) {
      return undefined;
    }

    if (getNativeTerminalBounds(containerRef.current || nativePlaceholderRef.current)) {
      return undefined;
    }

    let retryQueued = false;
    let rafId = null;

    const retryNativeOpenWhenBoundsRecover = () => {
      if (retryQueued) return;

      const recoveredBounds = getNativeTerminalBounds(
        containerRef.current || nativePlaceholderRef.current
      );
      if (!recoveredBounds) return;

      retryQueued = true;
      cliLog(`CLIENT:${id}`, 'native VTE bounds recovered — retry open', {
        bounds: recoveredBounds,
      });
      setNativeVteRecoveryAttempt((attempt) => attempt + 1);
    };

    rafId = requestAnimationFrame(() => {
      rafId = null;
      retryNativeOpenWhenBoundsRecover();
    });

    const intervalId = setInterval(retryNativeOpenWhenBoundsRecover, 250);
    window.addEventListener('resize', retryNativeOpenWhenBoundsRecover);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      clearInterval(intervalId);
      window.removeEventListener('resize', retryNativeOpenWhenBoundsRecover);
    };
  }, [
    id,
    isActivePanel,
    isVisibleInLayout,
    nativeVteOpenFailure,
    nativeVteOpened,
    nativeVteProbeResult,
    requestedRendererMode,
    resolvedRuntimePlatform,
    suspendNativeSurface,
    tauriAvailable,
  ]);

  useEffect(() => {
    if (!nativeVteOpened || requestedRendererMode !== 'vte-experimental') return undefined;
    // dock-side-by-side: VTE coexists with the browser dock, but still hide when not visible.
    if (nativeSurfacePolicy === 'dock-side-by-side') {
      if (isVisibleInLayout && !suspendNativeSurface) return undefined;
      // Component lost visibility — hide the native panel even in dock-side-by-side mode.
      (async () => {
        try {
          await setNativeVtePanelVisibility({
            panelId: id,
            visible: false,
            reason: suspendNativeSurface ? 'dock-side-by-side' : 'layout-hidden',
          });
        } catch (error) {
          handleNativeLeaseCommandError(error);
        }
      })();
      return undefined;
    }
    if (isVisibleInLayout && !suspendNativeSurface) return undefined;

    (async () => {
      try {
        await setNativeVtePanelVisibility({
          panelId: id,
          visible: false,
          reason: suspendNativeSurface ? 'suspended' : undefined,
        });
      } catch (error) {
        handleNativeLeaseCommandError(error);
      }
    })();

    return undefined;
  }, [
    handleNativeLeaseCommandError,
    id,
    isVisibleInLayout,
    nativeSurfacePolicy,
    nativeVteOpened,
    requestedRendererMode,
    suspendNativeSurface,
  ]);

  // When the user explicitly changes the renderer away from native VTE on a *visible* panel,
  // we must proactively close the native lease. The existing hide effects are mostly gated
  // behind "still vte but temporarily suspended/not visible". Without this, the GTK widget
  // can stay on top even after requestedRendererMode becomes xterm / xterm-webgl.
  useEffect(() => {
    if (requestedRendererMode === 'vte-experimental' || !nativeVteOpened) return undefined;

    (async () => {
      try {
        await setNativeVtePanelVisibility({
          panelId: id,
          visible: false,
          reason: 'renderer-changed',
        });
        cliLog(`CLIENT:${id}`, 'native VTE lease hidden due to renderer mode change', {
          requestedRendererMode,
        });
      } catch (error) {
        handleNativeLeaseCommandError(error);
      }
    })();

    return undefined;
  }, [
    handleNativeLeaseCommandError,
    id,
    nativeVteOpened,
    requestedRendererMode,
    setNativeVtePanelVisibility,
  ]);

  // When we leave vte-experimental, also make sure any partial xterm runtime is cleaned
  // and we (re)boot the web layer for the new requested mode. This complements the
  // existing initialize effect (which may not always re-fire on prop change alone).
  //
  // We cannot call the inner `initializeTerminal` (it is scoped inside the main xterm boot effect).
  // Instead we dispose here and increment a nonce that is part of the main boot effect's deps.
  // That forces the main effect body to re-execute and call its local initializeTerminal()
  // (which contains the full xterm + webgl dynamic import + banner logic).
  const lastRequestedModeRef = useRef(requestedRendererMode);
  const lastIdRef = useRef(id);
  useEffect(() => {
    if (lastRequestedModeRef.current === requestedRendererMode && lastIdRef.current === id) {
      return undefined;
    }
    lastRequestedModeRef.current = requestedRendererMode;
    const idChanged = lastIdRef.current !== id;
    lastIdRef.current = id;
    if (idChanged) {
      projectionReadyRef.current = false;
      panelCreatedAtRef.current = Date.now();
    }

    if (requestedRendererMode === 'vte-experimental') {
      // If we switched back to vte, dispose any web runtime so it doesn't fight the native.
      disposeXtermRuntime();
      return undefined;
    }

    // For xterm / xterm-webgl: dispose whatever was there and force the main boot effect
    // to re-run (via nonce) so the web terminal layer actually initializes.
    disposeXtermRuntime();
    setXtermBootNonce((n) => n + 1);

    return undefined;
  }, [requestedRendererMode, disposeXtermRuntime, id]);

  // Migrate WebGL ↔ Canvas when split geometry changes, without remounting PTYs.
  useLayoutEffect(() => {
    if (shouldUseNativeRenderer || !termRef.current) return;

    const prevCount = prevVisibleTerminalPanelCountRef.current;
    prevVisibleTerminalPanelCountRef.current = visibleTerminalPanelCount;

    const wantsWebgl = shouldAttachWebglRenderer({ operationalRendererMode });
    const wantsCanvas = shouldAttachCanvasRenderer({ operationalRendererMode });

    if (wantsWebgl) {
      if (canvasAddonRef.current) {
        releaseCanvasAddon('split-collapse-webgl');
      }
      if (!webglAddonRef.current) {
        if (prevCount > visibleTerminalPanelCount) {
          cliLog(`RENDER:${id}`, 'webgl-reattach-after-split-collapse');
        }
        void tryReattachWebglAddonRef.current?.({ clearAtlas: false });
      }
      return;
    }

    if (wantsCanvas) {
      if (webglAddonRef.current) {
        releaseWebglAddonForInactivePanel('split-open-canvas');
      }

      if (
        shouldMountCanvasAddon({
          operationalRendererMode,
          isActivePanel: isActivePanelRef.current,
          isVisibleInLayout: isVisibleInLayoutRef.current,
          visibleTerminalPanelCount,
        }) &&
        !canvasAddonRef.current
      ) {
        void tryReattachCanvasAddonRef.current?.();
      }
      return;
    }

    if (webglAddonRef.current) {
      releaseWebglAddonForInactivePanel('operational-dom-fallback');
    }
    if (canvasAddonRef.current) {
      releaseCanvasAddon('operational-dom-fallback');
    }
  }, [
    id,
    isActivePanel,
    isVisibleInLayout,
    operationalRendererMode,
    releaseCanvasAddon,
    releaseWebglAddonForInactivePanel,
    shouldUseNativeRenderer,
    visibleTerminalPanelCount,
  ]);

  // Keep canvas on all visible split siblings; DOM fallback corrupts TUIs with horizontal seams.
  useLayoutEffect(() => {
    if (shouldUseNativeRenderer || !termRef.current) return;
    if (!shouldAttachCanvasRenderer({ operationalRendererMode })) return;
    if (!isVisibleInLayout) return;

    if (!canvasAddonRef.current) {
      void tryReattachCanvasAddonRef.current?.();
      return;
    }

    if (!isActivePanel && isTerminalRendererReady(termRef.current)) {
      refreshTerminalViewport(termRef.current);
    }
  }, [isActivePanel, isVisibleInLayout, operationalRendererMode, shouldUseNativeRenderer]);

  // Shared-surface / split layouts: re-attach canvas when a panel becomes visible again.
  useEffect(() => {
    if (!isVisibleInLayout || shouldUseNativeRenderer || !termRef.current) return undefined;

    if (
      shouldMountCanvasAddon({
        operationalRendererMode,
        isActivePanel,
        isVisibleInLayout,
        visibleTerminalPanelCount,
      }) &&
      !canvasAddonRef.current
    ) {
      void tryReattachCanvasAddonRef.current?.();
    }

    const timer = window.setTimeout(() => {
      if (!isVisibleInLayoutRef.current || !termRef.current || isDisposingRef.current) return;

      const afterRendererReady = () => {
        if (!isVisibleInLayoutRef.current || !termRef.current || isDisposingRef.current) return;
        const canvasMode = shouldAttachCanvasRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        });
        // Avoid refreshing WebGL panels from the canvas recovery timeout; the WebGL
        // renderer is handled by its own recovery path and this refresh only adds
        // visible flicker during a plain workspace switch.
        if (canvasMode && isTerminalRendererReady(termRef.current)) {
          refreshTerminalViewport(termRef.current);
        }
        if (connectPendingUntilFitRef.current) {
          fitAndResize({ clearAtlas: true });
        }
      };

      if (
        shouldAttachCanvasRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        !canvasAddonRef.current
      ) {
        void tryReattachCanvasAddonRef.current?.().then(afterRendererReady);
        return;
      }

      afterRendererReady();
    }, 140);

    return () => window.clearTimeout(timer);
  }, [fitAndResize, isVisibleInLayout, operationalRendererMode, shouldUseNativeRenderer]);

  useEffect(() => {
    if (requestedRendererMode !== 'vte-experimental') return undefined;

    const settleTimers = [];
    let rafId = null;

    const clearScheduledSync = () => {
      settleTimers.forEach((timerId) => clearTimeout(timerId));
      settleTimers.length = 0;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const scheduleShowAndResize = () => {
      clearScheduledSync();
      const sync = () => {
        if (!isVisibleInLayout) return;
        if (suspendNativeSurface && nativeSurfacePolicy !== 'dock-side-by-side') return;
        showAndResizeNativeLease();
      };

      rafId = requestAnimationFrame(() => {
        rafId = null;
        sync();
      });

      [80, 180, 400].forEach((delayMs) => {
        settleTimers.push(
          setTimeout(() => {
            sync();
          }, delayMs)
        );
      });
    };

    const handleWorkspaceNativeSurfaceSync = (event) => {
      const detail = event.detail || {};
      const activePanelIds = new Set(
        Array.isArray(detail.activePanelIds) ? detail.activePanelIds.filter(Boolean) : []
      );
      const hiddenPanelIds = new Set(
        Array.isArray(detail.hiddenPanelIds) ? detail.hiddenPanelIds.filter(Boolean) : []
      );

      if (hiddenPanelIds.has(id)) {
        clearScheduledSync();
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
        }
        const delay = process.env.NODE_ENV === 'test' ? 0 : 100;
        hideTimerRef.current = setTimeout(() => {
          hideTimerRef.current = null;
          hideNativeLease(detail.reason || 'workspace-hidden');
        }, delay);
        return;
      }

      if (activePanelIds.has(id)) {
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        scheduleShowAndResize();
      }
    };

    window.addEventListener('devhub:native-vte-workspace-sync', handleWorkspaceNativeSurfaceSync);

    return () => {
      clearScheduledSync();
      window.removeEventListener(
        'devhub:native-vte-workspace-sync',
        handleWorkspaceNativeSurfaceSync
      );
    };
  }, [
    hideNativeLease,
    id,
    isVisibleInLayout,
    nativeSurfacePolicy,
    requestedRendererMode,
    showAndResizeNativeLease,
    suspendNativeSurface,
  ]);

  useEffect(() => {
    if (requestedRendererMode !== 'vte-experimental' || isVisibleInLayout) return undefined;

    Promise.resolve(
      setNativeVtePanelVisibility({
        panelId: id,
        visible: false,
        reason: 'layout-hidden',
      })
    ).catch(handleNativeLeaseCommandError);

    return undefined;
  }, [handleNativeLeaseCommandError, id, isVisibleInLayout, requestedRendererMode]);

  // Re-show native VTE after layout becomes visible again (window switch, focus exit, etc.).
  useEffect(() => {
    if (requestedRendererMode !== 'vte-experimental' || !isVisibleInLayout) return undefined;
    if (suspendNativeSurface && nativeSurfacePolicy !== 'dock-side-by-side') return undefined;

    const shouldRestore =
      nativeLeaseRef.current ||
      nativeVteOpened ||
      hasHiddenNativeVteLease(id) ||
      readPanelSessionExit(id);
    if (!shouldRestore) return undefined;

    if (hasHiddenNativeVteLease(id)) {
      nativeLeaseRef.current = true;
      consumeHiddenNativeVteLease(id);
      setNativeVteOpened(true);
    }

    const timers = [0, 80, 180, 400, 800].map((delayMs) =>
      setTimeout(() => {
        if (!isVisibleInLayoutRef.current) return;
        showAndResizeNativeLease();
      }, delayMs)
    );

    return () => {
      timers.forEach((timerId) => clearTimeout(timerId));
    };
  }, [
    id,
    isVisibleInLayout,
    nativeSurfacePolicy,
    nativeVteOpened,
    requestedRendererMode,
    showAndResizeNativeLease,
    suspendNativeSurface,
  ]);

  useEffect(() => {
    if (!nativeVteOpened || suspendNativeSurface || !autoFocus || !isActivePanel) return undefined;

    Promise.resolve(focusNativeVtePanel({ panelId: id })).catch(handleNativeLeaseCommandError);
    return undefined;
  }, [
    autoFocus,
    handleNativeLeaseCommandError,
    id,
    isActivePanel,
    nativeVteOpened,
    suspendNativeSurface,
  ]);

  useEffect(() => {
    if (!nativeVteOpened || !isVisibleInLayout) return undefined;
    // dock-side-by-side: VTE coexists with dock — still resize, just skip hide.
    if (suspendNativeSurface && nativeSurfacePolicy !== 'dock-side-by-side') return undefined;

    const sendNativeResize = () => {
      const bounds = getNativeTerminalBounds(containerRef.current || nativePlaceholderRef.current);
      if (!bounds) return;
      Promise.resolve(resizeNativeVtePanel({ panelId: id, bounds })).catch(
        handleNativeLeaseCommandError
      );
    };
    const clearNativeResizeSettleTimers = () => {
      nativeResizeSettleTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      nativeResizeSettleTimersRef.current = [];
    };
    const scheduleNativeResize = () => {
      if (nativeResizeRafRef.current) return;
      nativeResizeRafRef.current = requestAnimationFrame(() => {
        nativeResizeRafRef.current = null;
        sendNativeResize();
      });
    };
    const scheduleNativeResizeAfterLayoutSettles = () => {
      clearNativeResizeSettleTimers();
      scheduleNativeResize();
      nativeResizeSettleTimersRef.current = [80, 180].map((delayMs) =>
        setTimeout(() => {
          sendNativeResize();
        }, delayMs)
      );
    };

    sendNativeResize();
    scheduleNativeResizeAfterLayoutSettles();
    window.addEventListener('resize', sendNativeResize);
    const observedElement = containerRef.current || nativePlaceholderRef.current;
    if (typeof ResizeObserver !== 'undefined' && observedElement) {
      nativeResizeObserverRef.current?.disconnect();
      nativeResizeObserverRef.current = new ResizeObserver(() => {
        if (isDisposingRef.current) return;
        scheduleNativeResize();
      });
      nativeResizeObserverRef.current.observe(observedElement);
    }

    return () => {
      window.removeEventListener('resize', sendNativeResize);
      clearNativeResizeSettleTimers();
      nativeResizeObserverRef.current?.disconnect();
      nativeResizeObserverRef.current = null;
      if (nativeResizeRafRef.current) {
        cancelAnimationFrame(nativeResizeRafRef.current);
        nativeResizeRafRef.current = null;
      }
    };
  }, [
    handleNativeLeaseCommandError,
    id,
    isVisibleInLayout,
    nativeSurfacePolicy,
    nativeVteOpened,
    suspendNativeSurface,
  ]);

  useEffect(() => {
    const handleSessionClosing = (event) => {
      if (event.detail?.panelId !== id) return;
      tearDownClientSession('session-close');
    };

    window.addEventListener('devhub:terminal-session-closing', handleSessionClosing);
    return () => {
      window.removeEventListener('devhub:terminal-session-closing', handleSessionClosing);
    };
  }, [id, tearDownClientSession]);

  useEffect(() => {
    surfaceHostRef.current = surfaceHost;
  }, [surfaceHost]);

  useLayoutEffect(() => {
    restoreInitialCommandDispatchGuard();
  }, [restoreInitialCommandDispatchGuard]);

  useEffect(() => {
    const bridge = takeTerminalPanelBridge(id);
    if (!bridge) return;
    if (bridge.buffer) {
      const crossHostRemount = bridge.host && surfaceHost && bridge.host !== surfaceHost;
      if (
        crossHostRemount ||
        shouldDiscardHiddenOutputCatchup({ bufferedBytes: bridge.buffer.length })
      ) {
        hiddenOutputBufferRef.current.value = '';
        hiddenOutputCatchupPendingRef.current = false;
      } else {
        hiddenOutputBufferRef.current.value = bridge.buffer;
        hiddenOutputCatchupPendingRef.current = bridge.catchupPending || true;
      }
    }
    if (bridge.outputPending) {
      outputPendingRef.current.value = bridge.outputPending;
    }
    if (bridge.lastPtySize?.cols > 0 && bridge.lastPtySize?.rows > 0) {
      lastPtySizeRef.current = {
        cols: bridge.lastPtySize.cols,
        rows: bridge.lastPtySize.rows,
      };
    }
  }, [id, surfaceHost]);

  useEffect(() => {
    if (!shouldUseNativeRenderer) return undefined;

    const handleNativeTerminalExit = (event) => {
      applyTerminalSessionExit(event.detail || {}, { emitBrowserEvent: false });
    };

    window.addEventListener('devhub:terminal-exit', handleNativeTerminalExit);
    return () => {
      window.removeEventListener('devhub:terminal-exit', handleNativeTerminalExit);
    };
  }, [applyTerminalSessionExit, shouldUseNativeRenderer]);

  useEffect(() => {
    if (!shouldUseNativeRenderer) return undefined;

    const handleNativeRuntimeEvent = (event) => {
      const detail = event.detail || {};
      if (detail.panelId !== id) return;
      if (detail.type === 'panel-activated') {
        onActivatePanel?.(id);
        return;
      }
      if (detail.type !== 'runtime-error') return;

      nativeLeaseRef.current = false;
      setNativeVteOpened(false);
      setNativeVteOpenFailure(detail.reason || 'open-failed');
      setConnectionState('error');
      nativeVteProbeRetryCountRef.current = 0;
      clearNativeVteProbeRetryTimer();
    };

    window.addEventListener('devhub:terminal-native-vte-event', handleNativeRuntimeEvent);
    return () => {
      window.removeEventListener('devhub:terminal-native-vte-event', handleNativeRuntimeEvent);
    };
  }, [clearNativeVteProbeRetryTimer, id, onActivatePanel, shouldUseNativeRenderer]);

  const connect = useCallback(async () => {
    console.log(`[DEBUG TTY:${id}] connect() called`);
    if (connectInFlightRef.current) {
      cliLog(`CLIENT:${id}`, 'connect() skipped — connect already in flight');
      return;
    }
    if (sessionClosingRef.current) {
      cliLog(`CLIENT:${id}`, 'connect() skipped — session is closing');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      cliLog(`CLIENT:${id}`, 'connect() skipped — socket already open');
      setConnectionState('connected');
      sendResize();
      return;
    }

    initialCommandDelayScheduledRef.current = false;

    const connectCommandState = resolveConnectInitialCommandState({
      hasConnectedOnce: hasConnectedOnceRef.current,
      panelId: id,
      initialCommand,
    });
    if (connectCommandState.clearLifecycle) {
      clearPanelInitialCommandLifecycle(id);
    }
    sessionReattachedRef.current = connectCommandState.sessionReattached;
    serverReadyReceivedRef.current = false;
    hasSentInitialCommand.current = connectCommandState.hasSentInitialCommand;
    if (connectCommandState.markDispatched) {
      markPanelInitialCommandDispatched(id, initialCommand);
    }
    processExitedRef.current = false;

    if (!hasConnectedOnceRef.current) {
      setConnectionState('connecting');
    }

    cliLog(`CLIENT:${id}`, 'connect() called', { cwd, autoFocus });

    connectInFlightRef.current = true;
    const connectEpoch = connectEpochRef.current;
    if (connectAbortRef.current) {
      connectAbortRef.current.abort();
    }
    const abortController = new AbortController();
    connectAbortRef.current = abortController;

    try {
      // Silence the stale socket BEFORE closing it so its onclose doesn't
      // override 'connecting' back to 'disconnected' and trigger a reconnect loop.
      if (wsRef.current) {
        const stale = wsRef.current;
        stale.onopen = null;
        stale.onmessage = null;
        stale.onerror = null;
        stale.onclose = null;
        stale.close();
        wsRef.current = null;
        cliLog(`CLIENT:${id}`, 'stale socket silenced+closed');
      }

      const cwdParam = cwd ? `cwd=${encodeURIComponent(cwd)}` : '';
      const sessionIdParam = id ? `sessionId=${encodeURIComponent(id)}` : '';
      const legacyIdParam = id ? `id=${encodeURIComponent(id)}` : '';
      const swarmRoleParam = swarmContext?.isSwarmRole ? 'isSwarmRole=1' : '';
      const swarmRoleKeyParam = swarmContext?.roleKey
        ? `roleKey=${encodeURIComponent(swarmContext.roleKey)}`
        : '';
      const swarmLaunchIdParam = swarmContext?.launchId
        ? `launchId=${encodeURIComponent(swarmContext.launchId)}`
        : '';
      const queryParams = [
        cwdParam,
        sessionIdParam,
        legacyIdParam,
        swarmRoleParam,
        swarmRoleKeyParam,
        swarmLaunchIdParam,
      ]
        .filter(Boolean)
        .join('&');
      const queryStr = queryParams ? `?${queryParams}` : '';

      console.log(`[TTY:${id}] Connecting to /api/terminal/session${queryStr}`);
      cliLog(`CLIENT:${id}`, 'fetching session API', { queryStr });
      const sessionResponse = await fetch(`/api/terminal/session${queryStr}`, {
        cache: 'no-store',
        signal: abortController.signal,
      });
      if (connectEpoch !== connectEpochRef.current) {
        cliLog(`CLIENT:${id}`, 'connect() aborted — stale epoch after session API');
        return;
      }
      if (!sessionResponse.ok) {
        const errText = await sessionResponse.text().catch(() => '');
        console.error(`[TTY:${id}] Session API failed: ${sessionResponse.status}`, errText);
        cliLog(`CLIENT:${id}`, 'session API FAILED', {
          status: sessionResponse.status,
          body: errText,
        });
        throw new Error(`No se pudo crear la sesión de terminal (${sessionResponse.status}).`);
      }

      const { port, wsPath } = await sessionResponse.json();
      if (connectEpoch !== connectEpochRef.current) {
        cliLog(`CLIENT:${id}`, 'connect() aborted — stale epoch before WebSocket');
        return;
      }
      console.log(`[TTY:${id}] Got port=${port}, wsPath=${wsPath}`);
      cliLog(`CLIENT:${id}`, 'session API ok', { port, wsPath });
      transportRef.current = wsPath === '/' ? 'raw' : 'json';
      const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${wsProtocol}://127.0.0.1:${port}${wsPath}${queryStr}`;
      console.log(`[TTY:${id}] WebSocket URL: ${wsUrl}`);
      cliLog(`CLIENT:${id}`, 'opening WebSocket', { wsUrl });
      const socket = new WebSocket(wsUrl);
      if (connectEpoch !== connectEpochRef.current) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
        cliLog(`CLIENT:${id}`, 'connect() aborted — stale epoch after WebSocket create');
        return;
      }
      wsRef.current = socket;
      panelActivityTrackerRef.current = createPanelActivityTracker(id);

      const connectionTimeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          console.error(`[TTY:${id}] WebSocket connection timeout after 10s`);
          cliLog(`CLIENT:${id}`, 'WS connection TIMEOUT (10s)', { readyState: socket.readyState });
          socket.close();
          setConnectionState('error');
        }
      }, 10000);

      socket.onopen = () => {
        if (connectEpoch !== connectEpochRef.current) return;
        clearTimeout(connectionTimeout);
        clearConnectDeferTimer();
        console.log(`[TTY:${id}] WebSocket connected`);
        cliLog(`CLIENT:${id}`, 'WS onopen — connected');
        hasConnectedOnceRef.current = true;
        panelActivityTrackerRef.current?.onOpen();
        if (initialCommandConnectSnapshotRef.current === null) {
          initialCommandConnectSnapshotRef.current = initialCommand;
        }
        setHasConnectedOnce(true);
        setConnectionState('connected');
        if (!initialCommand) {
          hasSentInitialCommand.current = true;
        }
        sendResize();
        // Note: sendInitialCommandIfReady() is NOT called here. It is gated on the
        // server's `ready` message (see Bug B) to avoid typing the launch command into
        // an already-live reattached TUI. The `ready` handler dispatches it for fresh
        // sessions; confirmViewportFit dispatches it once both ready + fit are done.

        // Show restored toast for sessions from previous run
        if (restored && cwd) {
          setRestoredToast(true);
          setTimeout(() => setRestoredToast(false), 2000);
        }
        // Initial focus handled by the other useEffect
      };

      const handleTuiReadyFromOutput = (chunk) => {
        if (!chunk || typeof chunk !== 'string') return;
        const tail = `${tuiOutputTailRef.current}${chunk}`.slice(-8192);
        tuiOutputTailRef.current = tail;

        // Capa B: kimi readiness posts marker only — never fall through to opencode/grok.
        const isKimiLaunch = isKimiLaunchCommand(initialCommand);
        const kimiTuiReady = detectKimiTuiReady(chunk) || detectKimiTuiReady(tail);
        if (isKimiLaunch || kimiTuiReady) {
          if (!kimiReadyNotifiedRef.current && kimiTuiReady) {
            kimiReadyNotifiedRef.current = true;
            void notifyAgentReady('kimi', null, 'client-tui-footer');
          }
          if (isKimiLaunch) {
            return;
          }
        }

        const footerReady = detectOpenCodeTuiReady(chunk) || detectOpenCodeTuiReady(tail);
        const grokReady = detectGrokSessionFromOutput(chunk) || detectGrokSessionFromOutput(tail);
        if (!footerReady && !grokReady) return;
        tuiSessionActiveRef.current = true;
        if (!hasSentInitialCommand.current && initialCommand) {
          hasSentInitialCommand.current = true;
          markPanelInitialCommandDispatched(id, initialCommand);
        }
        if (grokReady) {
          isGrokSessionRef.current = true;
          grokTuiReadyRef.current = true;
          setNativeWheelPassthrough(false);
        }
        if (footerReady) {
          tuiSessionFooterConfirmedRef.current = true;
          setNativeWheelPassthrough(true);
          void notifyOpencodeReady(null, 'client-tui-footer');
        }
        prepareActiveTuiTerminalFocus(termRef.current, { tuiSessionActive: true });
      };

      const clearSyncOutputTimeout = () => {
        if (syncOutputTimeoutRef.current) {
          clearTimeout(syncOutputTimeoutRef.current);
          syncOutputTimeoutRef.current = null;
        }
      };

      const flushTerminalOutputQueue = () => {
        terminalOutputFlushRafRef.current = null;
        if (isDisposingRef.current) {
          terminalOutputQueueRef.current = [];
          syncOutputBufferRef.current = '';
          syncOutputActiveRef.current = false;
          clearSyncOutputTimeout();
          return;
        }

        let combined = terminalOutputQueueRef.current.join('');
        terminalOutputQueueRef.current = [];

        // Backlog detection: if the PTY is flooding faster than xterm.js can
        // paint, drop the middle of the burst and keep the tail so the user
        // still sees the most recent state instead of a frozen/black terminal.
        const pendingBytes = combined.length + syncOutputBufferRef.current.length;
        if (pendingBytes > TERMINAL_OUTPUT_BACKLOG_THRESHOLD) {
          cliLog(`RENDER:${id}`, 'output-throttle-backlog', {
            pendingBytes,
            droppedBytes: Math.max(0, pendingBytes - TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME),
            isActivePanel: isActivePanelRef.current,
          });
          combined = combined.slice(-TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME);
          syncOutputBufferRef.current = '';
          syncOutputActiveRef.current = false;
          clearSyncOutputTimeout();
        }

        if (!combined) return;

        // Respect synchronized output (DEC mode 2026) so TUIs don't flicker
        // during bulk repaints. Buffer everything between ?2026h and ?2026l.
        if (syncOutputActiveRef.current) {
          syncOutputBufferRef.current += combined;
          if (syncOutputBufferRef.current.includes(TERMINAL_SYNC_OUTPUT_END_SEQ)) {
            clearSyncOutputTimeout();
            combined = syncOutputBufferRef.current;
            syncOutputBufferRef.current = '';
            syncOutputActiveRef.current = false;
          } else {
            return;
          }
        } else {
          const startIdx = combined.indexOf(TERMINAL_SYNC_OUTPUT_START_SEQ);
          if (startIdx !== -1) {
            const before = combined.slice(0, startIdx);
            if (before) {
              termRef.current?.write(before);
              handleTuiReadyFromOutput(before);
            }
            syncOutputActiveRef.current = true;
            syncOutputBufferRef.current = combined.slice(startIdx);
            if (syncOutputBufferRef.current.includes(TERMINAL_SYNC_OUTPUT_END_SEQ)) {
              clearSyncOutputTimeout();
              combined = syncOutputBufferRef.current;
              syncOutputBufferRef.current = '';
              syncOutputActiveRef.current = false;
            } else {
              syncOutputTimeoutRef.current = setTimeout(() => {
                if (!syncOutputActiveRef.current) return;
                const forced = syncOutputBufferRef.current;
                syncOutputBufferRef.current = '';
                syncOutputActiveRef.current = false;
                if (forced && termRef.current && !isDisposingRef.current) {
                  termRef.current.write(forced);
                  handleTuiReadyFromOutput(forced);
                  scrollIfActivePanel();
                }
              }, TERMINAL_SYNC_OUTPUT_MAX_HOLD_MS);
              return;
            }
          }
        }

        // Per-frame byte cap: never write more than MAX_BYTES_PER_FRAME in a
        // single animation frame. Queue the rest for the next frame so the main
        // thread no se congela.
        if (combined.length > TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME) {
          const now = combined.slice(0, TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME);
          const rest = combined.slice(TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME);
          terminalOutputQueueRef.current.unshift(rest);
          combined = now;
          if (!terminalOutputFlushRafRef.current) {
            terminalOutputFlushRafRef.current = requestAnimationFrame(flushTerminalOutputQueue);
          }
        }

        termRef.current?.write(combined);
        handleTuiReadyFromOutput(combined);
        scrollIfActivePanel();
      };

      const scheduleTerminalOutputWrite = (chunk) => {
        terminalOutputQueueRef.current.push(chunk);
        if (!terminalOutputFlushRafRef.current) {
          terminalOutputFlushRafRef.current = requestAnimationFrame(flushTerminalOutputQueue);
        }
      };

      const writeTerminalOutput = (chunk) => {
        if (containsTerminalResponseNoise(chunk)) {
          cliLog(`RENDER:${id}`, 'output-noise-filtered', {
            bytes: chunk.length,
            isActivePanel: isActivePanelRef.current,
            webglAttached: Boolean(webglAddonRef.current),
          });
        }
        const filtered = filterTerminalOutputForSession(null, chunk, outputPendingRef.current);
        if (
          shouldSkipTerminalOutputWhileLayoutHidden({
            isVisibleInLayout: isVisibleInLayoutRef.current,
            isActivePanel: isActivePanelRef.current,
            operationalRendererMode: operationalRendererModeRef.current,
            canvasAttached: Boolean(canvasAddonRef.current),
          })
        ) {
          if (typeof filtered === 'string' && filtered.length > 0) {
            appendHiddenTerminalOutputBuffer(hiddenOutputBufferRef.current, filtered);
            hiddenOutputCatchupPendingRef.current = true;
          }
          return;
        }
        if (typeof filtered !== 'string' || filtered.length === 0) return;

        // Projection can flip visible before catchup runs — keep buffering until
        // syncTerminalViewportOnWorkspaceShow flushes once (avoids double PS1/echo).
        if (hiddenOutputCatchupPendingRef.current) {
          appendHiddenTerminalOutputBuffer(hiddenOutputBufferRef.current, filtered);
          return;
        }

        scheduleTerminalOutputWrite(filtered);
      };

      socket.onmessage = (event) => {
        if (connectEpoch !== connectEpochRef.current) return;
        if (isDisposingRef.current) return;
        if (transportRef.current === 'raw') {
          if (typeof event.data === 'string' && event.data.length > 0) {
            panelActivityTrackerRef.current?.onFrame('raw', event.data);
            writeTerminalOutput(event.data);
          }
          return;
        }

        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'ready') {
            panelActivityTrackerRef.current?.onReady(payload);
            serverReadyReceivedRef.current = true;
            if (payload.reattached) {
              sessionReattachedRef.current = true;
              hasSentInitialCommand.current = true;
              markPanelInitialCommandDispatched(id, initialCommand);
              hiddenOutputCatchupPendingRef.current = false;
              if (hiddenOutputBufferRef.current) {
                hiddenOutputBufferRef.current.value = '';
              }
              if (payload.mode === 'tui') {
                tuiSessionActiveRef.current = true;
                if (isKimiLaunchCommand(initialCommand)) {
                  kimiReadyNotifiedRef.current = true;
                }
              } else {
                tuiSessionActiveRef.current = false;
                isGrokSessionRef.current = false;
                grokTuiReadyRef.current = false;
                tuiSessionFooterConfirmedRef.current = false;
                setNativeWheelPassthrough(false);
                disableTerminalFocusReporting(termRef.current, { disableMouse: true });
              }

              // xterm.js is fresh after reconnect; prod the TUI/shell into
              // re-emitting its private modes and redraw the screen.
              resetTerminalModesForReattach(termRef.current, {
                tuiSessionActive: tuiSessionActiveRef.current,
              });
            } else {
              // Fresh session: the tmux pane is empty, so it is safe to launch the
              // agent now. sendInitialCommandIfReady also waits for viewport fit.
              sendInitialCommandIfReady();
            }
            return;
          }

          if (payload.type === 'output' && typeof payload.data === 'string') {
            panelActivityTrackerRef.current?.onFrame('output', payload.data);
            writeTerminalOutput(payload.data);
            return;
          }

          // Some proxies / older server builds send title updates as JSON messages.
          // They are not terminal output; dropping them prevents stray control text
          // from appearing inside the TUI prompt.
          if (payload.type === 'title') {
            return;
          }

          if (payload.type === 'exit') {
            applyTerminalSessionExit(
              {
                id,
                initialCommand,
                reason: `child-exited:${payload.exitCode ?? 0}`,
              },
              { emitBrowserEvent: true }
            );
          }

          // The server detected an OpenCode session ID in this terminal — propagate it
          // so TerminalWorkspacesManager can persist it and restore it after reboots.
          if (payload.type === 'opencode-session-detected' && payload.sessionId) {
            window.dispatchEvent(
              new CustomEvent('devhub:opencode-session-detected', {
                detail: { panelId: id, sessionId: payload.sessionId },
              })
            );
            return;
          }

          if (payload.type === 'hermes-session-detected' && payload.sessionId) {
            window.dispatchEvent(
              new CustomEvent('devhub:hermes-session-detected', {
                detail: { panelId: id, sessionId: payload.sessionId },
              })
            );
            return;
          }
        } catch {
          if (typeof event.data === 'string' && event.data.length > 0) {
            writeTerminalOutput(event.data);
          }
        }
      };

      socket.onerror = (err) => {
        clearTimeout(connectionTimeout);
        console.error(`[TTY:${id}] WebSocket error:`, err);
        cliLog(`CLIENT:${id}`, 'WS onerror');
        setConnectionState('error');
      };

      socket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        panelActivityTrackerRef.current?.onClose();
        console.log(`[TTY:${id}] WebSocket closed: code=${event.code}, reason=${event.reason}`);
        cliLog(`CLIENT:${id}`, 'WS onclose', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        setConnectionState((prev) =>
          resolveTerminalConnectionCloseState(prev, processExitedRef.current)
        );
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        cliLog(`CLIENT:${id}`, 'connect() aborted — fetch cancelled');
        return;
      }
      console.error(`[TTY:${id}] Connection failed:`, error);
      cliLog(`CLIENT:${id}`, 'connect() catch', { error: error?.message });
      setConnectionState('error');
    } finally {
      if (connectAbortRef.current === abortController) {
        connectAbortRef.current = null;
      }
      connectInFlightRef.current = false;
    }
  }, [
    applyTerminalSessionExit,
    initialCommand,
    scheduleInactiveViewportRepaint,
    scrollIfActivePanel,
    scrollTerminalToBottom,
    sendInitialCommandIfReady,
    sendResize,
    cwd,
    id,
  ]);

  connectRef.current = connect;
  sendResizeRef.current = sendResize;

  const adjustFontSize = useCallback((delta) => {
    setFontSize((prev) => {
      const next = Math.min(24, Math.max(8, prev + delta));
      try {
        window.localStorage.setItem(FONT_SIZE_KEY, String(next));
        // Size fine-tuning stays local per panel (the A-/A+ buttons).
        // The base font family + weight + line/letter come from CSS vars (see getTerminalFontOptions).
      } catch {
        /* ignore */
      }
      if (termRef.current && !isDisposingRef.current) {
        termRef.current.options.fontSize = next;
        try {
          fitRef.current?.fit();
          // Keep WebGL atlas happy when metrics change.
          if (typeof termRef.current.clearTextureAtlas === 'function') {
            termRef.current.clearTextureAtlas();
          }
          termRef.current.refresh(0, termRef.current.rows - 1);
        } catch (err) {
          // Same teardown race as the ResizeObserver path: a font-size click
          // landing during dispose can hit the WebGL addon's stale renderer.
          if (!isStaleXtermRendererError(err)) throw err;
        }
      }
      return next;
    });
  }, []);

  // When the user switches away from this panel (isActivePanel becomes false),
  // disable "reporting" modes (focus events, mouse tracking) that many TUIs (like opencode)
  // use to "wake up" and re-query the terminal (sending DA1/DA2 queries like ^[[c ^[[>c).
  // If those queries happen in a background panel while the user is clicking other panels,
  // their responses can leak as visible text (the "1;2c0;276;0c..." garbage) and accumulate
  // in the prompt of the panels.
  // useLayoutEffect runs before paint so blur/focus churn cannot beat us to the PTY.
  useLayoutEffect(() => {
    isActivePanelRef.current = isActivePanel;

    const term = termRef.current;
    if (!term) return;

    if (!isActivePanel) {
      // Cancel active-panel resize debounces so a stale RAF cannot clear GPU atlases
      // after the user switched away. Still refit if the container geometry changed.
      clearTimers();
      disableTerminalFocusReporting(term, { disableMouse: true });
      try {
        if (term.element?.contains(document.activeElement)) {
          term.blur?.();
        }
      } catch {
        // intentional: terminal may already be disposed during unmount
      }
      return;
    }

    prepareActiveTuiTerminalFocus(term, {
      tuiSessionActive: tuiSessionActiveRef.current,
    });
  }, [clearTimers, isActivePanel, scheduleInactiveViewportRepaint]);

  useLayoutEffect(() => {
    if (
      connectionState !== 'error' &&
      connectionState !== 'disconnected' &&
      connectionState !== 'terminated' &&
      connectionState !== 'agent-exited'
    ) {
      return;
    }
    tuiSessionActiveRef.current = false;
    isGrokSessionRef.current = false;
    grokTuiReadyRef.current = false;
    tuiSessionFooterConfirmedRef.current = false;
    setNativeWheelPassthrough(false);
    disableTerminalFocusReporting(termRef.current, { disableMouse: true });
  }, [connectionState]);

  useLayoutEffect(() => {
    if (!isVisibleInLayout || !termRef.current) return;
    if (!hasConnectedOnceRef.current) {
      const fitWorked = fitTerminalViewport({
        container: containerRef.current,
        fitAddon: fitRef.current,
        term: termRef.current,
        socket: wsRef.current,
        clearAtlas: false,
        lastPtySizeRef: lastPtySizeRef.current,
      });
      maybeConnectAfterViewportFit(fitWorked);
      if (!hasConnectedOnceRef.current) return;
    }
    clearConnectDeferTimer();
    connectPendingUntilFitRef.current = false;

    // Layout-show useLayoutEffect owns false→true recovery (route / workspace /
    // window switches). Skip a second sync pass that duplicated fit+PTY churn.
    if (shouldSyncTerminalViewportOnLayoutShow(prevVisibleInLayoutRef.current, isVisibleInLayout)) {
      return;
    }

    const raf = requestAnimationFrame(() => {
      if (!isVisibleInLayoutRef.current || !termRef.current) return;
      syncTerminalViewportOnWorkspaceShow('projection-host-ready', {
        clearAtlas: webglReleasedOnLayoutHideRef.current || canvasReleasedOnLayoutHideRef.current,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [
    clearConnectDeferTimer,
    isVisibleInLayout,
    maybeConnectAfterViewportFit,
    syncTerminalViewportOnWorkspaceShow,
  ]);

  useLayoutEffect(() => {
    const prevVisible = prevVisibleInLayoutRef.current;
    const nextVisible = isVisibleInLayout;

    // Snapshot the global layout-settled generation when this panel becomes hidden.
    // On reveal we compare it against the live generation to detect churn that
    // happened in other workspaces; those events carry panelIds of the active
    // workspace, so they never reach this hidden panel via the normal listener.
    if (!nextVisible && layoutHiddenGenerationRef.current === 0) {
      layoutHiddenGenerationRef.current = getTerminalLayoutSettledGeneration();
    }

    if (workspaceShowSyncTimerRef.current) {
      clearTimeout(workspaceShowSyncTimerRef.current);
      workspaceShowSyncTimerRef.current = null;
    }
    if (workspaceShowRecoverTimerRef.current) {
      clearTimeout(workspaceShowRecoverTimerRef.current);
      workspaceShowRecoverTimerRef.current = null;
    }

    // NOTE: we intentionally do NOT release WebGL/Canvas when the panel becomes
    // hidden. Workspaces are kept mounted with visibility:hidden, so the addon
    // must stay attached for instant reactivation. Real GPU disposal happens on
    // unmount via disposeXtermRuntime().

    if (shouldSyncTerminalViewportOnLayoutShow(prevVisible, nextVisible)) {
      restoreInitialCommandDispatchGuard();
      if (shouldUseNativeRenderer && nativeVteOpened) {
        void showAndResizeNativeLease();
      } else {
        const isWorkspaceTabReveal =
          isWorkspaceShellVisible && !prevWorkspaceShellVisibleRef.current;
        const softGpuEligible = shouldSoftGpuWorkspaceReveal({
          operationalRendererMode: operationalRendererModeRef.current,
          webglAddon: webglAddonRef.current,
          canvasAddon: canvasAddonRef.current,
          visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
          pendingWebglRecovery: pendingWebglRecoveryRef.current,
          webglReleasedOnLayoutHide: webglReleasedOnLayoutHideRef.current,
          canvasReleasedOnLayoutHide: canvasReleasedOnLayoutHideRef.current,
        });
        const revealMode = resolveWorkspaceLayoutShowRevealMode({
          isWorkspaceTabReveal,
          softGpuEligible,
          hiddenOutputCatchupPending: hiddenOutputCatchupPendingRef.current,
          tuiSessionActive: tuiSessionActiveRef.current,
        });

        // If layout churn happened while this panel was hidden, the GPU framebuffer
        // may be stale even though the addon is still attached. Skip the soft/no-op
        // paths and run a real fit + clear + repaint, with bounded retries.
        const hadLocalChurn = layoutChurnedWhileHiddenRef.current;
        const hiddenGeneration = layoutHiddenGenerationRef.current;
        const currentGeneration = getTerminalLayoutSettledGeneration();
        const hadGlobalChurn = hiddenGeneration > 0 && currentGeneration > hiddenGeneration;
        const hadLayoutChurn = hadLocalChurn || hadGlobalChurn;
        layoutChurnedWhileHiddenRef.current = false;
        layoutHiddenGenerationRef.current = 0;

        if (revealMode === 'soft' && !hadLayoutChurn) {
          needsViewportSyncOnShowRef.current = false;
          performSoftGpuVisibilityReveal(
            termRef.current,
            hiddenOutputBufferRef.current,
            hiddenOutputCatchupPendingRef
          );
          logViewportDiagnostic('workspace-show-visible-soft-gpu-reveal');
          if (!isWorkspaceTabReveal) {
            // Parked windows were visibility:hidden — one deferred refresh after the
            // shell becomes visible so WebGL composites the live bitmap (no clear()).
            requestAnimationFrame(() => {
              if (!isVisibleInLayoutRef.current || !termRef.current) return;
              performSoftGpuVisibilityReveal(
                termRef.current,
                hiddenOutputBufferRef.current,
                hiddenOutputCatchupPendingRef
              );
            });
          }
        } else {
          const rendererReadyNow = Boolean(
            termRef.current && isTerminalRendererReady(termRef.current)
          );
          if (!rendererReadyNow) {
            needsViewportSyncOnShowRef.current = true;
            scheduleBoundedGpuRecoverRef.current?.(48);
          }
          void (async () => {
            if (
              needsGpuRendererReattach({
                operationalRendererMode: operationalRendererModeRef.current,
                webglAddon: webglAddonRef.current,
                canvasAddon: canvasAddonRef.current,
              })
            ) {
              if (
                shouldAttachWebglRenderer({
                  operationalRendererMode: operationalRendererModeRef.current,
                })
              ) {
                await tryReattachWebglAddonRef.current?.({
                  clearAtlas: false,
                  skipFitWhenUnchanged: true,
                });
              } else if (
                shouldAttachCanvasRenderer({
                  operationalRendererMode: operationalRendererModeRef.current,
                })
              ) {
                await tryReattachCanvasAddonRef.current?.();
              }
            }
            const stillNeedsGpu = needsGpuRendererReattach({
              operationalRendererMode: operationalRendererModeRef.current,
              webglAddon: webglAddonRef.current,
              canvasAddon: canvasAddonRef.current,
            });
            if (stillNeedsGpu || !isTerminalRendererReady(termRef.current)) {
              needsViewportSyncOnShowRef.current = true;
              scheduleBoundedGpuRecoverRef.current?.(48);
            } else if (isVisibleInLayoutRef.current && termRef.current) {
              if (hadLayoutChurn) {
                // The GPU framebuffer may have been discarded while the panel was
                // opacity-hidden. For plain shells a real clear+repaint is safe.
                // For live TUIs (OpenCode/Grok/etc.) a clearAtlas wipes the canvas
                // and the TUI does not repaint until it receives SIGWINCH/input, so
                // we use a TUI-safe path: fit without PTY notify, refresh+force
                // repaint, then nudge the PTY with an unchanged-dimension SIGWINCH
                // to make the TUI redraw without altering its layout.
                if (tuiSessionActiveRef.current && containerRef.current && fitRef.current) {
                  fitTerminalViewport({
                    container: containerRef.current,
                    fitAddon: fitRef.current,
                    term: termRef.current,
                    socket: wsRef.current,
                    clearAtlas: false,
                    lastPtySizeRef: lastPtySizeRef.current,
                    skipPtyNotify: true,
                  });
                  stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
                  refreshTerminalViewport(termRef.current);
                  if (isTerminalRendererReady(termRef.current)) {
                    forceTerminalViewportRepaint(termRef.current);
                  }
                  nudgeTerminalPtyResize({
                    term: termRef.current,
                    socket: wsRef.current,
                    lastPtySizeRef: lastPtySizeRef.current,
                    force: true,
                  });
                  logViewportDiagnostic('workspace-show-layout-churn-recover-tui');
                } else {
                  void syncTerminalViewportOnWorkspaceShow('workspace-show-layout-churn-recover', {
                    clearAtlas: true,
                  });
                }
                scheduleBoundedGpuRecoverRef.current?.(24);
              } else {
                performSoftGpuVisibilityReveal(
                  termRef.current,
                  hiddenOutputBufferRef.current,
                  hiddenOutputCatchupPendingRef
                );
              }
            }
            scheduleWorkspaceShowRecovery(
              hadLayoutChurn ? 'workspace-show-layout-churn-recover' : 'workspace-show-visible'
            );
          })();
        }
      }
    } else if (!isVisibleInLayout) {
      needsViewportSyncOnShowRef.current = true;
    } else if (isVisibleInLayout && needsViewportSyncOnShowRef.current) {
      syncTerminalViewportOnWorkspaceShow('workspace-show-pending', { clearAtlas: true });
    }

    prevVisibleInLayoutRef.current = isVisibleInLayout;
    prevWorkspaceShellVisibleRef.current = isWorkspaceShellVisible;

    return () => {
      if (workspaceShowSyncTimerRef.current) {
        clearTimeout(workspaceShowSyncTimerRef.current);
        workspaceShowSyncTimerRef.current = null;
      }
      if (workspaceShowRecoverTimerRef.current) {
        clearTimeout(workspaceShowRecoverTimerRef.current);
        workspaceShowRecoverTimerRef.current = null;
      }
      workspaceShowZeroSizeObserverRef.current?.disconnect();
      workspaceShowZeroSizeObserverRef.current = null;
    };
  }, [
    isVisibleInLayout,
    isWorkspaceShellVisible,
    nativeVteOpened,
    operationalRendererMode,
    releaseCanvasAddon,
    releaseWebglAddonForInactivePanel,
    restoreInitialCommandDispatchGuard,
    scheduleWorkspaceShowRecovery,
    shouldUseNativeRenderer,
    showAndResizeNativeLease,
    syncTerminalViewportOnWorkspaceShow,
  ]);

  useEffect(() => {
    const handleSurvivorRecover = (event) => {
      if (isDisposingRef.current) return;
      const panelIds = Array.isArray(event?.detail?.panelIds) ? event.detail.panelIds : null;
      if (panelIds && panelIds.length > 0 && !panelIds.includes(id)) return;
      // survivorPanelIds spans every remaining workspace, so this can fire for
      // panels that are not on screen; defer those to the show edge.
      if (!isVisibleInLayoutRef.current) {
        needsViewportSyncOnShowRef.current = true;
        layoutChurnedWhileHiddenRef.current = true;
        return;
      }

      const reason = event?.detail?.reason || '';
      const isWorkspaceRemove = String(reason).includes('workspace-removed');
      const isWorkspaceWindowSwitch = String(reason).includes('workspace-window-switch');
      const gpuStillAttached = !needsGpuRendererReattach({
        operationalRendererMode: operationalRendererModeRef.current,
        webglAddon: webglAddonRef.current,
        canvasAddon: canvasAddonRef.current,
      });
      const noGpuRecoveryPending =
        !pendingWebglRecoveryRef.current &&
        !webglReleasedOnLayoutHideRef.current &&
        !canvasReleasedOnLayoutHideRef.current;
      if (!isWorkspaceRemove && gpuStillAttached && noGpuRecoveryPending) {
        // layout-show soft reveal owns tab/window park when GPU stayed attached.
        return;
      }
      // Workspace/window switches keep terminals mounted and the GPU addon attached.
      // Only a real workspace removal needs the costly GPU recycle + reattach cycle.
      const now = Date.now();
      if (isWorkspaceRemove && now - survivorGpuRecycleAtRef.current > 1500) {
        survivorGpuRecycleAtRef.current = now;
        if (webglAddonRef.current) {
          releaseWebglAddonForInactivePanel('survivor-recover-webgl');
        } else if (canvasAddonRef.current) {
          releaseCanvasAddon('survivor-recover-canvas');
        }
        needsViewportSyncOnShowRef.current = true;
      }
      const recoverReason = isWorkspaceRemove
        ? WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON
        : isWorkspaceWindowSwitch
          ? WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON
          : 'workspace-show-layout';
      scheduleWorkspaceShowRecovery(recoverReason);
    };

    window.addEventListener('devhub:terminal-survivor-recover', handleSurvivorRecover);
    return () => {
      window.removeEventListener('devhub:terminal-survivor-recover', handleSurvivorRecover);
    };
  }, [id, releaseCanvasAddon, releaseWebglAddonForInactivePanel, scheduleWorkspaceShowRecovery]);

  const reconnect = useCallback(() => {
    processExitedRef.current = false;
    setSessionExitReason(null);
    clearPanelSessionExit(id);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      cliLog(`CLIENT:${id}`, 'reconnect() skipped — socket already open');
      setConnectionState('connected');
      sendResize();
      if (autoFocus) {
        prepareActiveTuiTerminalFocus(termRef.current, {
          tuiSessionActive: tuiSessionActiveRef.current,
        });
        termRef.current?.focus?.();
      }
      return;
    }
    cliLog(`CLIENT:${id}`, 'reconnect() called');
    logTerminalSession('terminal-reconnect', {
      panelId: id,
      connectionState: connectionStateRef.current,
      initialCommand,
    });
    termRef.current?.clear();
    connect();
  }, [autoFocus, connect, initialCommand, sendResize]);

  const prevInitialCommandRef = useRef(initialCommand);
  useEffect(() => {
    const previous = prevInitialCommandRef.current;
    prevInitialCommandRef.current = initialCommand;

    if (previous === initialCommand) return;
    if (!/#recovery-\d+\s*$/i.test(initialCommand)) return;

    logTerminalSession('initial-command-recovery-reconnect', {
      panelId: id,
      previous,
      initialCommand,
    });
    hasSentInitialCommand.current = false;
    clearPanelInitialCommandLifecycle(id);
    reconnect();
  }, [id, initialCommand, reconnect]);

  const copyTextToClipboard = useCallback(async (text) => {
    if (!text) return false;

    try {
      const clipboardApi = getClipboardApi();
      if (!clipboardApi?.writeText) {
        throw new Error('clipboard-unavailable');
      }
      await clipboardApi.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    return true;
  }, []);

  const handleCopySelection = useCallback(async () => {
    const text = termRef.current?.getSelection?.() || contextMenu?.text || '';
    return copyTextToClipboard(text);
  }, [contextMenu?.text, copyTextToClipboard]);

  const handlePasteIntoTerminal = useCallback(
    async ({ clipboardEvent, image: providedImage } = {}) => {
      cliLog('[paste]', 'handlePasteIntoTerminal called');

      const image = providedImage || (await readClipboardImage({ clipboardEvent }));
      if (image?.data) {
        cliLog(
          '[paste]',
          `clipboard image detected mime=${image.mimeType} len=${image.data.length}`
        );
        const tempPath = await saveClipboardImageToTempFile(image);
        if (!tempPath) {
          cliLog('[paste]', 'failed to save clipboard image to temp file');
          return false;
        }
        cliLog('[paste]', `saved clipboard image to temp path=${tempPath}`);
        // For raw PTY / native VTE we quote the path so the shell treats it as
        // one argument. For xterm.js bracketed-paste we send the bare path;
        // bracketed paste is atomic and Kimi Code parses it as an attachment.
        const quotedPath = `"${tempPath.replace(/"/g, '\\"')}"`;

        if (shouldUseNativeRenderer) {
          cliLog('[paste]', `shouldUseNativeRenderer=true, image temp path=${tempPath}`);
          await Promise.resolve(focusNativeVtePanel({ panelId: id })).catch(
            handleNativeLeaseCommandError
          );
          const result = await pasteNativeVtePanel({ panelId: id, text: quotedPath });
          cliLog('[paste]', `pasteNativeVtePanel returned supported=${result?.supported}`);
          return Boolean(result?.supported);
        }

        // For images we force a bracketed-paste sequence so Kimi Code treats
        // the temp path as a clipboard attachment instead of raw user text.
        // xterm.js only wraps term.paste() in bracketed paste when the PTY has
        // already enabled the mode, so we inject the wrappers ourselves.
        const bracketedPath = `\x1b[200~${tempPath}\x1b[201~`;
        cliLog('[paste]', `pasting image path via forced bracketed paste`);
        if (
          sendTerminalPasteInput({
            socket: wsRef.current,
            transport: transportRef.current,
            text: bracketedPath,
          })
        ) {
          return true;
        }

        if (typeof termRef.current?.paste === 'function') {
          cliLog('[paste]', `falling back to term.paste for image path`);
          termRef.current.paste(tempPath);
          return true;
        }

        return false;
      }

      const text = await readClipboardText({ clipboardEvent });
      if (!text) return false;

      if (shouldUseNativeRenderer) {
        cliLog('[paste]', `shouldUseNativeRenderer=true, clipboard text len=${text.length}`);
        await Promise.resolve(focusNativeVtePanel({ panelId: id })).catch(
          handleNativeLeaseCommandError
        );
        const result = await pasteNativeVtePanel({ panelId: id, text });
        cliLog('[paste]', `pasteNativeVtePanel returned supported=${result?.supported}`);
        return Boolean(result?.supported);
      }

      if (
        sendTerminalPasteInput({
          socket: wsRef.current,
          transport: transportRef.current,
          text,
        })
      ) {
        return true;
      }

      if (typeof termRef.current?.paste === 'function') {
        termRef.current.paste(text);
        return true;
      }

      return false;
    },
    [handleNativeLeaseCommandError, id, shouldUseNativeRenderer]
  );

  useEffect(() => {
    let mounted = true;

    if (!shouldBootXterm) {
      disposeXtermRuntime();
      setInitError(null);
      setIsInitializing(runtimePhase === 'native-probing' || runtimePhase === 'native-opening');

      return () => {
        mounted = false;
        clearTimers();
        resizeObserverRef.current?.disconnect();
        nativeResizeObserverRef.current?.disconnect();
        nativeResizeObserverRef.current = null;
        if (nativeResizeRafRef.current) {
          cancelAnimationFrame(nativeResizeRafRef.current);
          nativeResizeRafRef.current = null;
        }
        disposeXtermRuntime();
      };
    }

    async function initializeTerminal() {
      if (isInitializingRef.current || termRef.current) {
        cliLog(`CLIENT:${id}`, 'initializeTerminal() skipped — runtime exists or init in flight');
        return;
      }
      isInitializingRef.current = true;
      cliLog(`CLIENT:${id}`, 'initializeTerminal() start', {
        cwd,
        autoFocus,
        requestedRendererMode: requestedRendererModeRef.current,
        effectiveRendererMode: rendererViewModel.effectiveMode,
      });
      try {
        const importList = [
          import('xterm'),
          import('xterm-addon-fit'),
          import('xterm-addon-search'),
        ];
        // Attempt WebGL addon on explicit user choice (requested) even if the snapshot effective
        // was still 'xterm' because the async probe had not arrived yet. The probe only informs
        // the switcher labels and initial resolver; the actual load decides.
        const wantsWebgl = shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        });
        const wantsCanvas = shouldAttachCanvasRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        });
        const mountCanvasOnInit = shouldMountCanvasAddon({
          operationalRendererMode: operationalRendererModeRef.current,
          isActivePanel: isActivePanelRef.current,
          isVisibleInLayout: isVisibleInLayoutRef.current,
          visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
        });
        if (wantsWebgl) {
          importList.push(
            import('xterm-addon-webgl').catch((err) => {
              console.warn(`[TTY:${id}] Failed to import xterm-addon-webgl:`, err?.message || err);
              return { failed: true };
            })
          );
        } else if (wantsCanvas && mountCanvasOnInit) {
          importList.push(
            import('xterm-addon-canvas').catch((err) => {
              console.warn(`[TTY:${id}] Failed to import xterm-addon-canvas:`, err?.message || err);
              return { failed: true };
            })
          );
        }
        const importResults = await Promise.all(importList);

        const [{ Terminal }, { FitAddon }, { SearchAddon }] = importResults;
        const optionalAddonImport = importResults[3];
        const WebglAddonCtor =
          wantsWebgl && optionalAddonImport && !optionalAddonImport.failed
            ? optionalAddonImport.WebglAddon
            : null;
        const CanvasAddonCtor =
          mountCanvasOnInit && optionalAddonImport && !optionalAddonImport.failed
            ? optionalAddonImport.CanvasAddon
            : null;

        if (!mounted || !containerRef.current) {
          cliLog(
            `CLIENT:${id}`,
            'initializeTerminal() aborted — unmounted or no container (after import)'
          );
          return;
        }

        if (termRef.current) {
          cliLog(`CLIENT:${id}`, 'initializeTerminal() aborted — runtime won race after import');
          return;
        }

        const theme = getTerminalTheme();
        cliLog(`CLIENT:${id}`, 'computed theme colors', theme);

        // Font configuration comes from CSS variables via the central TerminalThemeSync
        // (opencode-vars.css / globals.css). This keeps the defaults (Kali thick style)
        // in a general CSS layer instead of inside the terminal component.
        const fontOpts = getTerminalFontOptions();

        const terminal = new Terminal({
          cursorBlink: true,
          cursorStyle: 'bar',
          cursorWidth: 2,
          fontFamily: fontOpts.fontFamily || resolveTerminalFontFamily(),
          fontSize: fontSize,
          fontWeight: fontOpts.fontWeight,
          fontWeightBold: fontOpts.fontWeightBold,
          letterSpacing: fontOpts.letterSpacing,
          lineHeight: fontOpts.lineHeight,
          allowTransparency: false,
          // T2.3 — per-pane scrollback buffer (R-BUF-3). The default
          // xterm scrollback is 1000 lines, which is too shallow for
          // director + 4 workers during a swarm launch: the user loses
          // the prompt injection context as soon as the TUI scrolls.
          // 5000 lines per pane × 5 panes = 25K total per launch, well
          // under the xterm memory budget. Per-pane (not global) so
          // single-pane users don't pay the extra memory.
          scrollback: 5000,
          theme: theme,
        });

        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(searchAddon);

        containerRef.current.replaceChildren();
        terminal.open(containerRef.current);
        prepareActiveTuiTerminalFocus(terminal, {
          tuiSessionActive: tuiSessionActiveRef.current,
        });
        if (terminalBlurCleanupRef.current) {
          terminalBlurCleanupRef.current();
          terminalBlurCleanupRef.current = null;
        }
        const blurTarget = terminal.element || containerRef.current;
        const handleTerminalBlur = () =>
          prepareActiveTuiTerminalFocus(terminal, {
            tuiSessionActive: tuiSessionActiveRef.current,
          });
        blurTarget?.addEventListener('focusout', handleTerminalBlur);
        terminalBlurCleanupRef.current = () => {
          blurTarget?.removeEventListener('focusout', handleTerminalBlur);
        };

        attachTerminalRendererAddons({
          terminal,
          wantsWebgl,
          wantsCanvas,
          mountCanvasOnInit,
          WebglAddonCtor,
          CanvasAddonCtor,
          panelId: id,
          webglAddonRef,
          canvasAddonRef,
          setWebglFallback,
          pendingWebglRecoveryRef,
          handleWebglContextLossRef,
          isActivePanel: isActivePanelRef.current,
          visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
        });

        terminal.onData((data) => {
          const sessionContext = {
            mode: tuiSessionActiveRef.current ? 'tui' : 'shell',
            tuiReady: isGrokSessionRef.current
              ? grokTuiReadyRef.current === true
              : tuiSessionFooterConfirmedRef.current === true,
            tuiAdapter: isGrokSessionRef.current
              ? 'grok'
              : tuiSessionActiveRef.current
                ? 'opencode'
                : 'shell',
            panelHidden: isVisibleInLayoutRef.current !== true,
            panelInactive: isActivePanelRef.current !== true,
          };
          const filtered = filterTerminalInputForSession(sessionContext, data);
          if (filtered === null) return;
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            if (transportRef.current === 'raw') {
              wsRef.current.send(filtered);
            } else {
              wsRef.current.send(JSON.stringify({ type: 'input', data: filtered }));
            }
          }
        });

        resizeObserverRef.current = new ResizeObserver(() => {
          if (isDisposingRef.current) return;
          if (!isVisibleInLayoutRef.current) {
            needsViewportSyncOnShowRef.current = true;
            return;
          }
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect || rect.width <= 0 || rect.height <= 0) return;
          logViewportDiagnostic('resize-observer');
          if (
            shouldRefitVisibleInactiveSplitPanel({
              isActivePanel: isActivePanelRef.current,
              isVisibleInLayout: isVisibleInLayoutRef.current,
            })
          ) {
            scheduleInactiveViewportRepaint();
            return;
          }
          const scheduleResize = () => sendResizeRef.current?.();
          if (tuiSessionActiveRef.current) {
            if (tuiResizeDebounceTimerRef.current) {
              clearTimeout(tuiResizeDebounceTimerRef.current);
            }
            tuiResizeDebounceTimerRef.current = setTimeout(() => {
              tuiResizeDebounceTimerRef.current = null;
              scheduleResize();
            }, 160);
            return;
          }
          scheduleResize();
        });
        resizeObserverRef.current.observe(containerRef.current);

        termRef.current = terminal;
        fitRef.current = fitAddon;
        searchRef.current = searchAddon;

        // A.0 lifecycle telemetry: a fresh xterm runtime came online.
        cliLog(
          `LIFECYCLE:${id}`,
          'boot',
          buildTerminalLifecycleEvent({
            event: 'boot',
            panelId: id,
            renderer: requestedRendererModeRef.current,
            isVisible: isVisibleInLayoutRef.current,
            cols: terminal?.cols,
            rows: terminal?.rows,
          })
        );

        setInitError(null);
        setIsInitializing(false);

        void waitForVisibleDimensions()
          .then((ready) => {
            cliLog(`CLIENT:${id}`, 'waitForVisibleDimensions done', {
              ready,
              width: containerRef.current?.getBoundingClientRect().width,
              height: containerRef.current?.getBoundingClientRect().height,
            });

            if (!mounted || !containerRef.current || !termRef.current || !fitRef.current) {
              return;
            }

            logViewportDiagnostic(ready ? 'terminal-open-visible' : 'terminal-open-pending');

            let fitWorked = false;
            if (ready) {
              fitWorked = fitTerminalViewport({
                container: containerRef.current,
                fitAddon,
                term: termRef.current,
                socket: wsRef.current,
                clearAtlas: Boolean(canvasAddonRef.current),
                lastPtySizeRef: lastPtySizeRef.current,
              });
              stabilizeTerminalRenderer(termRef.current, {
                clearAtlas: Boolean(canvasAddonRef.current),
              });
              refreshTerminalViewport(termRef.current);
            } else {
              logViewportDiagnostic('terminal-open-timeout');
              connectPendingUntilFitRef.current = true;
            }

            if (ready) {
              if (!maybeConnectAfterViewportFit(fitWorked)) {
                connectPendingUntilFitRef.current = true;
              } else {
                sendResizeRef.current?.();
              }
            }

            if (!mounted || !termRef.current || !isVisibleInLayoutRef.current) return;

            const needsGpuAfterInit = needsGpuRendererReattach({
              operationalRendererMode: operationalRendererModeRef.current,
              webglAddon: webglAddonRef.current,
              canvasAddon: canvasAddonRef.current,
            });
            if (needsGpuAfterInit) {
              void (async () => {
                if (
                  shouldAttachWebglRenderer({
                    operationalRendererMode: operationalRendererModeRef.current,
                  })
                ) {
                  await tryReattachWebglAddonRef.current?.({
                    clearAtlas: false,
                    skipFitWhenUnchanged: true,
                  });
                } else {
                  await tryReattachCanvasAddonRef.current?.();
                }
                if (termRef.current && isVisibleInLayoutRef.current) {
                  performSoftGpuVisibilityReveal(
                    termRef.current,
                    hiddenOutputBufferRef.current,
                    hiddenOutputCatchupPendingRef
                  );
                  needsViewportSyncOnShowRef.current = false;
                }
              })();
            } else if (needsViewportSyncOnShowRef.current && termRef.current) {
              performSoftGpuVisibilityReveal(
                termRef.current,
                hiddenOutputBufferRef.current,
                hiddenOutputCatchupPendingRef
              );
              needsViewportSyncOnShowRef.current = false;
            }
          })
          .catch((error) => {
            cliLog(`CLIENT:${id}`, 'waitForVisibleDimensions failed', {
              error: error?.message,
            });
          });
      } catch (error) {
        console.error(`[TTY:${id}] initializeTerminal() failed:`, error);
        cliLog(`CLIENT:${id}`, 'initializeTerminal() failed', { error: error?.message });

        if (!mounted) return;

        setInitError('No se pudo inicializar la terminal en esta ventana.');
        setConnectionState('error');
        setIsInitializing(false);
        disposeXtermRuntime();
        clearTimers();
        return;
      } finally {
        isInitializingRef.current = false;
      }
    }

    const initStaggerMs = resolveColdMountStaggerMs({
      coldMountOrdinal,
      isVisibleInLayout: isVisibleInLayoutRef.current,
    });
    let initStaggerTimer = null;
    if (initStaggerMs > 0) {
      initStaggerTimer = setTimeout(() => {
        if (mounted) initializeTerminal();
      }, initStaggerMs);
    } else {
      initializeTerminal();
    }

    return () => {
      mounted = false;
      isInitializingRef.current = false;
      if (initStaggerTimer) clearTimeout(initStaggerTimer);
      clearTimers();
      clearConnectDeferTimer();
      resizeObserverRef.current?.disconnect();
      nativeResizeObserverRef.current?.disconnect();
      nativeResizeObserverRef.current = null;
      if (nativeResizeRafRef.current) {
        cancelAnimationFrame(nativeResizeRafRef.current);
        nativeResizeRafRef.current = null;
      }
      // Silence the socket before closing so it doesn't set 'disconnected'
      // on the (possibly re-mounting) component during React Strict Mode double-invoke.
      if (wsRef.current) {
        const stale = wsRef.current;
        stale.onopen = null;
        stale.onmessage = null;
        stale.onerror = null;
        stale.onclose = null;
        stale.close();
        wsRef.current = null;
      }
      disposeXtermRuntime();
    };
  }, [
    // NOTE: logViewportDiagnostic is intentionally omitted. It transitively
    // depended on webglFallback.reason, so every WebGL fallback/recovery
    // re-ran this effect and spawned a second xterm instance (TTY-DOUBLE).
    clearTimers,
    disposeXtermRuntime,
    requestedRendererMode,
    runtimePhase,
    shouldBootXterm,
    waitForVisibleDimensions,
    xtermBootNonce,
    coldMountOrdinal,
    id,
    maybeConnectAfterViewportFit,
  ]);

  useEffect(() => {
    const handleSearch = (event) => {
      const detail = event.detail || {};
      const targetId = detail.targetId;
      const query = detail.query;
      const direction = detail.direction || 'next';

      if (!targetId || targetId !== id || !query || !searchRef.current) return;

      if (direction === 'prev') {
        searchRef.current.findPrevious(query, { caseSensitive: false, incremental: true });
        return;
      }

      searchRef.current.findNext(query, { caseSensitive: false, incremental: true });
    };

    window.addEventListener('devhub:terminal-search', handleSearch);
    return () => window.removeEventListener('devhub:terminal-search', handleSearch);
  }, [id]);

  useEffect(() => {
    const handleZedInput = (event) => {
      const detail = event?.detail;
      const target = detail?.terminalId || detail?.session_id || detail?.panelId;
      if (!detail || target !== id) return;
      sendTerminalPasteInput({
        socket: wsRef.current,
        transport: transportRef.current,
        text: detail.input,
      });
    };
    window.addEventListener('devhub:zed-terminal-input', handleZedInput);
    return () => window.removeEventListener('devhub:zed-terminal-input', handleZedInput);
  }, [id]);

  useEffect(() => {
    reactivateTerminalViewportRef.current = reactivateTerminalViewport;
  }, [reactivateTerminalViewport]);

  useEffect(() => {
    tryReattachWebglAddonRef.current = tryReattachWebglAddon;
  }, [tryReattachWebglAddon]);

  useEffect(() => {
    tryReattachCanvasAddonRef.current = tryReattachCanvasAddon;
  }, [tryReattachCanvasAddon]);

  // Recover viewport/WebGL only when this panel becomes active (false→true edge).
  useLayoutEffect(() => {
    const becameActive = shouldRecoverPanelOnActivation(
      prevIsActivePanelRef.current,
      isActivePanel
    );
    prevIsActivePanelRef.current = isActivePanel;

    if (!becameActive || shouldUseNativeRenderer) return;
    const term = termRef.current;
    if (!term) return;

    const hadGpuRenderer = Boolean(webglAddonRef.current || canvasAddonRef.current);
    const canUseWebgl = shouldAttachWebglRenderer({ operationalRendererMode });
    const canUseCanvas = shouldAttachCanvasRenderer({ operationalRendererMode });
    const clearAtlas =
      (canUseWebgl || canUseCanvas) && shouldClearWebglAtlasOnPanelActivation(hadGpuRenderer);

    if (
      shouldSkipReactivateViewportOnPanelActivation({
        hadGpuRenderer,
        clearAtlas,
        term,
        container: containerRef.current,
        fitAddon: fitRef.current,
      })
    ) {
      prepareActiveTuiTerminalFocus(term, {
        tuiSessionActive: tuiSessionActiveRef.current,
      });
      if (autoFocus) {
        term.focus?.();
      }
      return;
    }

    logRenderHealth('panel-activated-recover');
    if (canUseWebgl) {
      void tryReattachWebglAddonRef.current?.();
    } else if (canUseCanvas) {
      void tryReattachCanvasAddonRef.current?.();
    }
    reactivateTerminalViewportRef.current?.({
      clearAtlas,
    });

    if (hiddenOutputCatchupPendingRef.current && termRef.current) {
      void syncTerminalViewportOnWorkspaceShow('panel-activated-catchup', { clearAtlas: true });
    }

    if (!autoFocus) return;
    prepareActiveTuiTerminalFocus(term, {
      tuiSessionActive: tuiSessionActiveRef.current,
    });
    term.focus?.();
  }, [
    autoFocus,
    isActivePanel,
    logRenderHealth,
    operationalRendererMode,
    shouldUseNativeRenderer,
    syncTerminalViewportOnWorkspaceShow,
  ]);

  // Auto-reconnect when disconnected or error, with exponential backoff.
  // No hard attempt limit — the EBADF server fix prevents infinite hammering.
  // Backoff: 300ms → 600ms → 1200ms → 2400ms → 5000ms (max), then stays at 5s.
  const reconnectAttemptsRef = useRef(0);
  // Track autoFocus changes to reset the counter when the user switches to this tab.
  const prevAutoFocusRef = useRef(autoFocus);
  useEffect(() => {
    if (autoFocus && !prevAutoFocusRef.current) {
      // User actively switched to this terminal — give it a fresh reconnect budget.
      reconnectAttemptsRef.current = 0;
    }
    prevAutoFocusRef.current = autoFocus;
  }, [autoFocus]);

  useEffect(() => {
    if (sessionClosingRef.current) return undefined;

    if (shouldAutoReconnectTerminal(connectionState, autoFocus, initError)) {
      if (!autoFocus) {
        cliLog(`CLIENT:${id}`, 'auto-reconnect SKIPPED (not autoFocus)', { connectionState });
        return;
      }
      const delay = Math.min(300 * 2 ** reconnectAttemptsRef.current, 5000);
      cliLog(`CLIENT:${id}`, 'auto-reconnect scheduled', {
        connectionState,
        attempt: reconnectAttemptsRef.current,
        delayMs: delay,
      });
      logTerminalSession('terminal-auto-reconnect-scheduled', {
        panelId: id,
        connectionState,
        attempt: reconnectAttemptsRef.current,
        delayMs: delay,
      });
      const timer = setTimeout(() => {
        reconnectAttemptsRef.current += 1;
        reconnect();
      }, delay);
      return () => clearTimeout(timer);
    }
    // Reset counter on stable connection — next disconnect starts from 300ms again.
    if (connectionState === 'connected') {
      cliLog(`CLIENT:${id}`, 'connected — resetting reconnect counter');
      reconnectAttemptsRef.current = 0;
    }
  }, [autoFocus, connectionState, initError, reconnect]);

  useEffect(() => {
    const restoreNativeSurfaceAfterAppResume = () => {
      if (requestedRendererModeRef.current !== 'vte-experimental') return;
      if (!isVisibleInLayoutRef.current) return;
      if (nativeLeaseRef.current) {
        showAndResizeNativeLease();
      }
      queueNativeVteProbeRetry(0);
    };

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;

      restoreNativeSurfaceAfterAppResume();

      if (!isVisibleInLayout) {
        needsViewportSyncOnShowRef.current = true;
        return;
      }

      // Treat OS window restore the same as a workspace shell reveal: run the full
      // viewport sync pipeline so WebGL/Canvas reattach and the forced repaint happen.
      if (
        shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        isWebglAddonContextLost(webglAddonRef.current)
      ) {
        logViewportDiagnostic('visibility-webgl-context-lost');
        disposeWebglAddonForContextLoss('visibility-webgl-context-lost');
      }

      if (
        shouldRunTerminalViewportReactivation({
          isActivePanel,
          isVisibleInLayout,
          documentVisibilityState: document.visibilityState,
        })
      ) {
        logViewportDiagnostic('visibility-visible');
        void syncTerminalViewportOnWorkspaceShowRef
          .current?.('visibility-visible', { clearAtlas: true, forceScroll: false })
          .then(() => {
            if (isDisposingRef.current || !termRef.current) return;
            prepareActiveTuiTerminalFocus(termRef.current, {
              tuiSessionActive: tuiSessionActiveRef.current,
            });
            if (autoFocus) {
              termRef.current?.focus?.();
            }
          });
      } else {
        // Inactive split siblings don't get reactivate — repaint them too so they don't
        // stay garbled after OS window restore (Bug A).
        scheduleInactiveViewportRepaint();
      }
    };

    const handleWindowResize = () => {
      if (!isVisibleInLayoutRef.current) {
        needsViewportSyncOnShowRef.current = true;
        return;
      }
      logViewportDiagnostic('window-resize');
      if (isActivePanel) {
        sendResize();
      } else {
        fitAndResize({ clearAtlas: false });
      }
      queueNativeVteProbeRetry();
    };
    const handleWindowFocus = () => {
      restoreNativeSurfaceAfterAppResume();

      if (!isVisibleInLayout) {
        needsViewportSyncOnShowRef.current = true;
        return;
      }

      if (
        shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        isWebglAddonContextLost(webglAddonRef.current)
      ) {
        logViewportDiagnostic('window-focus-webgl-context-lost');
        disposeWebglAddonForContextLoss('window-focus-webgl-context-lost');
      }

      if (shouldRunTerminalViewportReactivation({ isActivePanel, isVisibleInLayout })) {
        logViewportDiagnostic('window-focus');
        void syncTerminalViewportOnWorkspaceShowRef
          .current?.('window-focus', { clearAtlas: true, forceScroll: false })
          .then(() => {
            if (isDisposingRef.current || !termRef.current) return;
            prepareActiveTuiTerminalFocus(termRef.current, {
              tuiSessionActive: tuiSessionActiveRef.current,
            });
            if (autoFocus) {
              termRef.current?.focus?.();
            }
          });
      } else {
        scheduleInactiveViewportRepaint();
      }
    };
    const handlePageShow = () => {
      restoreNativeSurfaceAfterAppResume();

      if (!isVisibleInLayout) {
        needsViewportSyncOnShowRef.current = true;
        return;
      }

      if (
        shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        isWebglAddonContextLost(webglAddonRef.current)
      ) {
        logViewportDiagnostic('pageshow-webgl-context-lost');
        disposeWebglAddonForContextLoss('pageshow-webgl-context-lost');
      }

      if (shouldRunTerminalViewportReactivation({ isActivePanel, isVisibleInLayout })) {
        logViewportDiagnostic('pageshow');
        void syncTerminalViewportOnWorkspaceShowRef
          .current?.('pageshow', { clearAtlas: true, forceScroll: false })
          .then(() => {
            if (isDisposingRef.current || !termRef.current) return;
            prepareActiveTuiTerminalFocus(termRef.current, {
              tuiSessionActive: tuiSessionActiveRef.current,
            });
            if (autoFocus) {
              termRef.current?.focus?.();
            }
          });
      } else {
        scheduleInactiveViewportRepaint();
      }
    };

    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (reactivateCoalesceTimerRef.current) {
        clearTimeout(reactivateCoalesceTimerRef.current);
        reactivateCoalesceTimerRef.current = null;
      }
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    isActivePanel,
    isVisibleInLayout,
    id,
    autoFocus,
    logViewportDiagnostic,
    queueNativeVteProbeRetry,
    fitAndResize,
    scheduleInactiveViewportRepaint,
    sendResize,
    showAndResizeNativeLease,
    disposeWebglAddonForContextLoss,
  ]);

  const layoutSettleBurstCleanupRef = useRef(null);

  useEffect(() => {
    const handleLayoutSettled = (event) => {
      if (isDisposingRef.current) return;
      if (!termRef.current || !fitRef.current) return;

      const reason = event?.detail?.reason || 'layout-settled';
      const panelIds = Array.isArray(event?.detail?.panelIds) ? event.detail.panelIds : null;
      // Closing a panel in one workspace can re-render the global workspace grid and
      // discard the GPU backing store of panels that are opacity-hidden in other
      // workspaces. Those panels never receive the filtered layout-settled event, so
      // allow panel-closed events to reach every mounted TerminalTTY.
      const isPanelClosedReason = String(reason).includes('panel-closed');
      if (panelIds && panelIds.length > 0 && !panelIds.includes(id) && !isPanelClosedReason) {
        return;
      }

      layoutSettleBurstCleanupRef.current?.();

      // Best-effort recovery for panels that are currently opacity-hidden in another
      // workspace. We cannot fit() safely because the container may be zero-sized, but
      // we can still force the renderer to repaint its internal bitmap and nudge a
      // live TUI so it redraws. This prevents the panel from staying black until a
      // manual resize when a panel is closed elsewhere.
      const recoverHiddenPanelForChurn = (churnReason) => {
        if (!termRef.current || !isTerminalRendererReady(termRef.current)) return;
        try {
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
          refreshTerminalViewport(termRef.current);
          forceTerminalViewportRepaint(termRef.current);
          if (tuiSessionActiveRef.current && wsRef.current) {
            nudgeTerminalPtyResize({
              term: termRef.current,
              socket: wsRef.current,
              lastPtySizeRef: lastPtySizeRef.current,
              force: true,
            });
          }
          logViewportDiagnostic(`hidden-panel-churn-recover-${churnReason}`);
        } catch (error) {
          if (!isStaleXtermRendererError(error)) throw error;
        }
      };

      const isProjectionReason =
        String(reason).includes('workspace-created') ||
        String(reason).includes('shared-surface-projection-ready') ||
        String(reason).includes('shared-surface-host-resize');
      if (isProjectionReason && isVisibleInLayoutRef.current) {
        projectionReadyRef.current = true;
        if (initialCommand && !hasSentInitialCommand.current) {
          sendInitialCommandIfReady();
        }
      }

      const kimiTuiLive = isKimiTuiLive({
        initialCommand,
        kimiReady: kimiReadyNotifiedRef.current,
        tuiSessionActive: tuiSessionActiveRef.current,
        hasConnectedOnce: hasConnectedOnceRef.current,
      });

      const isWorkspaceSwitch = String(reason).includes('workspace-switch');
      const isWorkspaceCloseRecover = isWorkspaceCloseRecoverReason(reason);
      const isWorkspaceOrWindowSwitch =
        isWorkspaceSwitch || String(reason).includes('workspace-window');

      // Lightweight guard: if the container dims already match the terminal grid and
      // there is no GPU recovery pending, most layout-settled reasons do not need the
      // heavy fit+repaint burst. This cuts the repeated flicker on workspace switch.
      const canSkipLayoutSettledRepaint = () => {
        if (!termRef.current || !fitRef.current || !containerRef.current) return false;
        const proposed = proposeTerminalViewportDimensions({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
        });
        const cols = termRef.current.cols;
        const rows = termRef.current.rows;
        const dimsMatch = proposed && proposed.cols === cols && proposed.rows === rows;
        const noGpuRecovery =
          !pendingWebglRecoveryRef.current &&
          !canvasReleasedOnLayoutHideRef.current &&
          !webglReleasedOnLayoutHideRef.current;
        return dimsMatch && noGpuRecovery && cols > 0 && rows > 0;
      };

      // Unified hidden-panel handling: a panel that is opacity-hidden in another
      // workspace cannot run the visible burst safely, but panel-closed churn from
      // any workspace can still corrupt its GPU bitmap. Mark churn for the reveal
      // edge and, for panel-closed, run a lightweight in-place recovery.
      if (!isVisibleInLayoutRef.current) {
        needsViewportSyncOnShowRef.current = true;
        layoutChurnedWhileHiddenRef.current = true;
        if (isPanelClosedReason) {
          recoverHiddenPanelForChurn(reason);
        }
        return;
      }

      if (kimiTuiLive && !String(reason).includes('panel-closed') && !isWorkspaceOrWindowSwitch) {
        syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-immediate`, {
          clearAtlas: false,
        });
        return;
      }

      if (
        String(reason).includes('shared-surface-projection-ready') ||
        String(reason).includes('shared-surface-host-resize')
      ) {
        if (!isVisibleInLayoutRef.current) {
          needsViewportSyncOnShowRef.current = true;
          layoutChurnedWhileHiddenRef.current = true;
          return;
        }
        if (canSkipLayoutSettledRepaint()) {
          logViewportDiagnostic(`${reason}-skipped-no-change`);
          return;
        }
        if (
          shouldAttachCanvasRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          }) &&
          !canvasAddonRef.current
        ) {
          void tryReattachCanvasAddonRef.current?.();
        }
        syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-immediate`, {
          clearAtlas: true,
        });
        if (
          !isDisposingRef.current &&
          tuiSessionActiveRef.current &&
          termRef.current &&
          isTerminalRendererReady(termRef.current)
        ) {
          refreshTerminalViewport(termRef.current);
          forceTerminalViewportRepaint(termRef.current);
        }
        return;
      }

      if (String(reason).includes('swarm-launch')) {
        if (!isVisibleInLayoutRef.current) {
          needsViewportSyncOnShowRef.current = true;
          layoutChurnedWhileHiddenRef.current = true;
          return;
        }
        if (canSkipLayoutSettledRepaint()) {
          logViewportDiagnostic(`${reason}-skipped-no-change`);
          return;
        }
        if (
          shouldAttachCanvasRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          }) &&
          !canvasAddonRef.current
        ) {
          void tryReattachCanvasAddonRef.current?.();
        }
        syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-immediate`, {
          clearAtlas: true,
        });
        if (
          !isDisposingRef.current &&
          termRef.current &&
          isTerminalRendererReady(termRef.current)
        ) {
          refreshTerminalViewport(termRef.current);
        }
        return;
      }

      if (String(reason).includes('workspace-created')) {
        if (!isVisibleInLayoutRef.current) {
          needsViewportSyncOnShowRef.current = true;
          layoutChurnedWhileHiddenRef.current = true;
          return;
        }
        if (canSkipLayoutSettledRepaint()) {
          logViewportDiagnostic(`${reason}-skipped-no-change`);
          return;
        }
        if (
          !hasConnectedOnceRef.current &&
          containerRef.current &&
          termRef.current &&
          fitRef.current
        ) {
          const fitWorked = fitTerminalViewport({
            container: containerRef.current,
            fitAddon: fitRef.current,
            term: termRef.current,
            socket: wsRef.current,
            clearAtlas: false,
            lastPtySizeRef: lastPtySizeRef.current,
          });
          maybeConnectAfterViewportFit(fitWorked);
        }
        syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-immediate`, {
          clearAtlas: false,
        });
        if (
          !isDisposingRef.current &&
          termRef.current &&
          isTerminalRendererReady(termRef.current)
        ) {
          forceTerminalViewportRepaint(termRef.current);
        }
        return;
      }

      if (
        String(reason).includes('panel-group-layout') ||
        String(reason).includes('internal-split-drag-end') ||
        String(reason).includes('right-dock-drag-end') ||
        String(reason).includes('panel-focus-toggle')
      ) {
        if (!isVisibleInLayoutRef.current) {
          needsViewportSyncOnShowRef.current = true;
          layoutChurnedWhileHiddenRef.current = true;
          return;
        }
        if (canSkipLayoutSettledRepaint()) {
          logViewportDiagnostic(`${reason}-skipped-no-change`);
          return;
        }
        if (
          shouldAttachCanvasRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          }) &&
          !canvasAddonRef.current
        ) {
          void tryReattachCanvasAddonRef.current?.();
        }
        syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-immediate`, {
          clearAtlas: true,
        });
        if (
          !isDisposingRef.current &&
          termRef.current &&
          isTerminalRendererReady(termRef.current)
        ) {
          forceTerminalViewportRepaint(termRef.current);
        }
        return;
      }

      if (String(reason).includes('panel-split') || String(reason).includes('panel-relaunch')) {
        if (!isVisibleInLayoutRef.current) {
          needsViewportSyncOnShowRef.current = true;
          layoutChurnedWhileHiddenRef.current = true;
          return;
        }
        if (canSkipLayoutSettledRepaint()) {
          logViewportDiagnostic(`${reason}-skipped-no-change`);
          return;
        }
        if (
          shouldAttachCanvasRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          }) &&
          !canvasAddonRef.current
        ) {
          void tryReattachCanvasAddonRef.current?.();
        }
        syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-immediate`, {
          clearAtlas: webglReleasedOnLayoutHideRef.current || canvasReleasedOnLayoutHideRef.current,
        });
        if (
          !isDisposingRef.current &&
          termRef.current &&
          isTerminalRendererReady(termRef.current)
        ) {
          forceTerminalViewportRepaint(termRef.current);
        }
        return;
      }

      if (
        String(reason).includes('pizarra-mode-exit') ||
        String(reason).includes('pizarra-mode-enter')
      ) {
        if (
          !hasConnectedOnceRef.current &&
          isVisibleInLayoutRef.current &&
          containerRef.current &&
          termRef.current
        ) {
          const fitWorked = fitTerminalViewport({
            container: containerRef.current,
            fitAddon: fitRef.current,
            term: termRef.current,
            socket: wsRef.current,
            clearAtlas: false,
            lastPtySizeRef: lastPtySizeRef.current,
          });
          maybeConnectAfterViewportFit(fitWorked);
        }
        if (isVisibleInLayoutRef.current) {
          syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-immediate`, {
            clearAtlas:
              webglReleasedOnLayoutHideRef.current || canvasReleasedOnLayoutHideRef.current,
          });
          if (
            !isDisposingRef.current &&
            termRef.current &&
            isTerminalRendererReady(termRef.current)
          ) {
            const kimiTuiLive = isKimiTuiLive({
              initialCommand,
              kimiReady: kimiReadyNotifiedRef.current,
            });
            if (tuiSessionActiveRef.current && !kimiTuiLive) {
              scrollTerminalToBottom(true);
            }
            refreshTerminalViewport(termRef.current);
            forceTerminalViewportRepaint(termRef.current);
          }
        } else {
          needsViewportSyncOnShowRef.current = true;
          layoutChurnedWhileHiddenRef.current = true;
        }
        return;
      }

      if (isWorkspaceCloseRecover) {
        const isWorkspaceRemove = String(reason).includes('workspace-removed');
        const gpuStillAttached = !needsGpuRendererReattach({
          operationalRendererMode: operationalRendererModeRef.current,
          webglAddon: webglAddonRef.current,
          canvasAddon: canvasAddonRef.current,
        });
        const noGpuRecoveryPending =
          !pendingWebglRecoveryRef.current &&
          !canvasReleasedOnLayoutHideRef.current &&
          !webglReleasedOnLayoutHideRef.current;
        // Option B: tab/window switch with live GPU — layout-show soft reveal already repainted.
        if (!isWorkspaceRemove && gpuStillAttached && noGpuRecoveryPending) {
          logViewportDiagnostic(`${reason}-survivor-skipped-gpu-attached`);
          return;
        }
        // Workspace close may dispose peer GPU contexts after the first pass — keep survivor path.
        scheduleWorkspaceShowRecovery(WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON);
        return;
      }

      const extraDelaysMs = String(reason).includes('panel-closed')
        ? [120, 180, 340]
        : isWorkspaceOrWindowSwitch
          ? [80, 180, 340]
          : String(reason).includes('panel-focus-toggle') ||
              String(reason).includes('panel-group-layout')
            ? [120, 180, 340, 500]
            : [180, 340];

      // Workspace/window switches with mounted terminals and no GPU recovery do not
      // need the multi-phase repaint burst. The layout-show useLayoutEffect already
      // handles the single repaint needed for instant reactivation.
      if (isWorkspaceOrWindowSwitch && canSkipLayoutSettledRepaint()) {
        logViewportDiagnostic(`${reason}-burst-skipped-no-change`);
        return;
      }

      layoutSettleBurstCleanupRef.current = scheduleTerminalViewportSyncBurst(
        (phase) => {
          if (isDisposingRef.current) return;
          if (!isVisibleInLayoutRef.current) {
            needsViewportSyncOnShowRef.current = true;
            layoutChurnedWhileHiddenRef.current = true;
            return;
          }
          syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-${phase}`, {
            clearAtlas: shouldClearGpuAtlasOnWorkspaceShow({
              operationalRendererMode: operationalRendererModeRef.current,
              reason: `layout-settled-${reason}-${phase}`,
              canvasReleasedOnLayoutHide: canvasReleasedOnLayoutHideRef.current,
            }),
          });
          // Retry the force-repaint across frames: a single attempt misses when
          // the GPU renderer is still reattaching async after being released while
          // another workspace was hidden (e.g. close-workspace / workspace-removed
          // bursts), leaving survivor panels black until a manual resize.
          if (!isDisposingRef.current && termRef.current) {
            scheduleBoundedForceRepaint(16);
            // Also re-fit so survivor TUIs that shifted size on close redraw at the
            // new container width (no-op when dims already match; skips kimi).
            scheduleBoundedFitRepaint(16);
            // Deterministic GPU reattach+repaint backbone for survivor panels.
            scheduleBoundedGpuRecover(16);
          }
        },
        { extraDelaysMs }
      );
    };

    window.addEventListener('devhub:terminal-layout-settled', handleLayoutSettled);
    return () => {
      layoutSettleBurstCleanupRef.current?.();
      layoutSettleBurstCleanupRef.current = null;
      window.removeEventListener('devhub:terminal-layout-settled', handleLayoutSettled);
    };
  }, [
    id,
    initialCommand,
    maybeConnectAfterViewportFit,
    scheduleBoundedForceRepaint,
    scheduleBoundedFitRepaint,
    scheduleBoundedGpuRecover,
    scheduleWorkspaceShowRecovery,
    scrollTerminalToBottom,
    sendInitialCommandIfReady,
    syncTerminalViewportOnWorkspaceShow,
  ]);

  // --- Scroll fix: preserve/restore scroll position when panel visibility changes ---
  useEffect(() => {
    if (!termRef.current) return;
    // Kimi behaves like a normal scrolling terminal (xterm viewportY moves with the
    // buffer), so it goes through the same save/restore path as shells — preserving the
    // scroll position across panel/workspace switches instead of jumping.
    if (isVisibleInLayout) {
      const saved = lastViewportYRef.current;
      if (saved != null) {
        restoreTerminalViewportScroll(termRef.current, saved);
      } else if (isActivePanel) {
        scrollTerminalToBottom(true);
      }
    } else {
      lastViewportYRef.current = getTerminalViewportScrollOffset(termRef.current);
    }
  }, [initialCommand, isVisibleInLayout, isActivePanel, scrollTerminalToBottom]);

  // ── Custom context menu for terminal ────────────────────────────────────────
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = termRef.current?.getSelection?.() || '';
    setContextMenu({ x: e.clientX, y: e.clientY, text, canCopy: Boolean(text) });
  }, []);

  const handleViewportMouseDown = useCallback(
    (event) => {
      if (shouldUseNativeRenderer) {
        onActivatePanel?.(id);
        if (nativeVteOpened) {
          Promise.resolve(focusNativeVtePanel({ panelId: id })).catch(
            handleNativeLeaseCommandError
          );
        }
        return;
      }

      const term = termRef.current;
      const shell = viewportShellRef.current;
      const cell =
        event && shell && term
          ? resolveTerminalCellFromPointer(term, shell, event.clientX, event.clientY)
          : null;
      const grokSession = isGrokSessionRef.current || isGrokTuiInitialCommand(initialCommand);
      const isKimiSession = kimiReadyNotifiedRef.current || isKimiLaunchCommand(initialCommand);
      const inputZoneRows = resolveTerminalWheelInputZoneRows({
        isGrokSession: grokSession,
        isKimiSession,
      });
      const inTranscript = cell
        ? isTerminalTranscriptCell(cell.row, term.rows, inputZoneRows)
        : lastPointerZoneRef.current !== 'input';

      if (inTranscript) {
        lastPointerZoneRef.current = 'transcript';
      } else {
        lastPointerZoneRef.current = 'input';
      }

      // Activation is handled by the parent panel shell (onMouseDown bubbles up).
      prepareActiveTuiTerminalFocus(term, {
        tuiSessionActive: tuiSessionActiveRef.current,
      });
      term?.focus?.();

      const tuiReady = grokSession
        ? grokTuiReadyRef.current === true
        : tuiSessionFooterConfirmedRef.current === true;
      const tuiActive = tuiSessionActiveRef.current || grokSession;
      if (inTranscript && cell && tuiActive && tuiReady && isVisibleInLayoutRef.current === true) {
        const payload = buildTerminalMousePressSequence(cell.col, cell.row);
        sendTerminalPasteInput({
          socket: wsRef.current,
          transport: transportRef.current,
          text: payload,
        });
      }
    },
    [
      handleNativeLeaseCommandError,
      id,
      initialCommand,
      nativeVteOpened,
      onActivatePanel,
      shouldUseNativeRenderer,
    ]
  );

  const handleCopyFromMenu = useCallback(async () => {
    await handleCopySelection();
    setContextMenu(null);
  }, [handleCopySelection]);

  const handlePasteFromMenu = useCallback(async () => {
    await handlePasteIntoTerminal().catch(() => false);
    setContextMenu(null);
  }, [handlePasteIntoTerminal]);

  const handleViewportPaste = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      void handlePasteIntoTerminal({ clipboardEvent: e }).catch(() => false);
    },
    [handlePasteIntoTerminal]
  );

  useEffect(() => {
    const handler = (e) => {
      if (isDisposingRef.current) return;
      const rootElement = terminalRootRef.current;
      const activeElement = document?.activeElement || null;
      const eventTarget = e.target instanceof Node ? e.target : null;
      const belongsToTerminal = terminalClipboardEventBelongsToPanel({
        rootElement,
        activeElement,
        eventTarget,
        isActivePanel,
      });
      if (!belongsToTerminal) return;

      e.preventDefault();
      e.stopPropagation();
      void handlePasteIntoTerminal({ clipboardEvent: e }).catch(() => false);
    };

    document.addEventListener('paste', handler, true);
    return () => document.removeEventListener('paste', handler, true);
  }, [handlePasteIntoTerminal, isActivePanel]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // Wheel: synthetic routing for shell/TUI bootstrap; live OpenCode uses xterm native SGR directly.
  useEffect(() => {
    if (shouldUseNativeRenderer) return undefined;

    const shell = viewportShellRef.current;
    if (!shell) return undefined;

    const handleWheel = (event) => {
      if (isForwardedTerminalWheelEvent(event)) return;

      const term = termRef.current;
      if (!term) return;

      if (shouldUseTerminalScrollbackWheel(event)) {
        const direction = resolveTerminalWheelScrollDirection(event.deltaY);
        if (!direction) return;
        const lines = resolveTerminalWheelPageSteps(event.deltaY) * 3;
        term.scrollLines(direction === 'up' ? -lines : lines);
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const isGrokSession = isGrokSessionRef.current || isGrokTuiInitialCommand(initialCommand);
      const isKimiSession = kimiReadyNotifiedRef.current || isKimiLaunchCommand(initialCommand);
      const isTuiSession = tuiSessionActiveRef.current || isGrokSession;

      // Kimi behaves like a normal scrolling terminal — output flows and the input is
      // inline, not a fixed-bottom pane like grok/OpenCode. So scroll the xterm
      // scrollback locally (term.scrollLines) and never inject wheel bytes into the
      // PTY: SGR/PageUp/PageDown either get ignored or captured by Kimi's prompt and
      // the conversation never moves. The near-bottom guard in scrollIfActivePanel
      // already prevents snap-back while scrolled up.
      if (shouldScrollKimiWheelLocally(isKimiSession)) {
        const direction = resolveTerminalWheelScrollDirection(event.deltaY);
        if (!direction) return;
        // Fine, shell-like scroll: ~1-2 lines per notch, capped so a fast swipe or a
        // short conversation doesn't overshoot to the top/bottom extreme.
        if (
          scrollTerminalViewport(term, direction, event.deltaY, {
            linesPerStep: 1,
            lineHeight: 60,
            maxSteps: 4,
          })
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      // Plain shells: scroll xterm scrollback locally — Page/arrow/SGR leaks as visible garbage.
      if (!shouldInjectTerminalWheelIntoPty(isTuiSession)) {
        const direction = resolveTerminalWheelScrollDirection(event.deltaY);
        if (!direction) return;
        if (scrollTerminalViewport(term, direction, event.deltaY)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      // Live grok/OpenCode: xterm forwards wheel as native SGR at the pointer row.
      // In split grids the inactive panel is blurred — inject scroll instead so small
      // worker panes can scroll without requiring maximize/focus (G-01 scroll fix).
      if (
        shouldPassthroughNativeTuiWheel({
          isGrokSession,
          isKimiSession,
          grokTuiReady: grokTuiReadyRef.current,
          kimiTuiReady: kimiReadyNotifiedRef.current,
          opencodeFooterConfirmed: tuiSessionFooterConfirmedRef.current,
        }) &&
        isActivePanelRef.current
      ) {
        forwardTerminalWheelToXterm(term, event);
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const inputZoneRows = resolveTerminalWheelInputZoneRows({ isGrokSession, isKimiSession });

      const pointerEl = resolveTerminalPointerElement(term, containerRef.current, shell);
      const cell = resolveTerminalCellFromPointer(term, pointerEl, event.clientX, event.clientY);
      if (cell) {
        lastPointerZoneRef.current = isTerminalTranscriptCell(cell.row, term.rows, inputZoneRows)
          ? 'transcript'
          : 'input';
      }

      const inTranscript = shouldRouteWheelToTranscript({
        cell,
        rows: term.rows,
        lastPointerZone: lastPointerZoneRef.current,
        inputZoneRows,
      });
      if (!inTranscript) {
        if (isTuiSession) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      const direction = resolveTerminalWheelScrollDirection(event.deltaY);
      if (!direction) return;

      const TERMINAL_WHEEL_MAX_PAGE_STEPS = 2;
      const rawSteps = resolveTerminalWheelPageSteps(event.deltaY);
      const steps = Math.max(1, Math.min(TERMINAL_WHEEL_MAX_PAGE_STEPS, rawSteps));
      let wheelCol = cell?.col ?? Math.max(0, Math.floor((term.cols || 80) / 2));
      let wheelRow = cell?.row ?? Math.max(0, Math.floor((term.rows || 24) * 0.35));

      if (isTuiSession) {
        const coords = resolveGrokWheelSgrCoords(cell, term, inputZoneRows);
        wheelCol = coords.col;
        wheelRow = coords.row;
      }

      const scrollPrefer = resolveTerminalWheelScrollPrefer(initialCommand, {
        isGrokSession,
        isKimiSession,
        tuiActive: tuiSessionActiveRef.current,
      });
      const payload = isGrokSession
        ? buildGrokWheelScrollPayload(direction, wheelCol, wheelRow, steps)
        : scrollPrefer === 'sgr'
          ? buildTerminalWheelSgrSequence(direction, wheelCol, wheelRow)
          : buildTerminalWheelScrollPayload(direction, steps, { prefer: scrollPrefer });

      const sent = sendTerminalPasteInput({
        socket: wsRef.current,
        transport: transportRef.current,
        text: payload,
      });
      if (!sent) return;

      event.preventDefault();
      event.stopPropagation();
    };

    shell.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => shell.removeEventListener('wheel', handleWheel, { capture: true });
  }, [initialCommand, nativeWheelPassthrough, shouldUseNativeRenderer]);

  // ── Keyboard shortcuts: copy/paste ───────────────────────────────────────────
  useEffect(() => {
    const handler = async (e) => {
      const key = e.key || '';
      const ctrl = e.ctrlKey || false;
      const shift = e.shiftKey || false;
      const alt = e.altKey || false;

      // Log immediately to server
      cliLog('[keydown]', `key=${key} ctrl=${ctrl} shift=${shift} alt=${alt} code=${e.code}`);

      // Check if event belongs to terminal before deciding action.
      const rootElement = terminalRootRef.current;
      const activeElement = document?.activeElement || null;
      const eventTarget = e.target instanceof Node ? e.target : null;
      const belongsToTerminal = terminalClipboardEventBelongsToPanel({
        rootElement,
        activeElement,
        eventTarget,
        isActivePanel,
      });

      // Kimi Code uses Alt+V for paste. We only intercept it when the clipboard
      // actually contains an image; otherwise we let the TUI handle its native
      // shortcut for text paste/history.
      if (alt && !ctrl && !shift && key.toLowerCase() === 'v') {
        const image = await readClipboardImage();
        if (image?.data) {
          cliLog('[keydown]', 'Alt+V clipboard image detected');
          if (!belongsToTerminal) return;
          e.preventDefault();
          e.stopPropagation();
          await handlePasteIntoTerminal({ image }).catch(() => false);
          return;
        }
      }

      // Determine action
      const action = resolveTerminalClipboardShortcut(e);

      // If we use the native VTE renderer, copy is handled natively by VTE/GTK, not JavaScript.
      if (action === 'copy' && shouldUseNativeRenderer) {
        if (belongsToTerminal) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (!action) return;

      cliLog('[keydown]', `action=${action} belongs=${belongsToTerminal}`);

      if (!belongsToTerminal) return;

      e.preventDefault();
      e.stopPropagation();

      if (action === 'paste') {
        cliLog('[keydown]', 'calling handlePasteIntoTerminal');
        await handlePasteIntoTerminal().catch(() => false);
      } else if (action === 'copy') {
        await handleCopySelection();
      }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [handleCopySelection, handlePasteIntoTerminal, isActivePanel, shouldUseNativeRenderer]);

  const isConnected = connectionState === 'connected';
  const showTerminalViewport =
    shouldShowTerminalViewport(isInitializing, initError) && !shouldUseNativeRenderer;
  const showTerminalLoadingOverlay = shouldShowTerminalLoadingOverlay(
    isInitializing,
    connectionState,
    hasConnectedOnce
  );
  const showTerminalStatusOverlay = shouldShowTerminalStatusOverlay(
    isInitializing,
    initError,
    connectionState
  );
  const exitOverlayCopy = buildTerminalExitOverlayCopy({
    initialCommand,
    reason: sessionExitReason,
    initError,
    connectionState,
  });

  const handleSessionRecoveryClick = useCallback(() => {
    if (connectionState === 'agent-exited' || isAgentTuiCommand(initialCommand)) {
      clearPanelSessionExit(id);
      setSessionExitReason(null);
      processExitedRef.current = false;
      window.dispatchEvent(
        new CustomEvent('devhub:manual-revive-requested', {
          detail: { panelId: id, sessionId: extractOpenCodeSessionId(initialCommand) || id },
        })
      );
      return;
    }
    reconnect();
  }, [connectionState, id, initialCommand, reconnect]);

  const statusLabel = isConnected
    ? 'Conectado'
    : connectionState === 'suspended'
      ? 'Suspendida'
      : connectionState === 'agent-exited'
        ? 'Agente finalizado'
        : connectionState === 'connecting'
          ? 'Conectando...'
          : connectionState === 'terminated'
            ? 'Finalizada'
            : 'Desconectado';

  return (
    <div
      ref={terminalRootRef}
      className="flex flex-col h-full w-full overflow-hidden bg-[var(--surface-app)] relative"
      style={getTerminalAppShellStyle()}
    >
      {!hideTitleBar && (
        <div
          className="devhub-drag-handle h-9 flex items-center justify-between px-3 shrink-0 border-b select-none transition-colors group/handle cursor-pointer"
          style={getTerminalTitleBarStyle()}
        >
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-gray-300 pointer-events-none">
            <svg
              className="w-4 h-4 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 17 10 11 4 5" />
              <line x1={12} y1={19} x2={20} y2={19} />
            </svg>
            <span className="text-gray-400">Terminal Integrada</span>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 opacity-60">
            {isConnected ? (
              <Wifi className="w-3 h-3 text-[#3fb950]" strokeWidth={2} />
            ) : (
              <WifiOff className="w-3 h-3 text-[#ff7b72]" strokeWidth={2} />
            )}
            <span
              className={`text-xs font-sans tracking-wide uppercase font-semibold ${isConnected ? 'text-[#3fb950]' : 'text-[#ff7b72]'}`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => adjustFontSize(-1)}
              title="Reducir tamaño de fuente"
              className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
            >
              <span className="text-[9px] font-bold text-gray-400 hover:text-white leading-none select-none">
                A-
              </span>
            </button>
            <button
              onClick={() => adjustFontSize(1)}
              title="Aumentar tamaño de fuente"
              className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
            >
              <span className="text-[11px] font-bold text-gray-400 hover:text-white leading-none select-none">
                A+
              </span>
            </button>
            <button
              onClick={reconnect}
              className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors group cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-gray-400 group-hover:text-white" strokeWidth={2} />
            </button>
            {connectionState === 'suspended' && (
              <button
                data-testid="terminal-settings-gear-btn"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('devhub:terminal-settings-modal-requested', {
                      detail: { panelId: id },
                    })
                  )
                }
                className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors group cursor-pointer"
                title="Configuración"
              >
                <svg
                  className="w-3.5 h-3.5 text-yellow-500 group-hover:text-yellow-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors group cursor-pointer"
              >
                <X
                  className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#ff7b72]"
                  strokeWidth={2}
                />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Terminal View */}
      <div
        className="flex min-h-0 flex-1 flex-col bg-[var(--surface-app)]"
        data-testid="terminal-root-body"
      >
        <div
          ref={viewportShellRef}
          className="relative flex-1 bg-[var(--surface-app)]"
          onContextMenu={handleContextMenu}
          onMouseDown={handleViewportMouseDown}
          onPaste={handleViewportPaste}
          data-testid="terminal-viewport-shell"
          style={{
            ...TERMINAL_VIEWPORT_SHELL_STYLE,
            ...getTerminalViewportFrameStyle(),
            ...(hideTitleBar ? { borderWidth: 0 } : {}),
          }}
        >
          <div
            ref={nativePlaceholderRef}
            className="relative h-full w-full overflow-hidden"
            data-testid="terminal-content-body"
            style={TERMINAL_NATIVE_CONTENT_BODY_STYLE}
          >
            {shouldUseNativeRenderer && (
              <div
                className="absolute inset-0 z-10 rounded-md bg-[var(--surface-app)]"
                data-testid="terminal-native-placeholder"
                style={getTerminalViewportFrameStyle()}
              >
                <div className="h-full w-full" aria-hidden="true" />
              </div>
            )}

            {shouldBlockTerminalViewportForWebglFallback(webglFallback) &&
            requestedRendererMode === 'xterm-webgl' &&
            operationalRendererMode === 'xterm-webgl' ? (
              <WebglErrorSection
                id={id}
                reason={webglFallback.reason}
                onSwitchToXterm={handleSwitchToXterm}
                onRetry={handleRetryProbe}
              />
            ) : (
              <motion.div
                ref={containerRef}
                className="devhub-xterm-container h-full w-full p-0"
                data-operational-renderer={operationalRendererMode}
                /* Reduced padding (was p-2.5) so TUI-drawn boxes, the bottom "Build" bar,
                   side warnings, ASCII banners and overall layout have widths, heights and
                   internal spacing much closer to a native Kali terminal.
                   Extra padding was making "las cajas de texto" and art look off. */
                {...getXtermContainerAnimProps(showTerminalViewport)}
              />
            )}
          </div>
          {/* Restored session toast */}
          {restoredToast && (
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-md border text-xs font-mono pointer-events-none"
              style={{
                background:
                  'color-mix(in oklch, var(--accent-primary) 15%, var(--surface-elevated))',
                borderColor: 'var(--accent-primary)',
                color: 'var(--accent-primary)',
              }}
            >
              ↺ Restored shell at {cwd}
            </div>
          )}

          {/* Loading overlay — first boot only; panel switches keep the live terminal interactive */}
          {showTerminalLoadingOverlay && (
            <div className="pointer-events-none absolute inset-0 bg-[var(--surface-app)]/80 flex flex-col items-center justify-center gap-3 text-xs text-gray-400 font-mono z-10 backdrop-blur-sm">
              <Loader2 className="w-6 h-6 animate-spin text-[#388bfd]" />
              {connectionState === 'connecting' ? 'Conectando...' : 'Iniciando terminal...'}
            </div>
          )}

          {/* Error/Disconnected overlay */}
          {showTerminalStatusOverlay && connectionState !== 'suspended' && (
            <div
              className="absolute inset-0 bg-[var(--surface-app)]/90 flex flex-col items-center justify-center gap-3 text-xs text-gray-400 font-mono z-[60] backdrop-blur-sm pointer-events-auto"
              data-testid={
                connectionState === 'agent-exited'
                  ? 'terminal-agent-exited-overlay'
                  : 'terminal-status-overlay'
              }
            >
              <WifiOff className="w-8 h-8 text-red-400" />
              <span className="text-red-400 font-semibold text-center px-4">
                {exitOverlayCopy.title}
              </span>
              <span className="text-gray-500 text-center max-w-sm px-4">
                {exitOverlayCopy.body}
              </span>
              <button
                onClick={handleSessionRecoveryClick}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e1e1e] border border-white/10 hover:bg-white/10 transition-colors text-gray-300"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {exitOverlayCopy.actionLabel}
              </button>
            </div>
          )}

          {/* Suspended state overlay */}
          {showTerminalStatusOverlay && connectionState === 'suspended' && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-xs text-gray-400 font-mono z-[60] backdrop-blur-sm pointer-events-auto"
              style={{ background: 'var(--surface-app)' }}
              data-testid="terminal-suspended-overlay"
            >
              <svg
                className="w-8 h-8 text-yellow-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-yellow-500 font-semibold">Sesión suspendida</span>
              <span className="text-gray-500 text-center max-w-xs">
                {extractOpenCodeSessionId(initialCommand)
                  ? `OpenCode en pausa${cwd ? ` — ${cwd}` : ''}`
                  : cwd
                    ? `Shell en pausa — ${cwd}`
                    : 'Panel en pausa — pulsá Continuar para reconectar'}
              </span>
              <button
                data-testid="terminal-suspended-continue-btn"
                onClick={() => {
                  const sessionId = extractOpenCodeSessionId(initialCommand) || id;
                  window.dispatchEvent(
                    new CustomEvent('devhub:manual-revive-requested', {
                      detail: { panelId: id, sessionId },
                    })
                  );
                }}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e1e1e] border border-white/10 hover:bg-white/10 transition-colors text-gray-300"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Continuar
              </button>
            </div>
          )}

          {/* Copy button — top-right corner */}
          {isConnected && showQuickCopyButton && (
            <button
              onClick={async () => {
                await handleCopySelection();
              }}
              className="absolute top-2 right-2 z-20 p-1.5 rounded-md border transition-colors"
              style={getTerminalFloatingControlStyle({ active: true })}
              title="Copiar selección"
            >
              <Copy className={`w-3.5 h-3.5 ${copied ? 'text-[#3fb950]' : 'text-gray-400'}`} />
            </button>
          )}

          {/* Custom context menu */}
          {contextMenu && (
            <div
              className="fixed z-50 min-w-[160px] rounded-lg border shadow-xl animate-in fade-in zoom-in-95 duration-100"
              style={{
                left: contextMenu.x,
                top: contextMenu.y,
                ...getTerminalFloatingControlStyle({ active: true }),
              }}
            >
              <button
                data-testid="terminal-context-menu-paste"
                onClick={handlePasteFromMenu}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-[#2a2a2a] transition-colors rounded-t-lg"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-gray-400" />
                Pegar
                <span className="ml-auto text-[10px] text-gray-500 font-mono">
                  Ctrl+V / Ctrl+Shift+V
                </span>
              </button>
              <div className="h-px bg-[#3a3a3a] mx-2 my-1" />
              <button
                data-testid="terminal-context-menu-copy"
                onClick={handleCopyFromMenu}
                disabled={!contextMenu.canCopy}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-[#2a2a2a] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="w-3.5 h-3.5 text-gray-400" />
                Copiar selección
                <span className="ml-auto text-[10px] text-gray-500 font-mono">Ctrl+Shift+C</span>
              </button>
              <div className="h-px bg-[#3a3a3a] mx-2 my-1" />
              <button
                onClick={() => setContextMenu(null)}
                className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-[#2a2a2a] transition-colors rounded-b-lg"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

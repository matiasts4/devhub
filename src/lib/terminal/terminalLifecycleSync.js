import { dispatchTerminalLayoutSettled } from '@/components/terminal/nativeLayoutSync';

/** Grace period after V1/V2/V3 switch — panel-group onLayout must not burst-sync all panels. */
export const WINDOW_SWITCH_PANEL_LAYOUT_SUPPRESS_MS = 320;

export function shouldSuppressPanelGroupLayoutOnWindowSwitch(nowMs, suppressUntilMs) {
  return Number.isFinite(suppressUntilMs) && nowMs < suppressUntilMs;
}

export const PANEL_LIFECYCLE_REASONS = Object.freeze({
  SWARM_LAUNCH: 'swarm-launch',
  WORKSPACE_CREATED: 'workspace-created',
  PANEL_CLOSED: 'panel-closed',
  PANEL_SPLIT: 'panel-split',
  PANEL_RELAUNCH: 'panel-relaunch',
  PANEL_FOCUS: 'panel-focus-toggle',
  PANEL_GROUP_LAYOUT: 'panel-group-layout',
  WORKSPACE_REMOVED: 'workspace-removed',
  WORKSPACE_WINDOW_SWITCH: 'workspace-window-switch',
});

/** Preset burst timings per lifecycle (docs/errores/04-terminal-lifecycle-coverage-gaps). */
export const LIFECYCLE_BURST_PHASES = Object.freeze({
  [PANEL_LIFECYCLE_REASONS.SWARM_LAUNCH]: Object.freeze({
    immediate: true,
    raf: true,
    delayMs: Object.freeze([120, 340]),
  }),
  [PANEL_LIFECYCLE_REASONS.WORKSPACE_CREATED]: Object.freeze({
    immediate: true,
    raf: true,
    delayMs: Object.freeze([]),
  }),
  [PANEL_LIFECYCLE_REASONS.PANEL_FOCUS]: Object.freeze({
    immediate: true,
    raf: true,
    delayMs: Object.freeze([120, 340]),
  }),
  [PANEL_LIFECYCLE_REASONS.PANEL_GROUP_LAYOUT]: Object.freeze({
    immediate: true,
    raf: true,
    delayMs: Object.freeze([120, 340, 500]),
  }),
  [PANEL_LIFECYCLE_REASONS.PANEL_CLOSED]: Object.freeze({
    immediate: true,
    raf: true,
    delayMs: Object.freeze([120, 340]),
  }),
  [PANEL_LIFECYCLE_REASONS.PANEL_SPLIT]: Object.freeze({
    immediate: true,
    raf: true,
    delayMs: Object.freeze([120, 340]),
  }),
  [PANEL_LIFECYCLE_REASONS.PANEL_RELAUNCH]: Object.freeze({
    immediate: true,
    raf: true,
    delayMs: Object.freeze([120]),
  }),
  [PANEL_LIFECYCLE_REASONS.WORKSPACE_REMOVED]: Object.freeze({
    immediate: true,
    raf: false,
    delayMs: Object.freeze([]),
  }),
  [PANEL_LIFECYCLE_REASONS.WORKSPACE_WINDOW_SWITCH]: Object.freeze({
    immediate: true,
    raf: true,
    delayMs: Object.freeze([80, 180, 340]),
  }),
});

const DEFAULT_PHASES = Object.freeze({
  immediate: true,
  raf: true,
  delayMs: [],
});

function noopCleanup() {}

function resolvePhases(phases) {
  if (!phases || typeof phases !== 'object') {
    return { ...DEFAULT_PHASES };
  }
  return {
    immediate: phases.immediate !== false,
    raf: phases.raf !== false,
    delayMs: Array.isArray(phases.delayMs) ? phases.delayMs : [],
  };
}

/**
 * Schedule burst layout-settled dispatches after panel lifecycle changes
 * (swarm launch, close, split, relaunch, workspace removal).
 *
 * Mirrors TerminalWorkspacesManager swarm / panel-closed viewport sync:
 * immediate dispatch, optional notifyNative, double-rAF, then optional delays.
 *
 * @returns {() => void} cleanup — cancels pending rAF and timeout passes
 */
export function scheduleTerminalLifecycleSync({
  reason,
  panelIds,
  workspaceId,
  phases,
  notifyNative,
  dispatch = dispatchTerminalLayoutSettled,
} = {}) {
  const ids = Array.isArray(panelIds) ? panelIds.filter(Boolean) : [];
  if (ids.length === 0) {
    return noopCleanup;
  }

  if (typeof globalThis === 'undefined' || globalThis.window == null) {
    return noopCleanup;
  }

  const resolvedPhases = resolvePhases(phases);
  const rafIds = [];
  const timers = [];
  let cancelled = false;

  const emitPhase = (phase) => {
    if (cancelled) return;
    dispatch({
      reason,
      workspaceId,
      panelIds: ids,
      phase,
    });
  };

  if (resolvedPhases.immediate) {
    emitPhase('immediate');
  }

  if (typeof notifyNative === 'function') {
    notifyNative(reason);
  }

  const raf = globalThis.requestAnimationFrame;
  if (resolvedPhases.raf && typeof raf === 'function') {
    const outerRafId = raf(() => {
      if (cancelled) return;
      const innerRafId = raf(() => {
        if (!cancelled) emitPhase('raf');
      });
      rafIds.push(innerRafId);
    });
    rafIds.push(outerRafId);
  }

  for (const delayMs of resolvedPhases.delayMs) {
    if (typeof delayMs !== 'number' || delayMs < 0) continue;
    const timerId = globalThis.setTimeout(() => {
      if (!cancelled) emitPhase(`delay-${delayMs}`);
    }, delayMs);
    timers.push(timerId);
  }

  return () => {
    cancelled = true;
    const cancelRaf = globalThis.cancelAnimationFrame;
    if (typeof cancelRaf === 'function') {
      rafIds.forEach((id) => cancelRaf(id));
    }
    timers.forEach((id) => globalThis.clearTimeout(id));
  };
}

const SWARM_PROJECTION_READY_DELAYS_MS = Object.freeze([180, 340, 500]);

/**
 * Post-mount burst for swarm panels — forces shared-surface projection-ready
 * dispatches so V-01 black panels recover after N portals mount at once.
 *
 * @returns {() => void} cleanup
 */
export function scheduleSwarmProjectionReadyBurst({
  panelIds,
  workspaceId,
  dispatch = dispatchTerminalLayoutSettled,
} = {}) {
  const ids = Array.isArray(panelIds) ? panelIds.filter(Boolean) : [];
  if (ids.length === 0) {
    return noopCleanup;
  }

  if (typeof globalThis === 'undefined' || globalThis.window == null) {
    return noopCleanup;
  }

  let cancelled = false;
  const rafIds = [];
  const timers = [];

  const emit = (reason, phase) => {
    if (cancelled) return;
    dispatch({
      reason,
      workspaceId,
      panelIds: ids,
      phase,
    });
  };

  emit('shared-surface-projection-ready', 'immediate');

  const raf = globalThis.requestAnimationFrame;
  if (typeof raf === 'function') {
    const outerRafId = raf(() => {
      if (cancelled) return;
      const innerRafId = raf(() => {
        if (!cancelled) emit('shared-surface-projection-ready-raf', 'raf');
      });
      rafIds.push(innerRafId);
    });
    rafIds.push(outerRafId);
  }

  for (const delayMs of SWARM_PROJECTION_READY_DELAYS_MS) {
    const timerId = globalThis.setTimeout(() => {
      if (!cancelled) emit('shared-surface-projection-ready-delay', `delay-${delayMs}`);
    }, delayMs);
    timers.push(timerId);
  }

  return () => {
    cancelled = true;
    const cancelRaf = globalThis.cancelAnimationFrame;
    if (typeof cancelRaf === 'function') {
      rafIds.forEach((id) => cancelRaf(id));
    }
    timers.forEach((id) => globalThis.clearTimeout(id));
  };
}

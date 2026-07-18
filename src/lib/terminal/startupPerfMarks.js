/**
 * Named performance marks for app → Terminales interactive.
 * Enable with localStorage.devhub_perf=1 (or always in non-production unless explicitly off).
 */

const PREFIX = 'dh:';

const MARKS = Object.freeze({
  APP_SHELL_START: `${PREFIX}app-shell-start`,
  PROJECT_READY: `${PREFIX}project-ready`,
  TERMINAL_NAV_INTENT: `${PREFIX}terminal-nav-intent`,
  TERMINAL_ROUTE_ENTER: `${PREFIX}terminal-route-enter`,
  TWM_MOUNT: `${PREFIX}twm-mount`,
  HEAVY_SURFACES_READY: `${PREFIX}heavy-surfaces-ready`,
  XTERM_CORE_IMPORT_START: `${PREFIX}xterm-core-import-start`,
  XTERM_CORE_IMPORT_DONE: `${PREFIX}xterm-core-import-done`,
  FIRST_PANEL_INTERACTIVE: `${PREFIX}first-panel-interactive`,
  CONNECT_START: `${PREFIX}connect-start`,
  SESSION_API_OK: `${PREFIX}session-api-ok`,
  WS_CONNECTED: `${PREFIX}ws-connected`,
  FIRST_PTY_BYTE: `${PREFIX}first-pty-byte`,
  SIDECAR_WARM_READY: `${PREFIX}sidecar-warm-ready`,
  WARM_TIER_START: `${PREFIX}warm-tier-start`,
  WARM_TIER_DONE: `${PREFIX}warm-tier-done`,
});

const MEASURES = Object.freeze({
  PROJECT_TO_TERMINAL_ROUTE: `${PREFIX}project-ready→terminal-route`,
  PROJECT_TO_NAV_INTENT: `${PREFIX}project-ready→nav-intent`,
  NAV_INTENT_TO_ROUTE: `${PREFIX}nav-intent→terminal-route`,
  TERMINAL_ROUTE_TO_INTERACTIVE: `${PREFIX}terminal-route→first-panel-interactive`,
  TERMINAL_ROUTE_TO_FIRST_BYTE: `${PREFIX}terminal-route→first-pty-byte`,
  XTERM_CORE_IMPORT: `${PREFIX}xterm-core-import`,
  INTERACTIVE_TO_CONNECT_START: `${PREFIX}interactive→connect-start`,
  CONNECT_TO_SESSION_API: `${PREFIX}connect-start→session-api`,
  SESSION_API_TO_WS: `${PREFIX}session-api→ws-connected`,
  WS_TO_FIRST_BYTE: `${PREFIX}ws-connected→first-pty-byte`,
  INTERACTIVE_TO_CONNECTED: `${PREFIX}interactive→ws-connected`,
  INTERACTIVE_TO_FIRST_BYTE: `${PREFIX}interactive→first-pty-byte`,
  CONNECT_TOTAL: `${PREFIX}connect-start→ws-connected`,
  WARM_DURATION: `${PREFIX}warm-duration`,
});

let firstPanelInteractiveRecorded = false;
let wsConnectedRecorded = false;
let firstPtyByteRecorded = false;
let sidecarWarmReadyRecorded = false;
const onceMarks = {
  appShell: false,
  projectReady: false,
  terminalRoute: false,
  twmMount: false,
  heavySurfaces: false,
  xtermCoreImport: false,
  navIntent: false,
  connectStart: false,
  sessionApiOk: false,
};

/** @type {{ name: string, startTime: number }[]} */
const localMarks = [];
/** @type {{ name: string, duration: number, startTime: number }[]} */
const localMeasures = [];

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function hasPerformanceApi() {
  return (
    typeof performance !== 'undefined' &&
    typeof performance.mark === 'function' &&
    typeof performance.measure === 'function'
  );
}

export function isStartupPerfEnabled(
  storage = typeof globalThis !== 'undefined' && globalThis.localStorage
    ? globalThis.localStorage
    : null
) {
  try {
    const flag = storage?.getItem?.('devhub_perf');
    if (flag === '0' || flag === 'off') return false;
    if (flag === '1' || flag === 'on') return true;
  } catch {
    /* ignore */
  }
  return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
}

export function mark(name, { force = false } = {}) {
  if (!force && !isStartupPerfEnabled()) return;
  if (!name) return;
  const startTime = nowMs();
  localMarks.push({ name, startTime });
  if (!hasPerformanceApi()) return;
  try {
    performance.mark(name);
  } catch {
    /* ignore */
  }
}

export function measure(name, startMark, endMark, { force = false } = {}) {
  if (!force && !isStartupPerfEnabled()) return null;
  if (!name || !startMark || !endMark) return null;

  const start = [...localMarks].reverse().find((m) => m.name === startMark);
  const end = [...localMarks].reverse().find((m) => m.name === endMark);
  let duration = null;
  if (start && end) {
    duration = Math.max(0, end.startTime - start.startTime);
    localMeasures.push({ name, duration, startTime: start.startTime });
  }

  if (hasPerformanceApi()) {
    try {
      const entry = performance.measure(name, startMark, endMark);
      duration = entry?.duration ?? duration;
    } catch {
      /* timeline may be incomplete in jsdom */
    }
  }
  return duration;
}

export function markAppShellStart() {
  if (onceMarks.appShell) return;
  onceMarks.appShell = true;
  mark(MARKS.APP_SHELL_START);
}

export function markProjectReady() {
  if (onceMarks.projectReady) return;
  onceMarks.projectReady = true;
  mark(MARKS.PROJECT_READY);
}

export function markTerminalNavIntent() {
  if (onceMarks.navIntent) return;
  onceMarks.navIntent = true;
  mark(MARKS.TERMINAL_NAV_INTENT);
  measure(MEASURES.PROJECT_TO_NAV_INTENT, MARKS.PROJECT_READY, MARKS.TERMINAL_NAV_INTENT);
}

export function markTerminalRouteEnter() {
  if (onceMarks.terminalRoute) return;
  onceMarks.terminalRoute = true;
  mark(MARKS.TERMINAL_ROUTE_ENTER);
  measure(MEASURES.PROJECT_TO_TERMINAL_ROUTE, MARKS.PROJECT_READY, MARKS.TERMINAL_ROUTE_ENTER);
  measure(MEASURES.NAV_INTENT_TO_ROUTE, MARKS.TERMINAL_NAV_INTENT, MARKS.TERMINAL_ROUTE_ENTER);
}

export function markTwmMount() {
  if (onceMarks.twmMount) return;
  onceMarks.twmMount = true;
  mark(MARKS.TWM_MOUNT);
}

export function markHeavySurfacesReady() {
  if (onceMarks.heavySurfaces) return;
  onceMarks.heavySurfaces = true;
  mark(MARKS.HEAVY_SURFACES_READY);
}

export function markXtermCoreImportStart() {
  if (onceMarks.xtermCoreImport) return;
  mark(MARKS.XTERM_CORE_IMPORT_START);
}

export function markXtermCoreImportDone() {
  if (onceMarks.xtermCoreImport) return;
  onceMarks.xtermCoreImport = true;
  mark(MARKS.XTERM_CORE_IMPORT_DONE);
  measure(MEASURES.XTERM_CORE_IMPORT, MARKS.XTERM_CORE_IMPORT_START, MARKS.XTERM_CORE_IMPORT_DONE);
}

export function buildStartupPerfReport(reason) {
  const { measures, marks } = getPerfSnapshot();
  const byName = Object.fromEntries(measures.map((m) => [m.name, Math.round(m.duration)]));
  const summary = {
    projectToTerminalesMs: byName[MEASURES.PROJECT_TO_TERMINAL_ROUTE] ?? null,
    projectToNavIntentMs: byName[MEASURES.PROJECT_TO_NAV_INTENT] ?? null,
    navIntentToRouteMs: byName[MEASURES.NAV_INTENT_TO_ROUTE] ?? null,
    terminalesToPanelInteractiveMs: byName[MEASURES.TERMINAL_ROUTE_TO_INTERACTIVE] ?? null,
    xtermCoreImportMs: byName[MEASURES.XTERM_CORE_IMPORT] ?? null,
    // "Conectando" breakdown (fit gate + session API + WebSocket)
    interactiveToConnectStartMs: byName[MEASURES.INTERACTIVE_TO_CONNECT_START] ?? null,
    connectToSessionApiMs: byName[MEASURES.CONNECT_TO_SESSION_API] ?? null,
    sessionApiToWsMs: byName[MEASURES.SESSION_API_TO_WS] ?? null,
    interactiveToConnectedMs: byName[MEASURES.INTERACTIVE_TO_CONNECTED] ?? null,
    connectTotalMs: byName[MEASURES.CONNECT_TOTAL] ?? null,
    warmDurationMs: byName[MEASURES.WARM_DURATION] ?? null,
    terminalesToFirstByteMs: byName[MEASURES.TERMINAL_ROUTE_TO_FIRST_BYTE] ?? null,
    wsToFirstByteMs: byName[MEASURES.WS_TO_FIRST_BYTE] ?? null,
    interactiveToFirstByteMs: byName[MEASURES.INTERACTIVE_TO_FIRST_BYTE] ?? null,
  };
  return {
    reason: reason || 'snapshot',
    summary,
    marks: marks.map((m) => ({ name: m.name, startTime: Math.round(m.startTime) })),
    measures: measures.map((m) => ({
      name: m.name,
      durationMs: Math.round(m.duration),
      startTime: Math.round(m.startTime),
    })),
    meta: {
      href:
        typeof globalThis !== 'undefined' && globalThis.location ? globalThis.location.href : null,
      userAgent:
        typeof globalThis !== 'undefined' && globalThis.navigator
          ? globalThis.navigator.userAgent
          : null,
      // Fast Refresh spam invalidates wall-clock marks — operator should cold-open.
      note: 'Tell the agent: revisá (reads data/logs/startup-perf/latest.json)',
      ...readNavigationMeta(),
    },
  };
}

function readNavigationMeta() {
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    if (!nav) return { navigationType: null, likelyWarm: null };
    // "reload" / "navigate" with transferSize 0 often means bfcache/warm disk cache.
    const transferSize = typeof nav.transferSize === 'number' ? nav.transferSize : null;
    const navigationType = nav.type || null;
    const likelyWarm =
      navigationType === 'back_forward' || (transferSize === 0 && navigationType === 'reload');
    return { navigationType, transferSize, likelyWarm };
  } catch {
    return { navigationType: null, likelyWarm: null };
  }
}

/** Persist snapshot for agent review (POST → data/logs/startup-perf/latest.json). */
export function persistStartupPerfSnapshot(reason, { fetchImpl } = {}) {
  if (!isStartupPerfEnabled()) return null;
  const report = buildStartupPerfReport(reason);
  const fetchFn = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  if (!fetchFn) return report;
  try {
    void fetchFn('/api/terminal/perf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never break terminal boot on telemetry */
  }
  return report;
}

function logStartupPerfSummary(reason) {
  if (!isStartupPerfEnabled()) return;
  const report = persistStartupPerfSnapshot(reason);
  if (!report) return;

  console.info('[devhub-perf]', reason, {
    'project→terminales (ms)': report.summary.projectToTerminalesMs,
    'project→nav intent (ms)': report.summary.projectToNavIntentMs,
    'nav intent→route (ms)': report.summary.navIntentToRouteMs,
    'terminales→panel interactive (ms)': report.summary.terminalesToPanelInteractiveMs,
    'xterm core import (ms)': report.summary.xtermCoreImportMs,
    'interactive→connect start (ms)': report.summary.interactiveToConnectStartMs,
    'connect→session API (ms)': report.summary.connectToSessionApiMs,
    'session API→ws (ms)': report.summary.sessionApiToWsMs,
    'interactive→connected (ms)': report.summary.interactiveToConnectedMs,
    'connect total (ms)': report.summary.connectTotalMs,
    'warm duration (ms)': report.summary.warmDurationMs,
    'terminales→first pty byte (ms)': report.summary.terminalesToFirstByteMs,
    'ws→first pty byte (ms)': report.summary.wsToFirstByteMs,
    'interactive→first pty byte (ms)': report.summary.interactiveToFirstByteMs,
    marks: report.marks.map((m) => m.name),
    file: 'data/logs/startup-perf/latest.json',
    tip: 'Decime «revisá» — el agente lee ese archivo',
  });
}

export function markConnectStart() {
  if (onceMarks.connectStart) return;
  onceMarks.connectStart = true;
  mark(MARKS.CONNECT_START);
  measure(
    MEASURES.INTERACTIVE_TO_CONNECT_START,
    MARKS.FIRST_PANEL_INTERACTIVE,
    MARKS.CONNECT_START
  );
}

export function markSessionApiOk() {
  if (onceMarks.sessionApiOk) return;
  onceMarks.sessionApiOk = true;
  mark(MARKS.SESSION_API_OK);
  measure(MEASURES.CONNECT_TO_SESSION_API, MARKS.CONNECT_START, MARKS.SESSION_API_OK);
}

export function markWsConnected() {
  if (wsConnectedRecorded) return;
  wsConnectedRecorded = true;
  mark(MARKS.WS_CONNECTED);
  measure(MEASURES.SESSION_API_TO_WS, MARKS.SESSION_API_OK, MARKS.WS_CONNECTED);
  measure(MEASURES.CONNECT_TOTAL, MARKS.CONNECT_START, MARKS.WS_CONNECTED);
  measure(MEASURES.INTERACTIVE_TO_CONNECTED, MARKS.FIRST_PANEL_INTERACTIVE, MARKS.WS_CONNECTED);
  logStartupPerfSummary('ws-connected');
}

export function markFirstPanelInteractive() {
  if (firstPanelInteractiveRecorded) return;
  firstPanelInteractiveRecorded = true;
  mark(MARKS.FIRST_PANEL_INTERACTIVE);
  measure(
    MEASURES.TERMINAL_ROUTE_TO_INTERACTIVE,
    MARKS.TERMINAL_ROUTE_ENTER,
    MARKS.FIRST_PANEL_INTERACTIVE
  );
  logStartupPerfSummary('first-panel-interactive');
}

export function markWarmTierStart() {
  mark(MARKS.WARM_TIER_START);
}

export function markWarmTierDone() {
  mark(MARKS.WARM_TIER_DONE);
  measure(MEASURES.WARM_DURATION, MARKS.WARM_TIER_START, MARKS.WARM_TIER_DONE);
  logStartupPerfSummary('warm-done');
}

/** Sidecar/session endpoint cached and ready for WS connect (prod hot path). */
export function markSidecarWarmReady() {
  if (sidecarWarmReadyRecorded) return;
  sidecarWarmReadyRecorded = true;
  mark(MARKS.SIDECAR_WARM_READY);
}

/**
 * First PTY payload painted into xterm — cold-path success criterion.
 * Call once from the session onmessage/output path.
 */
export function markFirstPtyByte() {
  if (firstPtyByteRecorded) return;
  firstPtyByteRecorded = true;
  mark(MARKS.FIRST_PTY_BYTE);
  measure(MEASURES.TERMINAL_ROUTE_TO_FIRST_BYTE, MARKS.TERMINAL_ROUTE_ENTER, MARKS.FIRST_PTY_BYTE);
  measure(MEASURES.WS_TO_FIRST_BYTE, MARKS.WS_CONNECTED, MARKS.FIRST_PTY_BYTE);
  measure(MEASURES.INTERACTIVE_TO_FIRST_BYTE, MARKS.FIRST_PANEL_INTERACTIVE, MARKS.FIRST_PTY_BYTE);
  logStartupPerfSummary('first-pty-byte');
}

export function getPerfSnapshot() {
  const marks = localMarks.slice();
  const measures = localMeasures.slice();
  if (hasPerformanceApi()) {
    try {
      for (const e of performance.getEntriesByType('mark') || []) {
        if (String(e.name).startsWith(PREFIX) && !marks.some((m) => m.name === e.name)) {
          marks.push({ name: e.name, startTime: e.startTime });
        }
      }
      for (const e of performance.getEntriesByType('measure') || []) {
        if (String(e.name).startsWith(PREFIX) && !measures.some((m) => m.name === e.name)) {
          measures.push({ name: e.name, duration: e.duration, startTime: e.startTime });
        }
      }
    } catch {
      /* ignore */
    }
  }
  return { marks, measures };
}

export function resetStartupPerfForTests() {
  firstPanelInteractiveRecorded = false;
  wsConnectedRecorded = false;
  firstPtyByteRecorded = false;
  sidecarWarmReadyRecorded = false;
  onceMarks.appShell = false;
  onceMarks.projectReady = false;
  onceMarks.terminalRoute = false;
  onceMarks.twmMount = false;
  onceMarks.heavySurfaces = false;
  onceMarks.xtermCoreImport = false;
  onceMarks.navIntent = false;
  onceMarks.connectStart = false;
  onceMarks.sessionApiOk = false;
  localMarks.length = 0;
  localMeasures.length = 0;
  if (!hasPerformanceApi()) return;
  try {
    performance.clearMarks?.();
    performance.clearMeasures?.();
  } catch {
    /* ignore */
  }
}

export function exposePerfSnapshotOnWindow() {
  if (typeof globalThis === 'undefined' || !globalThis.window || !isStartupPerfEnabled()) return;
  globalThis.window.__DEVHUB_PERF__ = {
    getSnapshot: getPerfSnapshot,
    buildReport: buildStartupPerfReport,
    flush: (reason = 'manual-flush') => persistStartupPerfSnapshot(reason),
    marks: MARKS,
    measures: MEASURES,
    latestPath: 'data/logs/startup-perf/latest.json',
  };
}

export { MARKS as STARTUP_PERF_MARKS, MEASURES as STARTUP_PERF_MEASURES };

/**
 * Tiered terminal warm-up after project ready.
 * Tier1: sidecar ensure (HTTP), Tier2: state prefetch, Tier3: soft-mount dormant TWM.
 * Kill-switch: localStorage.devhub_terminal_warm=off
 *
 * Sidecar warm is hard-capped — a hung/503 Next compile must not block soft-mount
 * or inflate cold Terminales marks (seen ~24s warm in HMR-contaminated runs).
 */

import { markWarmTierDone, markWarmTierStart } from '@/lib/terminal/startupPerfMarks';

import {
  coalesceTerminalEndpointFetch,
  peekTerminalEndpoint,
  rememberTerminalEndpoint,
} from '@/lib/terminal/terminalEndpointCache';

export const WARM_KILL_SWITCH_KEY = 'devhub_terminal_warm';
/** UI budget for warm-done mark — does not abort the background GET. */
export const SIDECAR_WARM_TIMEOUT_MS = 2000;
/** Allow Turbopack cold compile of /api/terminal/session (~6s observed). */
export const SIDECAR_WARM_FETCH_TIMEOUT_MS = 15000;

/**
 * Linux WebKitGTK (Tauri) is the fragile offscreen-GPU surface — Tier3 off by default.
 * WebView2 (Windows) has Chrome/Edg in UA.
 */
export function isLikelyWebKitGtk(userAgent = '') {
  const ua = String(userAgent || '');
  const isLinux = /Linux/i.test(ua) && !/Android/i.test(ua);
  const isChromium = /Chrome\//i.test(ua) || /Edg\//i.test(ua) || /Chromium\//i.test(ua);
  return isLinux && !isChromium;
}

export function readWarmKillSwitch(storage) {
  try {
    return storage?.getItem?.(WARM_KILL_SWITCH_KEY) === 'off';
  } catch {
    return false;
  }
}

/**
 * @param {{ platformUa?: string, flags?: { warmOff?: boolean, tier3?: boolean, tier4?: boolean }, storage?: Storage|null }} opts
 */
export function resolveWarmTiers({
  platformUa = typeof globalThis !== 'undefined' && globalThis.navigator
    ? globalThis.navigator.userAgent
    : '',
  flags = {},
  storage = typeof globalThis !== 'undefined' && globalThis.localStorage
    ? globalThis.localStorage
    : null,
} = {}) {
  const warmOff = flags.warmOff === true || readWarmKillSwitch(storage);
  if (warmOff) {
    return { tier1: false, tier2: false, tier3: false, tier4: false, warmOff: true };
  }

  const webkitGtk = isLikelyWebKitGtk(platformUa);
  const tier3Default = !webkitGtk;
  const tier3 = typeof flags.tier3 === 'boolean' ? flags.tier3 : tier3Default;
  const tier4 = flags.tier4 === true;

  return {
    tier1: true,
    tier2: true,
    tier3,
    tier4,
    warmOff: false,
    webkitGtk,
  };
}

function scheduleIdle(fn) {
  const ric = typeof globalThis !== 'undefined' ? globalThis.requestIdleCallback : null;
  const cic = typeof globalThis !== 'undefined' ? globalThis.cancelIdleCallback : null;
  if (typeof ric === 'function') {
    const id = ric(() => fn(), { timeout: 2500 });
    return () => {
      if (typeof cic === 'function') cic(id);
    };
  }
  const t = setTimeout(fn, 0);
  return () => clearTimeout(t);
}

export function withTimeout(promise, ms, label = 'warm') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Order: soft-mount + state first (cheap), then sidecar∥xterm with sidecar timeout.
 * @param {object} opts
 */
export function scheduleTerminalWarm({
  projectId,
  cwd,
  tiers,
  warmSidecar,
  prefetchState,
  prefetchXtermModules,
  softMountTerminalManager,
  resolveTiers = resolveWarmTiers,
} = {}) {
  let cancelled = false;
  const resolved = tiers || resolveTiers();

  if (!projectId || resolved.warmOff || (!resolved.tier1 && !resolved.tier2 && !resolved.tier3)) {
    return { cancel: () => {}, tiers: resolved };
  }

  const cancelIdle = scheduleIdle(async () => {
    if (cancelled) return;
    markWarmTierStart();
    if (typeof console !== 'undefined') {
      console.info('[terminal-warm] start', {
        projectId,
        cwd: cwd || null,
        tiers: {
          tier1: resolved.tier1,
          tier2: resolved.tier2,
          tier3: resolved.tier3,
        },
      });
    }
    try {
      // Tier3 / Tier2 first — do not wait on network.
      if (resolved.tier3 && typeof softMountTerminalManager === 'function') {
        if (cancelled) return;
        softMountTerminalManager();
      }
      if (resolved.tier2 && typeof prefetchState === 'function') {
        if (cancelled) return;
        await prefetchState({ projectId });
      }

      // xterm + sidecar warm are fire-and-forget. Awaiting sidecar aborted the GET
      // at 2s while the real session compile takes ~6s — panel then paid again.
      if (resolved.tier1 && typeof prefetchXtermModules === 'function') {
        void Promise.resolve()
          .then(() => prefetchXtermModules())
          .catch((err) => {
            if (typeof console !== 'undefined') {
              console.warn('[terminal-warm] xterm prefetch', err?.message || err);
            }
          });
      }
      if (resolved.tier1 && typeof warmSidecar === 'function' && !cancelled) {
        void Promise.resolve()
          .then(() => warmSidecar({ projectId, cwd }))
          .then((endpoint) => {
            if (endpoint?.port && endpoint?.wsPath) {
              rememberTerminalEndpoint({ ...endpoint, cwd });
              if (typeof console !== 'undefined') {
                console.info('[terminal-warm] sidecar ready', {
                  port: endpoint.port,
                  wsPath: endpoint.wsPath,
                });
              }
            }
          })
          .catch((err) => {
            if (typeof console !== 'undefined') {
              console.warn('[terminal-warm] sidecar', err?.message || err);
            }
          });
      }
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.warn('[terminal-warm]', err?.message || err);
      }
    } finally {
      if (!cancelled) markWarmTierDone();
    }
  });

  return {
    cancel: () => {
      cancelled = true;
      cancelIdle();
    },
    tiers: resolved,
  };
}

/**
 * Client warm / connect: GET session endpoint (coalesced + cached).
 * Uses a long fetch timeout so Turbopack can finish; callers must not treat
 * SIDECAR_WARM_TIMEOUT_MS as an abort signal for this work.
 */
export async function warmTtySidecarViaApi({
  cwd,
  fetchImpl = fetch,
  timeoutMs = SIDECAR_WARM_FETCH_TIMEOUT_MS,
} = {}) {
  const cached = peekTerminalEndpoint({ cwd });
  if (cached) return cached;

  return coalesceTerminalEndpointFetch(async () => {
    const params = new URLSearchParams();
    if (cwd) params.set('cwd', cwd);
    const qs = params.toString();
    const url = qs ? `/api/terminal/session?${qs}` : '/api/terminal/session';

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer =
      controller && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller?.signal,
      });
      if (!res.ok) {
        throw new Error(`tty warm failed: ${res.status}`);
      }
      const data = await res.json().catch(() => ({}));
      if (data?.port && data?.wsPath) {
        rememberTerminalEndpoint({ ...data, cwd });
      }
      return data;
    } finally {
      if (timer) clearTimeout(timer);
    }
  });
}

/** Prefetch @xterm modules without opening a terminal. */
export async function prefetchXtermRendererModules() {
  await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
    import('@xterm/addon-search'),
  ]);
  try {
    await import('@xterm/addon-webgl');
  } catch {
    /* optional */
  }
}

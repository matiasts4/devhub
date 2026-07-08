'use client';

import { useEffect } from 'react';
import { buildPreviewDiagnosticDedupeKey } from '@/lib/browserPreviewDiagnostics';

const ENDPOINT = '/api/client-log';
const DEVHUB_PREFIX = '[devhub]';
const DIAGNOSTIC_DEDUPE_WINDOW_MS = 2000;

function baseMeta() {
  return {
    href: typeof window !== 'undefined' ? window.location.href : null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  };
}

function send(level, message, details, source) {
  // Fire-and-forget; never throw
  try {
    const body = {
      level,
      message,
      ts: Date.now(),
      ...baseMeta(),
    };
    if (details !== undefined) body.details = details;
    if (source) body.source = source;
    navigator.sendBeacon?.(
      ENDPOINT,
      new Blob([JSON.stringify(body)], { type: 'application/json' })
    ) ||
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
  } catch {
    // silently ignore if sendBeacon/fetch is unavailable
  }
}

function isNoiseMessage(message) {
  const m = String(message || '');
  // Harmless browser warning; floods crash logs and masks real issues.
  if (/ResizeObserver loop/i.test(m)) return true;
  // xterm dispose races (dimensions + handleResize IdleTaskQueue) — neutralized
  // in TerminalTTY; do not surface as app-killing crash noise.
  if (
    /Cannot read properties of undefined \(reading '(dimensions|handleResize)'\)/i.test(m) ||
    /undefined is not an object \(evaluating '.*(dimensions|handleResize)/i.test(m)
  ) {
    return true;
  }
  return false;
}

/**
 * Mounts global error collectors and intercepts console.warn/error lines that
 * start with the [devhub] prefix so they are appended to data/logs/browser.log
 * (and crash.log / crash-dumps for real failures).
 */
export function useClientErrorLogger() {
  useEffect(() => {
    const recentDiagnostics = new Map();

    function shouldSendDiagnostic(message, details, source) {
      if (source) return true;
      const payload = Array.isArray(details) ? details[0] : details;
      const key = buildPreviewDiagnosticDedupeKey({
        source: 'browser-preview',
        event: message.replace(/^\[devhub\]\[(?:visual-edit|preview-proxy)\]\s*/, ''),
        reason: payload?.reason || null,
        reasonCategory: payload?.reasonCategory || null,
        supportMode: payload?.supportMode || null,
        details: payload || {},
      });
      if (!key || key === '{}') return true;

      const now = Date.now();
      const previousTs = recentDiagnostics.get(key);
      recentDiagnostics.set(key, now);

      if (previousTs && now - previousTs < DIAGNOSTIC_DEDUPE_WINDOW_MS) {
        return false;
      }

      for (const [entryKey, entryTs] of recentDiagnostics.entries()) {
        if (now - entryTs >= DIAGNOSTIC_DEDUPE_WINDOW_MS) {
          recentDiagnostics.delete(entryKey);
        }
      }

      return true;
    }

    // ── console.warn / console.error interception ──────────────────────────
    const originalWarn = console.warn;
    const originalError = console.error;

    function interceptConsole(level, originalFn, args) {
      originalFn.apply(console, args);
      try {
        const first = String(args[0] ?? '');
        if (!first.startsWith(DEVHUB_PREFIX)) return;
        const details = args.length > 1 ? args.slice(1) : undefined;
        const message = first.replace(/\s+\([^)]+:\d+:\d+\)$/, '');
        if (!shouldSendDiagnostic(message, details?.length === 1 ? details[0] : details)) {
          return;
        }
        send(level, message, details?.length === 1 ? details[0] : details);
      } catch {
        // never let the interceptor crash the page
      }
    }

    console.warn = (...args) => interceptConsole('warn', originalWarn, args);
    console.error = (...args) => interceptConsole('error', originalError, args);

    // ── window.onerror ─────────────────────────────────────────────────────
    const prevOnError = window.onerror;
    window.onerror = function (message, source, lineno, colno, error) {
      const msg = String(message);
      if (isNoiseMessage(msg)) {
        // Still record soft evidence so pizarra/terminal races stay visible in
        // browser.log — without crash-dump flood or treating as app-killing.
        send('warn', msg, { source, lineno, colno, stack: error?.stack }, 'xterm-stale-noise');
        // true = "handled": suppress default browser error UI when possible.
        prevOnError?.apply(this, arguments);
        return true;
      }
      const isChunk =
        /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i.test(msg) ||
        /Loading CSS chunk/i.test(msg);
      send(
        'error',
        msg,
        { source, lineno, colno, stack: error?.stack },
        isChunk ? 'chunk-load' : 'window.onerror'
      );
      return prevOnError?.apply(this, arguments) ?? false;
    };

    // ── unhandledrejection ─────────────────────────────────────────────────
    function handleRejection(event) {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message : String(reason ?? 'unhandled promise rejection');
      if (isNoiseMessage(message)) return;
      // Tauri unlisten race during fast remounts — log but tag softly
      const source =
        /handlerId/i.test(message) && /tauri/i.test(String(reason?.stack || ''))
          ? 'tauri-unlisten'
          : 'unhandledrejection';
      send('error', message, { stack: reason?.stack }, source);
    }
    window.addEventListener('unhandledrejection', handleRejection);

    // ── Resource load failures (CSS/JS) → "plain HTML" symptom ─────────────
    function handleResourceError(event) {
      const target = event?.target;
      if (!target || target === window) return;
      const tag = String(target.tagName || '').toLowerCase();
      if (tag !== 'link' && tag !== 'script' && tag !== 'img') return;
      const href = target.href || target.src || null;
      // Only care about stylesheets and app scripts (plain HTML look = CSS gone)
      const isStylesheet =
        tag === 'link' && (target.rel === 'stylesheet' || String(href || '').includes('.css'));
      const isScript = tag === 'script';
      if (!isStylesheet && !isScript) return;
      send(
        'error',
        isStylesheet ? `Failed to load stylesheet: ${href}` : `Failed to load script: ${href}`,
        { tag, href, rel: target.rel || null },
        'resource-error'
      );
    }
    // capture phase required for resource errors
    window.addEventListener('error', handleResourceError, true);

    return () => {
      console.warn = originalWarn;
      console.error = originalError;
      window.onerror = prevOnError;
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleResourceError, true);
    };
  }, []);
}

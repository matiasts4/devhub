'use client';

import { useEffect } from 'react';
import { buildPreviewDiagnosticDedupeKey } from '@/lib/browserPreviewDiagnostics';

const ENDPOINT = '/api/client-log';
const DEVHUB_PREFIX = '[devhub]';
const DIAGNOSTIC_DEDUPE_WINDOW_MS = 2000;

function send(level, message, details, source) {
  // Fire-and-forget; never throw
  try {
    const body = { level, message, ts: Date.now() };
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

/**
 * Mounts global error collectors and intercepts console.warn/error lines that
 * start with the [devhub] prefix so they are appended to data/logs/browser.log.
 *
 * This is intentionally kept lightweight: no throttling beyond what the server
 * imposes. Each line logged in production is useful signal.
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
        // args[0] is the message template, rest are details objects
        const details = args.length > 1 ? args.slice(1) : undefined;
        // Strip the source location suffix "(file.jsx:37:11)" injected by the browser
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
      send(
        'error',
        String(message),
        { source, lineno, colno, stack: error?.stack },
        'window.onerror'
      );
      return prevOnError?.apply(this, arguments) ?? false;
    };

    // ── unhandledrejection ─────────────────────────────────────────────────
    function handleRejection(event) {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message : String(reason ?? 'unhandled promise rejection');
      send('error', message, { stack: reason?.stack }, 'unhandledrejection');
    }
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      console.warn = originalWarn;
      console.error = originalError;
      window.onerror = prevOnError;
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);
}

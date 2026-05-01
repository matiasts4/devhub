'use client';

import { useEffect } from 'react';

const ENDPOINT = '/api/client-log';
const DEVHUB_PREFIX = '[devhub]';

function send(level, message, details, source) {
  // Fire-and-forget; never throw
  try {
    const body = { level, message, ts: Date.now() };
    if (details !== undefined) body.details = details;
    if (source) body.source = source;
    navigator.sendBeacon?.(ENDPOINT, new Blob([JSON.stringify(body)], { type: 'application/json' })) ||
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
      send('error', String(message), { source, lineno, colno, stack: error?.stack }, 'window.onerror');
      return prevOnError?.apply(this, arguments) ?? false;
    };

    // ── unhandledrejection ─────────────────────────────────────────────────
    function handleRejection(event) {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason ?? 'unhandled promise rejection');
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

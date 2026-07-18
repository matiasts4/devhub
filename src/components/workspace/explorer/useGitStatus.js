'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bubbleUpDirectoryStatuses, buildGitStatusMap, lookupGitStatus } from './gitStatusUtils';

const EMPTY = new Map();
export const GIT_STATUS_INVALIDATE = 'devhub:fs-git-invalidate';

export function invalidateGitStatus() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(GIT_STATUS_INVALIDATE));
}

/**
 * @param {string|null} basePath
 * @param {boolean} enabled
 * @param {{ deferMs?: number }} [options]
 */
export function useGitStatus(basePath, enabled = true, options = {}) {
  const deferMs = options.deferMs ?? 0;
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const reqRef = useRef(0);
  const basePathRef = useRef(basePath);

  useEffect(() => {
    basePathRef.current = basePath;
  }, [basePath]);

  const refresh = useCallback(async () => {
    const path = basePathRef.current;
    if (!enabled || !path) {
      setStatus(null);
      return;
    }
    const req = ++reqRef.current;
    try {
      const response = await fetch(`/api/fs/git-status?base=${encodeURIComponent(path)}`);
      const data = await response.json();
      if (req !== reqRef.current) return;
      if (!response.ok) {
        setError(data?.error || 'git-status failed');
        console.warn('[useGitStatus]', data?.error || response.status);
        return;
      }
      setError(null);
      setStatus(data);
    } catch (err) {
      if (req !== reqRef.current) return;
      setError(err?.message || String(err));
      console.warn('[useGitStatus]', err);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !basePath) {
      setStatus(null);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    let intervalId = 0;
    const start = () => {
      if (cancelled) return;
      void refresh();
      intervalId = window.setInterval(() => void refresh(), 8_000);
    };

    const bootId =
      deferMs > 0
        ? window.setTimeout(start, deferMs)
        : typeof requestIdleCallback === 'function'
          ? requestIdleCallback(start, { timeout: 400 })
          : window.setTimeout(start, 0);

    const onInvalidate = () => void refresh();
    window.addEventListener(GIT_STATUS_INVALIDATE, onInvalidate);

    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback === 'function' && deferMs <= 0) {
        try {
          cancelIdleCallback(bootId);
        } catch {
          window.clearTimeout(bootId);
        }
      } else {
        window.clearTimeout(bootId);
      }
      if (intervalId) window.clearInterval(intervalId);
      window.removeEventListener(GIT_STATUS_INVALIDATE, onInvalidate);
    };
  }, [basePath, enabled, deferMs, refresh]);

  const map = useMemo(() => {
    if (!status?.changedFiles) return EMPTY;
    const next = buildGitStatusMap(status);
    bubbleUpDirectoryStatuses(next);
    return next;
  }, [status]);

  const lookup = useCallback((relativePath) => lookupGitStatus(map, relativePath), [map]);

  return { lookup, status, error, refresh, refreshKey: status?.updatedAt || 0 };
}

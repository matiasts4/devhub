'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * useSessionUsage — React hook for managing session token usage state.
 *
 * @param {string} sessionId - The agent hub session ID
 *
 * @returns {{
 *   usage: {
 *     prompt_tokens: number,
 *     completion_tokens: number,
 *     total_tokens: number,
 *     context_window_size: number|null,
 *     context_utilization: number,
 *     tool_calls_count: number,
 *     total_duration_ms: number,
 *   },
 *   loading: boolean,
 *   error: string|null,
 *   refresh: () => Promise<void>,
 * }}
 */
export function useSessionUsage(sessionId) {
  const [usage, setUsage] = useState({
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    context_window_size: null,
    context_utilization: 0,
    tool_calls_count: 0,
    total_duration_ms: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);

  // Keep the ref in sync
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchUsage = useCallback(async () => {
    if (!sessionId || !isMountedRef.current) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/agenthub/sessions/${sessionId}/usage`);
      if (!res.ok) {
        throw new Error(`Failed to fetch usage: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      if (isMountedRef.current) {
        setUsage(data);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [sessionId]);

  const refresh = useCallback(() => {
    return fetchUsage();
  }, [fetchUsage]);

  // Keep sessionId in a ref for the interval to avoid recreating it
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Initial fetch + auto-refresh in a SINGLE effect to avoid double polling
  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    // Fetch immediately
    fetchUsage();

    // Then set up auto-refresh interval
    const interval = setInterval(() => {
      if (sessionIdRef.current && isMountedRef.current) {
        fetchUsage();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sessionId, fetchUsage]);

  // Calculate context utilization percentage if not provided by the API
  const displayUsage = useMemo(() => {
    if (usage.context_utilization > 0) return usage;

    // Fallback calculation: if we have context_window_size, compute utilization
    if (usage.context_window_size && usage.context_window_size > 0) {
      const estimatedTokens = usage.prompt_tokens + usage.completion_tokens;
      const utilization = (estimatedTokens / usage.context_window_size) * 100;
      return {
        ...usage,
        context_utilization: Math.min(utilization, 100),
      };
    }

    return usage;
  }, [usage]);

  return {
    usage: displayUsage,
    loading,
    error,
    refresh,
  };
}

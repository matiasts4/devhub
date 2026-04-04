'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * useAgentTraces — React hook for managing trace state for an agent session.
 *
 * @param {string} sessionId - The agent hub session ID
 * @param {object} options
 * @param {number} [options.refreshInterval=2000] - Auto-refresh interval in ms (0 to disable)
 * @param {object} [options.filters] - Initial filters: { trace_type, tool_name, tool_status }
 * @param {boolean} [options.enabled=true] - Whether to fetch traces
 *
 * @returns {{
 *   traces: Array,
 *   loading: boolean,
 *   error: string|null,
 *   searchTraces: (term: string) => Promise<void>,
 *   filterTraces: (filters: object) => void,
 *   refresh: () => Promise<void>,
 *   searchResults: Array|null,
 * }}
 */
export function useAgentTraces(sessionId, options = {}) {
  const { refreshInterval = 2000, filters: initialFilters = {}, enabled = true } = options;

  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchResults, setSearchResults] = useState(null);
  const [activeFilters, setActiveFilters] = useState(initialFilters);
  const isMountedRef = useRef(true);

  // Keep the ref in sync
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const buildUrl = useCallback(
    (filters) => {
      const params = new URLSearchParams();
      if (filters?.trace_type) params.set('type', filters.trace_type);
      if (filters?.tool_name) params.set('tool', filters.tool_name);
      if (filters?.tool_status) params.set('status', filters.tool_status);
      if (filters?.limit) params.set('limit', String(filters.limit));
      return `/api/agenthub/sessions/${sessionId}/traces?${params.toString()}`;
    },
    [sessionId]
  );

  const fetchTraces = useCallback(
    async (filters) => {
      if (!sessionId || !isMountedRef.current) return;

      setLoading(true);
      setError(null);

      try {
        const url = buildUrl(filters || activeFilters);
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to fetch traces: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        if (isMountedRef.current) {
          setTraces(data);
          setSearchResults(null); // Reset search results on fresh fetch
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
    },
    [sessionId, activeFilters, buildUrl]
  );

  const searchTraces = useCallback(
    async (term) => {
      if (!sessionId || !term || !isMountedRef.current) return;

      setLoading(true);
      setError(null);

      try {
        const url = `/api/agenthub/sessions/${sessionId}/traces/search?q=${encodeURIComponent(term)}`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to search traces: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        if (isMountedRef.current) {
          setSearchResults(data);
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
    },
    [sessionId]
  );

  const filterTraces = useCallback((newFilters) => {
    setActiveFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const refresh = useCallback(() => {
    return fetchTraces(activeFilters);
  }, [fetchTraces, activeFilters]);

  // Initial fetch
  useEffect(() => {
    if (!enabled || !sessionId) {
      setLoading(false);
      return;
    }
    fetchTraces();
  }, [sessionId, enabled, fetchTraces]);

  // Auto-refresh when session is active
  useEffect(() => {
    if (!enabled || !sessionId || !refreshInterval || refreshInterval <= 0) return;

    const interval = setInterval(() => {
      fetchTraces(activeFilters);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [sessionId, enabled, refreshInterval, fetchTraces, activeFilters]);

  // Re-fetch when filters change
  useEffect(() => {
    if (Object.keys(activeFilters).length > 0) {
      fetchTraces(activeFilters);
    }
  }, [activeFilters, fetchTraces]);

  // useMemo'd display traces: prefer search results when available
  const displayTraces = useMemo(() => {
    return searchResults !== null ? searchResults : traces;
  }, [traces, searchResults]);

  return {
    traces: displayTraces,
    loading,
    error,
    searchTraces,
    filterTraces,
    refresh,
    searchResults,
  };
}

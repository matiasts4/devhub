import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_POLL_MS = 3000;

/**
 * Poll swarm bus snapshot (inbox, chat, events, presence) for operator UI.
 * @param {string|null} missionId
 * @param {{ pollMs?: number, enabled?: boolean }} [options]
 */
export function useSwarmBusSnapshot(missionId, { pollMs = DEFAULT_POLL_MS, enabled = true } = {}) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const abortRef = useRef(null);

  const fetchSnapshot = useCallback(async () => {
    const id = String(missionId || '').trim();
    if (!id || !enabled) {
      setSnapshot(null);
      setError(null);
      return null;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const response = await fetch(`/api/agenthub/swarm/${encodeURIComponent(id)}/bus-snapshot`, {
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo leer bus snapshot.');
      }
      setSnapshot(payload);
      setError(null);
      setLastFetchedAt(new Date().toISOString());
      return payload;
    } catch (err) {
      if (err?.name === 'AbortError') return null;
      setError(err?.message || 'Error de bus snapshot.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled, missionId]);

  useEffect(() => {
    if (!enabled || !missionId) {
      setSnapshot(null);
      return undefined;
    }

    fetchSnapshot();
    const timer = setInterval(fetchSnapshot, Math.max(1500, pollMs));
    return () => {
      clearInterval(timer);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [enabled, fetchSnapshot, missionId, pollMs]);

  const pendingCountByRole = (snapshot?.inbox_pending || []).reduce((acc, row) => {
    const role = row?.to_role;
    if (!role) return acc;
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});

  return {
    snapshot,
    loading,
    error,
    lastFetchedAt,
    refresh: fetchSnapshot,
    pendingCountByRole,
  };
}

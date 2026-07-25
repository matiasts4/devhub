'use client';

import OperatorTimelineItem from './OperatorTimelineItem.jsx';
import ExecutionRollupCard from './ExecutionRollupCard.jsx';
import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * OperatorTimelineFeed — main container (D-7, T14).
 *
 * Fetches timeline data on mount, opens SSE stream, merges live updates.
 *
 * Props:
 *   executionId?: string
 *   actorId?: string
 *   rollup?: boolean
 *   limit?: number
 *   pollInterval?: number (default 10_000ms)
 */
const DEFAULT_POLL_INTERVAL_MS = 10_000;

export default function OperatorTimelineFeed({
  executionId,
  actorId,
  rollup = false,
  limit = 50,
  pollInterval = DEFAULT_POLL_INTERVAL_MS,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastDurableSeq, setLastDurableSeq] = useState(0);

  // SSE event source ref
  const esRef = useRef(null);
  // Secondary-hint timers
  const hintTimersRef = useRef(new Map()); // item_id → timer
  // Polling interval ref
  const pollTimerRef = useRef(null);
  // Track confirmed sequences to discard stale hints
  const confirmedSeqsRef = useRef(new Set());

  // ── Merge a new item into the state array (OET-6 authority rules)
  const mergeItem = useCallback((newItem) => {
    setItems((prev) => {
      // Duplicate guard (item_id already present)
      if (prev.some((i) => i.item_id === newItem.item_id)) return prev;

      // Merge by occurred_at ASC, sequence ASC
      const next = [...prev, newItem].sort((a, b) => {
        const tA = new Date(a.occurred_at).getTime();
        const tB = new Date(b.occurred_at).getTime();
        if (tA !== tB) return tA - tB;
        return (a.sequence || 0) - (b.sequence || 0);
      });
      return next;
    });

    // Track confirmed sequences
    if (newItem.authority === 'primary' && newItem.sequence) {
      confirmedSeqsRef.current.add(newItem.sequence);
      // Clear any pending secondary-hint timer for this sequence
      const timer = hintTimersRef.current.get(newItem.item_id);
      if (timer) {
        clearTimeout(timer);
        hintTimersRef.current.delete(newItem.item_id);
      }
    }
  }, []);

  // ── Re-sync from GET API (SSE disconnect, or secondary_hint timeout)
  const reSync = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (executionId) params.set('execution_id', executionId);
      if (actorId) params.set('actor_id', actorId);
      params.set('limit', String(limit));
      params.set('rollup', String(rollup));

      const res = await fetch(`/api/agenthub/operators/timeline?${params}`);
      if (!res.ok) return;

      const data = await res.json();
      if (rollup) {
        // Replace with rollup cards (items state not used for rollup mode)
        setItems(data.items || []);
      } else {
        setItems(data.items || []);
      }
    } catch (_) {
      // Non-critical — keep showing current items
    }
  }, [executionId, actorId, limit, rollup]);

  // ── Initial fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (executionId) params.set('execution_id', executionId);
        if (actorId) params.set('actor_id', actorId);
        params.set('limit', String(limit));
        params.set('rollup', String(rollup));

        const res = await fetch(`/api/agenthub/operators/timeline?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!cancelled) {
          setItems(data.items || []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [executionId, actorId, limit, rollup]);

  // ── SSE stream
  useEffect(() => {
    if (rollup) return; // SSE only for item mode

    const params = new URLSearchParams();
    if (executionId) params.set('execution_id', executionId);
    if (actorId) params.set('actor_id', actorId);
    const url = `/api/agenthub/operators/timeline/stream?${params}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('heartbeat', (e) => {
      try {
        const data = JSON.parse(e.data);
        setLastDurableSeq(data.last_durable_sequence || 0);
      } catch {
        /* ignore malformed SSE event */
      }
    });

    es.addEventListener('timeline_item', (e) => {
      try {
        const data = JSON.parse(e.data);
        const item = data.item;
        if (!item) return;

        if (data.authority === 'primary') {
          // Confirmed item — merge and update watermark
          mergeItem(item);
          setLastDurableSeq(data.last_durable_sequence || 0);
        } else {
          // secondary_hint — render with indicator
          mergeItem(item);
          // Set 2-second timer: if last_durable_sequence >= item.sequence before timer fires,
          // discard the hint (item was confirmed durable)
          const timer = setTimeout(() => {
            // Check if this item is now confirmed
            if (confirmedSeqsRef.current.has(item.sequence)) {
              // Already confirmed — hint was redundant, keep the item (it's already in state)
            }
            hintTimersRef.current.delete(item.item_id);
          }, 2000);
          hintTimersRef.current.set(item.item_id, timer);
        }
      } catch {
        /* ignore malformed SSE event */
      }
    });

    es.onerror = () => {
      // On SSE disconnect, re-sync from GET API
      es.close();
      reSync();
    };

    return () => {
      es.close();
      // Clear all pending hint timers
      for (const timer of hintTimersRef.current.values()) {
        clearTimeout(timer);
      }
      hintTimersRef.current.clear();
    };
  }, [executionId, actorId, rollup, mergeItem, reSync]);

  // ── Polling fallback (every pollInterval ms)
  useEffect(() => {
    if (rollup) return;
    pollTimerRef.current = setInterval(() => {
      reSync();
    }, pollInterval);
    return () => clearInterval(pollTimerRef.current);
  }, [pollInterval, rollup, reSync]);

  // ── Render
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin border-accent-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-600 bg-red-50 rounded border border-red-200">
        Failed to load timeline: {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-text-muted">No timeline entries yet.</p>
      </div>
    );
  }

  if (rollup) {
    return (
      <div className="space-y-3">
        {items.map((summary, i) => (
          <ExecutionRollupCard key={summary.execution_id || i} summary={summary} />
        ))}
      </div>
    );
  }

  return (
    <div className="divide-y divide-borders-subtle">
      {items.map((item) => (
        <OperatorTimelineItem key={item.item_id} item={item} />
      ))}
    </div>
  );
}

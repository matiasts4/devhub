'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getOperatorSidebarModel } from '@/lib/operations/swarmControl';
import { persistMissionControlComposerMessage } from '@/lib/operations/swarmControl';
import OperatorFeedItem from './OperatorFeedItem';
import OperatorComposer from './OperatorComposer';

const POLL_INTERVAL_MS = 2000;
const SSE_RECONNECT_DELAY_MS = 2000;

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function OperatorErrorBanner({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 px-3 py-2 border-t border-rose-800/50 bg-rose-950/60 text-rose-300 text-xs"
    >
      <span className="flex-1">{message || 'Failed to send. Retry?'}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded px-2 py-1 bg-rose-800/60 hover:bg-rose-700/60 text-rose-200 text-[11px] font-medium transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

function EmptySessionPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center px-6">
      <div className="w-10 h-10 rounded-full bg-[rgba(var(--accent-rgb,88,166,255),0.1)] flex items-center justify-center">
        <svg
          className="w-5 h-5 text-[rgba(var(--accent-rgb,88,166,255),0.6)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M1512a3 3 0 11-6 0 3 3 0 016 0z" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
          />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--text-secondary)]">No active session</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Start a swarm to see the operator feed.
        </p>
      </div>
    </div>
  );
}

function ReconnectingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-[var(--text-muted)]">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      Reconnecting...
    </div>
  );
}

export default function WorkspaceOperatorObserverPane({ sessionId, onClose }) {
  const [feedItems, setFeedItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadEarlierLoading, setLoadEarlierLoading] = useState(false);
  const feedEndRef = useRef(null);
  const feedContainerRef = useRef(null);
  const userScrolledUpRef = useRef(false);
  const sseRef = useRef(null);
  const pollTimerRef = useRef(null);
  const watermarkRef = useRef(null);
  const lastPendingTextRef = useRef(null);

  // ── Initial load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      try {
        const model = await getOperatorSidebarModel({
          sessionId,
          watermark: null,
          limit: 200,
        });

        if (cancelled) return;
        setFeedItems(model.feedItems || []);
        setHasMore(model.hasMore || false);
        watermarkRef.current =
          model.watermark ||
          (model.feedItems.length > 0
            ? model.feedItems[model.feedItems.length - 1].occurredAt
            : null);

        if (model.sessionId) {
          openSse(model.sessionId);
        }
      } catch (err) {
        console.error('[OperatorObserverPane] initial load error:', err.message);
      }
    }

    loadInitial();
    return () => {
      cancelled = true;
      closeSse();
      closePoll();
    };
  }, [sessionId]);

  // ── SSE ────────────────────────────────────────────────────────────────────────
  const openSse = useCallback((missionId) => {
    closeSse();
    if (!missionId) return;

    const base =
      typeof window !== 'undefined' && window.location
        ? window.location.origin
        : 'http://localhost';
    const url = `${base}/api/agenthub/events/stream?mission_id=${encodeURIComponent(missionId)}`;
    const es = new EventSource(url);

    es.addEventListener('feed-item', (e) => {
      try {
        const { payload } = JSON.parse(e.data);
        if (!payload) return;
        setFeedItems((prev) => [...prev, payload]);
        watermarkRef.current = payload.occurredAt;
        setIsReconnecting(false);
      } catch (err) {
        console.warn('[OperatorObserverPane] feed-item parse error:', err.message);
      }
    });

    es.addEventListener('progress-update', (e) => {
      try {
        const { payload } = JSON.parse(e.data);
        if (!payload) return;
        setFeedItems((prev) => [...prev, payload]);
        watermarkRef.current = payload.occurredAt;
      } catch (err) {
        console.warn('[OperatorObserverPane] progress-update parse error:', err.message);
      }
    });

    es.addEventListener('session-end', (e) => {
      try {
        const data = JSON.parse(e.data);
        setSessionEnded(true);
        setIsSubmitting(true);
        setIsReconnecting(false);
      } catch (err) {
        console.warn('[OperatorObserverPane] session-end parse error:', err.message);
      }
    });

    es.addEventListener('heartbeat', (e) => {
      setIsReconnecting(false);
    });

    es.onerror = () => {
      es.close();
      sseRef.current = null;
      setIsReconnecting(true);
      startPoll(missionId);
    };

    sseRef.current = es;
  }, []);

  const closeSse = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  }, []);

  // ── Polling fallback ─────────────────────────────────────────────────────────
  const startPoll = useCallback((missionId) => {
    closePoll();
    pollTimerRef.current = setInterval(async () => {
      try {
        const model = await getOperatorSidebarModel({
          sessionId: missionId,
          watermark: watermarkRef.current,
          limit: 200,
        });

        if (model.feedItems && model.feedItems.length > 0) {
          setFeedItems((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const newItems = model.feedItems.filter((item) => !existingIds.has(item.id));
            if (newItems.length === 0) return prev;
            return [...prev, ...newItems];
          });
          watermarkRef.current =
            model.watermark ||
            model.feedItems[model.feedItems.length - 1]?.occurredAt ||
            watermarkRef.current;
        }
      } catch (err) {
        // Polling errors are silent — SSE will retry
      }
    }, POLL_INTERVAL_MS);
  }, []);

  const closePoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (userScrolledUpRef.current) return;
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feedItems]);

  // ── Scroll tracking ─────────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = feedContainerRef.current;
    if (!el) return;
    userScrolledUpRef.current = el.scrollTop > 0;
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (text) => {
      if (!text.trim() || isSubmitting || sessionEnded) return;

      lastPendingTextRef.current = text;
      setSubmitError(null);
      setIsSubmitting(true);

      // Optimistic append
      const optimisticItem = {
        id: `pending:${Date.now()}`,
        type: 'operator-prompt',
        role: 'operator',
        text: text.trim(),
        timestamp: new Date().toISOString(),
        occurredAt: new Date().toISOString(),
        pending: true,
      };
      setFeedItems((prev) => [...prev, optimisticItem]);

      try {
        const result = await persistMissionControlComposerMessage({
          recipient_agent_ids: [],
          body_summary: text.trim(),
        });

        // Replace optimistic item with confirmed one
        setFeedItems((prev) =>
          prev.map((item) =>
            item.id === optimisticItem.id
              ? {
                  ...item,
                  id: `msg:${result?.latest_message?.message_id || optimisticItem.id}`,
                  pending: false,
                }
              : item
          )
        );
        setIsSubmitting(false);
      } catch (err) {
        // Mark item as errored
        setFeedItems((prev) =>
          prev.map((item) =>
            item.id === optimisticItem.id ? { ...item, pending: false, error: true } : item
          )
        );
        setSubmitError(err.message || 'Failed to send. Retry?');
        setIsSubmitting(false);
      }
    },
    [isSubmitting, sessionEnded]
  );

  // ── Retry ───────────────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    const text = lastPendingTextRef.current;
    if (!text) return;
    setSubmitError(null);
    handleSubmit(text);
  }, [handleSubmit]);

  // ── Load earlier ─────────────────────────────────────────────────────────────
  const handleLoadEarlier = useCallback(async () => {
    if (loadEarlierLoading || !hasMore) return;
    setLoadEarlierLoading(true);
    try {
      const model = await getOperatorSidebarModel({
        sessionId,
        watermark: feedItems[0]?.occurredAt || null,
        limit: 200,
      });
      if (model.feedItems && model.feedItems.length > 0) {
        setFeedItems((prev) => [...model.feedItems, ...prev]);
        setHasMore(model.hasMore || false);
      }
    } catch (err) {
      console.error('[OperatorObserverPane] load earlier error:', err.message);
    } finally {
      setLoadEarlierLoading(false);
    }
  }, [sessionId, feedItems, hasMore, loadEarlierLoading]);

  const isEmpty = feedItems.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Feed area */}
      <div
        ref={feedContainerRef}
        onScroll={handleScroll}
        aria-label="Operator session feed"
        role="log"
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2"
      >
        {isEmpty && !sessionEnded ? (
          <EmptySessionPlaceholder />
        ) : (
          <>
            {hasMore && (
              <button
                type="button"
                onClick={handleLoadEarlier}
                disabled={loadEarlierLoading}
                className="w-full py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-dashed border-[var(--border-subtle)] rounded transition-colors disabled:opacity-50"
              >
                {loadEarlierLoading ? 'Loading...' : 'Load earlier'}
              </button>
            )}
            {feedItems.map((item) => (
              <OperatorFeedItem key={item.id} item={item} />
            ))}
          </>
        )}
        <div ref={feedEndRef} />
      </div>

      {/* Reconnecting indicator */}
      {isReconnecting && <ReconnectingIndicator />}

      {/* Error banner */}
      {submitError && <OperatorErrorBanner message={submitError} onRetry={handleRetry} />}

      {/* Composer */}
      <OperatorComposer
        onSubmit={handleSubmit}
        disabled={isSubmitting || sessionEnded}
        placeholder={
          sessionEnded ? 'Session ended' : 'Ask the operator anything about the current session...'
        }
      />
    </div>
  );
}

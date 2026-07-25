'use client';

import { Activity, AlertTriangle, Clock, X, Cpu, Layers } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { sileo } from 'sileo';

// ─── Pure helper functions (exported for unit testing) ─────────────────────

/**
 * Format a wait time in milliseconds to a human-readable string.
 * @param {number} ms
 * @returns {string}
 */
export function formatWaitMs(ms) {
  if (!ms || ms <= 0) return '< 1s';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${totalSeconds}s`;
}

/**
 * Extract queue items array from the API status response.
 * Guards against null/undefined and missing fields.
 * @param {object|null} data
 * @returns {Array}
 */
export function buildItemsFromResponse(data) {
  const rawItems = Array.isArray(data?.queue) ? data.queue : data?.queue?.items;
  if (!Array.isArray(rawItems)) return [];

  return rawItems.map((item, index) => {
    const {
      supervisor: _supervisor,
      supervisor_snapshot: _supervisorSnapshot,
      supervisorSnapshot: _supervisorSnapshotCamel,
      ...rest
    } = item;

    return {
      ...rest,
      position: item.position ?? index + 1,
      supervisor: normalizeSupervisorSnapshot(
        item.supervisor_snapshot || item.supervisorSnapshot || item.supervisor
      ),
    };
  });
}

/**
 * Remove an item by id from a list (immutable).
 * Returns the original array if id not found.
 * @param {Array} items
 * @param {string} id
 * @returns {Array}
 */
export function removeItemFromList(items, id) {
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return items;
  return [...items.slice(0, idx), ...items.slice(idx + 1)];
}

export function buildOperationalQueueBanner(queueHealth) {
  if (!queueHealth) {
    return {
      tone: 'muted',
      title: 'Cola sin telemetría',
      body: 'No hay snapshot canónico disponible para confirmar el estado de la cola.',
    };
  }

  const length = queueHealth.length || 0;
  return {
    tone: 'warning',
    title: 'Cola en memoria',
    body:
      length > 0
        ? `Hay ${length} tarea${length !== 1 ? 's' : ''} en memoria; se pierden al reiniciar.`
        : 'La cola sigue siendo en memoria; se pierde al reiniciar.',
  };
}

function normalizeCount(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function pickFirstDefined(...values) {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return undefined;
}

function normalizeSupervisorSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;

  const normalized = {
    supervisor_state: pickFirstDefined(snapshot.supervisor_state, snapshot.supervisorState) || null,
    outcome: snapshot.outcome || null,
    reason_class: pickFirstDefined(snapshot.reason_class, snapshot.reasonClass) || null,
    task_retry_count: normalizeCount(
      pickFirstDefined(snapshot.task_retry_count, snapshot.taskRetryCount)
    ),
    attempt_count: normalizeCount(pickFirstDefined(snapshot.attempt_count, snapshot.attemptCount)),
    unchanged_failure_count: normalizeCount(
      pickFirstDefined(snapshot.unchanged_failure_count, snapshot.unchangedFailureCount)
    ),
    approval_request_count: normalizeCount(
      pickFirstDefined(snapshot.approval_request_count, snapshot.approvalRequestCount)
    ),
    orphan_recovery_count: normalizeCount(
      pickFirstDefined(snapshot.orphan_recovery_count, snapshot.orphanRecoveryCount)
    ),
    workspace_id: pickFirstDefined(snapshot.workspace_id, snapshot.workspaceId) || null,
    run_id: pickFirstDefined(snapshot.run_id, snapshot.runId) || null,
    evidence_ref: pickFirstDefined(snapshot.evidence_ref, snapshot.evidenceRef) || null,
    updated_at: pickFirstDefined(snapshot.updated_at, snapshot.updatedAt) || null,
  };

  return normalized.supervisor_state ? normalized : null;
}

export function buildSupervisorSnapshotSummary(supervisor) {
  const snapshot = normalizeSupervisorSnapshot(supervisor);
  if (!snapshot) return null;

  const counters = [];
  if (snapshot.attempt_count > 0) counters.push(`Intentos ${snapshot.attempt_count}`);
  if (snapshot.task_retry_count > 0) counters.push(`Retries ${snapshot.task_retry_count}`);
  if (snapshot.approval_request_count > 0) {
    counters.push(`Aprobaciones ${snapshot.approval_request_count}`);
  }
  if (snapshot.orphan_recovery_count > 0) {
    counters.push(`Recuperaciones ${snapshot.orphan_recovery_count}`);
  }

  return {
    stateLabel: snapshot.supervisor_state.replace(/_/g, ' ').toUpperCase(),
    reasonLabel: snapshot.reason_class || null,
    counters,
    evidenceRef: snapshot.evidence_ref || null,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_ACTIVE = 1500;
const POLL_INTERVAL_IDLE = 5000;

export default function SwarmQueuePanel() {
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(new Set());
  const intervalRef = useRef(null);

  const fetchStatus = useCallback(async (signal) => {
    try {
      const res = await fetch('/api/agenthub/opencode/status', { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setItems(buildItemsFromResponse(json));
      setError(null);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    // Immediate first fetch
    fetchStatus(controller.signal);

    const schedule = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const interval = items.length > 0 ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_IDLE;
      intervalRef.current = setInterval(() => {
        fetchStatus(controller.signal);
      }, interval);
    };

    schedule();

    return () => {
      controller.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // items.length drives the interval — re-run when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const handleCancel = useCallback(
    async (itemId) => {
      if (cancelling.has(itemId)) return;

      // Optimistic update
      const prevItems = items;
      setItems((prev) => removeItemFromList(prev, itemId));
      setCancelling((prev) => new Set([...prev, itemId]));

      try {
        const res = await fetch(`/api/agenthub/queue/${itemId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        sileo.success({ title: 'Tarea cancelada de la cola' });
      } catch (err) {
        // Revert optimistic update
        setItems(prevItems);
        sileo.error({ title: `Error al cancelar: ${err.message}` });
      } finally {
        setCancelling((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    },
    [items, cancelling]
  );

  const isHealthy = data?.process?.healthy;
  const concurrencyActive = data?.concurrency?.active ?? 0;
  const concurrencyMax = data?.concurrency?.max ?? 5;
  const concurrencyPct =
    concurrencyMax > 0 ? Math.min((concurrencyActive / concurrencyMax) * 100, 100) : 0;
  const queueBanner = buildOperationalQueueBanner({
    status: data?.queue?.length > 0 ? 'healthy' : 'healthy',
    authority: 'authoritative',
    length: items.length,
    estimated_wait_ms: data?.queue?.estimatedWaitMs || 0,
  });

  return (
    <div
      className="flex flex-col h-full text-xs"
      style={{ background: '#0d1018', color: '#e2e8f0' }}
    >
      {/* ─── Process Health Badge ────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: '#1f2937' }}
      >
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-semibold text-gray-300">Swarm Queue</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background:
                isHealthy === false ? '#ef4444' : isHealthy === true ? '#22c55e' : '#9ca3af',
            }}
          />
          <span
            style={{
              color: isHealthy === false ? '#ef4444' : isHealthy === true ? '#22c55e' : '#9ca3af',
            }}
          >
            {isHealthy === false ? 'Caído' : isHealthy === true ? 'OK' : '…'}
          </span>
        </div>
      </div>

      {/* ─── Process Down Banner ─────────────────────────────────────────── */}
      {isHealthy === false && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-xs"
          style={{ background: '#2d0a0a', color: '#ef4444', borderBottom: '1px solid #5f1a1a' }}
        >
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>OpenCode caído — los agentes no pueden lanzarse</span>
        </div>
      )}

      {/* ─── Concurrency Bar ─────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b" style={{ borderColor: '#1f2937' }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 text-gray-400">
            <Cpu className="w-3 h-3" />
            <span>Concurrencia</span>
          </div>
          <span style={{ color: '#93c5fd' }}>
            {concurrencyActive} / {concurrencyMax}
          </span>
        </div>
        <div
          className="w-full rounded-full overflow-hidden"
          style={{ height: '4px', background: '#1f2937' }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${concurrencyPct}%`,
              background: concurrencyPct >= 90 ? '#ef4444' : '#3b82f6',
            }}
          />
        </div>
      </div>

      {/* ─── In-memory Warning ───────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 border-b text-[10px]"
        style={{ borderColor: '#1f2937', color: '#9ca3af', background: '#111826' }}
      >
        <AlertTriangle className="w-2.5 h-2.5 shrink-0 text-yellow-500" />
        <span>
          <strong>{queueBanner.title}:</strong> {queueBanner.body}
        </span>
      </div>

      {/* ─── Queue Items ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {error && (
          <div
            className="flex items-center gap-2 m-2 px-3 py-2 rounded text-xs"
            style={{ background: '#2d0a0a', color: '#ef4444', border: '1px solid #5f1a1a' }}
          >
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>Error: {error}</span>
          </div>
        )}

        {items.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-32 gap-2"
            style={{ color: '#6b7280' }}
          >
            <Layers className="w-8 h-8 opacity-30" />
            <span>No hay tareas esperando</span>
          </div>
        ) : (
          <div className="p-2 flex flex-col gap-1.5">
            {items.map((item) => {
              const supervisorSummary = buildSupervisorSnapshotSummary(item.supervisor);

              return (
                <div
                  key={item.id}
                  className="flex items-start gap-2 p-2 rounded-md"
                  style={{ background: '#111826', border: '1px solid #1f2937' }}
                >
                  {/* Position badge */}
                  <span
                    className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold mt-0.5"
                    style={{ background: '#1a2744', color: '#93c5fd' }}
                  >
                    {item.position}
                  </span>

                  {/* Item info */}
                  <div className="flex-1 min-w-0">
                    {supervisorSummary && (
                      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
                          {supervisorSummary.stateLabel}
                        </span>
                        {supervisorSummary.reasonLabel && (
                          <span style={{ color: '#fbbf24' }}>{supervisorSummary.reasonLabel}</span>
                        )}
                      </div>
                    )}
                    <div
                      className="font-medium truncate"
                      style={{ color: '#e2e8f0' }}
                      title={item.title}
                    >
                      {item.title}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5" style={{ color: '#6b7280' }}>
                      <span>{item.agent}</span>
                      {item.estimatedWaitMs > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatWaitMs(item.estimatedWaitMs)}
                        </span>
                      )}
                    </div>
                    {supervisorSummary?.counters?.length > 0 && (
                      <div
                        className="mt-1 flex flex-wrap gap-2 text-[10px]"
                        style={{ color: '#94a3b8' }}
                      >
                        {supervisorSummary.counters.map((counter) => (
                          <span key={counter}>{counter}</span>
                        ))}
                      </div>
                    )}
                    {supervisorSummary?.evidenceRef && (
                      <div
                        className="mt-1 truncate text-[10px]"
                        style={{ color: '#7dd3fc' }}
                        title={supervisorSummary.evidenceRef}
                      >
                        {supervisorSummary.evidenceRef}
                      </div>
                    )}
                  </div>

                  {/* Cancel button */}
                  <button
                    onClick={() => handleCancel(item.id)}
                    disabled={cancelling.has(item.id)}
                    className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    style={{ color: '#9ca3af' }}
                    title="Cancelar tarea"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

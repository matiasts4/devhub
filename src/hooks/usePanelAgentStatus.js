import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { extractOpenCodeSessionId } from '@/lib/terminal/restorePolicyResolver';
import {
  derivePanelStatus,
  getPanelStatusLabel,
  getPanelStatusStyle,
  PANEL_STATUS,
} from '@/components/terminal/utils/panelStatusHelpers';
import {
  getPanelActivity,
  getPanelActivityAgeMs,
  subscribePanelActivity,
} from '@/components/terminal/utils/panelActivityStore';
import {
  getPanelSemanticState,
  subscribePanelSemanticState,
} from '@/components/terminal/utils/panelSemanticStateStore';

const DEFAULT_POLLING_INTERVAL_MS = 6000;
const FETCH_TIMEOUT_MS = 3000;

function resolveApiSessionId(agentRun, initialCommand, terminalActivity) {
  if (agentRun) {
    return agentRun.sessionId || agentRun.runId || null;
  }
  if (terminalActivity?.agentSessionId) {
    return terminalActivity.agentSessionId;
  }
  return extractOpenCodeSessionId(initialCommand);
}

function getTimeoutSignal() {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    return AbortSignal.timeout(FETCH_TIMEOUT_MS);
  }
  return null;
}

/**
 * usePanelAgentStatus — derive and poll the runtime status of a terminal panel's agent.
 *
 * @param {string} panelId
 * @param {object} options
 * @param {string|null} options.terminalId - PTY terminal id (defaults to panelId)
 * @param {object|null} options.agentRun - agent run metadata from devhub_agent_runs
 * @param {string|null} options.initialCommand - the panel's initial command
 * @param {string|null} options.connectionState - panel connection state from TerminalTTY
 * @param {number} [options.pollingInterval=6000] - polling interval in ms
 * @param {boolean} [options.enabled=true] - whether polling is enabled
 */
export default function usePanelAgentStatus(
  panelId,
  {
    terminalId = null,
    agentRun = null,
    initialCommand = null,
    connectionState = null,
    pollingInterval = DEFAULT_POLLING_INTERVAL_MS,
    enabled = true,
  } = {}
) {
  const effectiveTerminalId = terminalId || panelId;
  const [apiStatus, setApiStatus] = useState(null);
  const [terminalActivity, setTerminalActivity] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  // Live event-driven activity signal from the PTY WebSocket (TerminalTTY tracker).
  const subscribe = useCallback((cb) => subscribePanelActivity(panelId, cb), [panelId]);
  const getSnapshot = useCallback(() => getPanelActivity(panelId), [panelId]);
  const liveActivity = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const liveActivityAgeMs = liveActivity ? getPanelActivityAgeMs(panelId) : null;

  const subscribeSemantic = useCallback(
    (cb) => subscribePanelSemanticState(panelId, cb),
    [panelId]
  );
  const getSemanticSnapshot = useCallback(() => getPanelSemanticState(panelId), [panelId]);
  const liveSemantic = useSyncExternalStore(subscribeSemantic, getSemanticSnapshot, () => null);

  const mergedTerminalActivity = useMemo(() => {
    if (!terminalActivity && !liveSemantic) return null;
    const base = terminalActivity ? { ...terminalActivity } : {};
    if (liveSemantic?.agentTuiState) {
      base.agentTuiState = liveSemantic.agentTuiState;
      const at = liveSemantic.agentTuiStateAt ?? Date.now();
      base.agentTuiStateAt = new Date(at).toISOString();
      base.agentTuiStateAgeMs = Date.now() - at;
    }
    return Object.keys(base).length ? base : null;
  }, [terminalActivity, liveSemantic]);

  const status = useMemo(
    () =>
      derivePanelStatus({
        connectionState,
        agentRun,
        initialCommand,
        apiStatus,
        terminalActivity: mergedTerminalActivity,
        liveActivity,
        liveActivityAgeMs,
      }),
    [
      connectionState,
      agentRun,
      initialCommand,
      apiStatus,
      mergedTerminalActivity,
      liveActivity,
      liveActivityAgeMs,
    ]
  );

  const style = useMemo(() => getPanelStatusStyle(status), [status]);
  const label = useMemo(() => getPanelStatusLabel(status), [status]);

  // Poll agent-hub session status when we have a tracked session id.
  useEffect(() => {
    if (!enabled || !panelId) return undefined;

    const sessionId = resolveApiSessionId(agentRun, initialCommand, terminalActivity);
    if (!sessionId) {
      setApiStatus(null);
      return undefined;
    }

    let cancelled = false;
    let intervalId = null;
    let currentController = null;

    const tick = async () => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;

      currentController?.abort();
      const controller = new AbortController();
      currentController = controller;

      try {
        const res = await fetch(`/api/agenthub/sessions/${encodeURIComponent(sessionId)}/status`, {
          signal: getTimeoutSignal() || controller.signal,
        });

        if (cancelled || requestId !== requestIdRef.current) return;

        if (res.status === 404) {
          // Session id is not tracked in agenthub (e.g. synthesized id for a
          // manually launched Kimi/Grok). This is not an error; just ignore it
          // and let PTY activity drive the badge.
          setError(null);
          return;
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (cancelled || requestId !== requestIdRef.current) return;

        setApiStatus(data?.status || null);
        setLastUpdated(new Date().toISOString());
        setError(null);
      } catch (err) {
        if (cancelled || requestId !== requestIdRef.current) return;
        setError(err?.message || 'status-unreachable');
        // Do not clear apiStatus: keep the last known good status so the UI
        // does not flicker to unknown on transient network errors.
      }
    };

    tick();
    intervalId = setInterval(
      tick,
      Math.max(2000, Number(pollingInterval) || DEFAULT_POLLING_INTERVAL_MS)
    );

    return () => {
      cancelled = true;
      currentController?.abort();
      if (intervalId) clearInterval(intervalId);
    };
  }, [
    panelId,
    agentRun,
    initialCommand,
    terminalActivity?.agentSessionId,
    enabled,
    pollingInterval,
  ]);

  // Poll PTY activity to detect real-time work for agent TUIs without tracked sessions.
  useEffect(() => {
    if (!enabled || !effectiveTerminalId) return undefined;

    let cancelled = false;
    let intervalId = null;
    let currentController = null;
    const tickRequestIdRef = { current: 0 };

    const tick = async () => {
      tickRequestIdRef.current += 1;
      const requestId = tickRequestIdRef.current;

      currentController?.abort();
      const controller = new AbortController();
      currentController = controller;

      try {
        const res = await fetch(
          `/api/terminal/sessions/${encodeURIComponent(effectiveTerminalId)}`,
          { signal: getTimeoutSignal() || controller.signal }
        );

        if (cancelled || requestId !== tickRequestIdRef.current) return;

        if (!res.ok) {
          if (res.status === 404) {
            setTerminalActivity(null);
          }
          return;
        }

        const data = await res.json();
        if (cancelled || requestId !== tickRequestIdRef.current) return;

        const lastActivityAt = data?.lastActivityAt || null;
        const lastActivityTime = lastActivityAt ? new Date(lastActivityAt).getTime() : 0;
        const lastActivityAgoMs = lastActivityTime ? Date.now() - lastActivityTime : null;

        const agentTuiStateAt = data?.agentTuiStateAt || null;
        setTerminalActivity({
          lastActivityAt,
          lastActivityAgoMs,
          isActive: lastActivityAgoMs !== null && lastActivityAgoMs <= 3000,
          alive: Boolean(data?.alive),
          socketCount: Number(data?.socketCount || 0),
          agentType: data?.agentType || null,
          agentSessionId: data?.agentSessionId || null,
          agentTuiState: data?.agentTuiState || null,
          agentTuiStateAt,
          agentTuiStateAgeMs: agentTuiStateAt ? Date.now() - agentTuiStateAt : null,
          mode: data?.mode || null,
        });
        setLastUpdated(new Date().toISOString());
      } catch {
        if (cancelled || requestId !== tickRequestIdRef.current) return;
        // Ignore transient PTY polling errors — the UI keeps the last known state.
      }
    };

    tick();
    intervalId = setInterval(
      tick,
      Math.max(1500, Number(pollingInterval) || DEFAULT_POLLING_INTERVAL_MS)
    );

    return () => {
      cancelled = true;
      currentController?.abort();
      if (intervalId) clearInterval(intervalId);
    };
  }, [effectiveTerminalId, enabled, pollingInterval]);

  return {
    status,
    label,
    isPulsing: style.pulse,
    style,
    apiStatus,
    terminalActivity,
    lastUpdated,
    error,
    details: {
      connectionState,
      agentRun: agentRun
        ? {
            selectedAgent: agentRun.selectedAgent,
            taskTitle: agentRun.taskTitle,
            sessionId: agentRun.sessionId,
            runId: agentRun.runId,
            opencodeSessionId: agentRun.opencodeSessionId,
          }
        : null,
      apiStatus,
      terminalActivity,
    },
  };
}

export { PANEL_STATUS };

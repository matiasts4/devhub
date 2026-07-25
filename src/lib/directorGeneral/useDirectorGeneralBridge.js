/**
 * @module directorGeneral/useDirectorGeneralBridge
 * React hook encapsulating all DG bridge client state and actions.
 */

'use strict';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  submitMissionRequest,
  postApprovalReply,
  getMissionTimeline,
  clearActiveMission,
  setActiveMission,
  isActiveMissionTerminal,
} from './bridge';
import { startPolling } from './polling';
import { emitRow } from './timeline';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'rejected']);

function getStorageKey(projectId) {
  return `devhub_dg_active_mission:${projectId || 'default'}`;
}

function loadActiveMissionId(projectId) {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(getStorageKey(projectId)) || null;
  } catch {
    return null;
  }
}

function saveActiveMissionId(projectId, missionId) {
  if (typeof window === 'undefined') return;
  try {
    if (missionId) {
      localStorage.setItem(getStorageKey(projectId), missionId);
    } else {
      localStorage.removeItem(getStorageKey(projectId));
    }
  } catch {
    /* ignore */
  }
}

/**
 * React hook for DG bridge state and actions.
 *
 * @param {Object} options
 * @param {string} [options.projectId] — used for localStorage key
 * @param {Function} [options.fetchImpl] — optional fetch for test injection
 * @returns {Object} DG bridge state and actions
 */
export default function useDirectorGeneralBridge({ projectId } = {}) {
  const [activeMissionId, setActiveMissionIdState] = useState(() => loadActiveMissionId(projectId));
  const [timelineRows, setTimelineRows] = useState([]);
  const [pollingState, setPollingState] = useState('idle'); // 'idle' | 'polling' | 'error'
  const [currentDirectorStatus, setCurrentDirectorStatus] = useState(null);
  const [pendingApproval, setPendingApproval] = useState(null);
  const [lastPollAt, setLastPollAt] = useState(null);
  const [error, setError] = useState(null);

  const pollingRef = useRef(null);
  const mountedRef = useRef(true);
  // Tracks the last failed approval action so retryMission can re-attempt it
  const lastApprovalActionRef = useRef(null);

  // Re-hydrate timeline on mount if there's an active mission
  useEffect(() => {
    if (!activeMissionId) return;

    async function rehydrate() {
      try {
        const { rows } = await getMissionTimeline(activeMissionId, { fetchImpl: window.fetch });
        if (mountedRef.current) {
          setTimelineRows(rows || []);
          // Resume polling if not terminal
          const lastRow = rows?.[rows.length - 1];
          if (lastRow && !TERMINAL_STATUSES.has(lastRow.status)) {
            setPollingState('polling');
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err.message);
          setPollingState('error');
        }
      }
    }

    rehydrate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollingRef.current) {
        pollingRef.current.stop();
        pollingRef.current = null;
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      pollingRef.current.stop();
      pollingRef.current = null;
    }
    setPollingState('idle');
  }, []);

  const handleTerminalState = useCallback(
    (missionId) => {
      if (!mountedRef.current) return;
      setPollingState('idle');
      setActiveMissionIdState(null);
      saveActiveMissionId(projectId, null);
      clearActiveMission();
    },
    [projectId]
  );

  const composeMissionRequest = useCallback(
    async (intent) => {
      if (activeMissionId && !isActiveMissionTerminal()) {
        const err = new Error('Hay una misión activa — esperá a que finalize o cancelala primero.');
        err.code = 'DUPLICATE_MISSION';
        setError(err.message);
        return { error: err.message };
      }

      setError(null);

      try {
        // Submit mission request
        const result = await submitMissionRequest(intent, { fetchImpl: window.fetch });

        if (result.status === 'director-offline') {
          // Emit failed row immediately, do not start polling
          try {
            await emitRow(
              'mission-result',
              'failed',
              {
                missionId: result.missionId,
                initiator: 'director-general',
                target: 'swarm-director',
                authority: 'operator-initiated',
                fallback:
                  'El Director no está disponible. Verificá que el servicio esté corriendo.',
              },
              window.fetch
            );
          } catch {
            /* ignore timeline write failure */
          }
          if (mountedRef.current) {
            setError('El Director no está disponible.');
            setPollingState('error');
          }
          return result;
        }

        const missionId = result.missionId;

        // Emit pending timeline row
        try {
          const row = await emitRow(
            'mission-request',
            'pending',
            {
              missionId,
              initiator: 'operator',
              target: 'swarm-director',
              authority: 'operator-initiated',
              fallback: 'Operator puede aprobar o cancelar.',
            },
            window.fetch
          );
          if (mountedRef.current) {
            setTimelineRows((prev) => [...prev, row]);
          }
        } catch {
          /* ignore timeline write failure */
        }

        // Set active mission
        if (mountedRef.current) {
          setActiveMissionIdState(missionId);
          saveActiveMissionId(projectId, missionId);
          setActiveMission(missionId, false);
          setPollingState('polling');
        }

        // Start polling
        if (pollingRef.current) {
          pollingRef.current.stop();
        }

        pollingRef.current = startPolling(
          missionId,
          { pollIntervalMs: 1000, fetchImpl: window.fetch },
          {
            onStatus: async (status) => {
              if (!mountedRef.current) return;
              setCurrentDirectorStatus(status);
              setLastPollAt(Date.now());

              // Emit status-poll row
              try {
                const row = await emitRow(
                  'status-poll',
                  status.status,
                  {
                    missionId,
                    initiator: 'director-general',
                    target: 'swarm-director',
                    authority: 'operator-initiated',
                    freshness: status.freshness || 'just_now',
                  },
                  window.fetch
                );
                if (mountedRef.current) {
                  setTimelineRows((prev) => [...prev, row]);
                }
              } catch {
                /* ignore */
              }

              if (status.status === 'approval-required') {
                if (mountedRef.current) {
                  setPendingApproval(status.approvalCheckpoint || { missionId });
                }
              } else {
                if (mountedRef.current) {
                  setPendingApproval(null);
                }
              }

              if (TERMINAL_STATUSES.has(status.status)) {
                // Emit final row
                try {
                  const row = await emitRow(
                    'mission-result',
                    status.status,
                    {
                      missionId,
                      initiator: 'swarm-director',
                      target: 'operator',
                      authority: status.status === 'completed' ? 'director' : 'director-escalated',
                      fallback: status.fallback || '',
                    },
                    window.fetch
                  );
                  if (mountedRef.current) {
                    setTimelineRows((prev) => [...prev, row]);
                    handleTerminalState(missionId);
                  }
                } catch {
                  if (mountedRef.current) handleTerminalState(missionId);
                }
              }
            },
            onFailure: async (failure) => {
              if (!mountedRef.current) return;
              try {
                const row = await emitRow(
                  'mission-result',
                  'failed',
                  {
                    missionId,
                    initiator: 'director-general',
                    target: 'swarm-director',
                    authority: 'operator-initiated',
                    fallback: failure.fallback || 'Error de conexión con el Director.',
                  },
                  window.fetch
                );
                if (mountedRef.current) {
                  setTimelineRows((prev) => [...prev, row]);
                  setError(failure.fallback || 'Error de conexión con el Director.');
                  setPollingState('error');
                  handleTerminalState(missionId);
                }
              } catch {
                if (mountedRef.current) {
                  setError(failure.fallback || 'Error de conexión con el Director.');
                  setPollingState('error');
                  handleTerminalState(missionId);
                }
              }
            },
          }
        );

        return result;
      } catch (err) {
        if (mountedRef.current) {
          setError(err.message);
          setPollingState('error');
        }
        return { error: err.message };
      }
    },
    [activeMissionId, projectId, handleTerminalState]
  );

  const onApprove = useCallback(async (missionId, approvalItemId) => {
    setError(null);
    lastApprovalActionRef.current = { missionId, approvalItemId, action: 'approved' };
    try {
      await postApprovalReply(missionId, approvalItemId, 'approved', { fetchImpl: window.fetch });

      // Emit approved row
      try {
        const row = await emitRow(
          'approval-required',
          'approved',
          {
            missionId,
            initiator: 'operator',
            target: 'swarm-director',
            authority: 'operator',
            fallback: '',
          },
          window.fetch
        );
        if (mountedRef.current) {
          setTimelineRows((prev) => [...prev, row]);
          setPendingApproval(null);
        }
      } catch {
        if (mountedRef.current) setPendingApproval(null);
      }
    } catch (err) {
      if (err.code === 'APPROVAL_EXPIRED' || err.status === 409) {
        // Emit failed row with correct fallback
        try {
          const row = await emitRow(
            'mission-result',
            'failed',
            {
              missionId,
              initiator: 'operator',
              target: 'swarm-director',
              authority: 'operator',
              fallback: 'La aprobación expiró. Volvé a intentar desde el Director.',
            },
            window.fetch
          );
          if (mountedRef.current) {
            setTimelineRows((prev) => [...prev, row]);
            setError('La aprobación expiró. Volvé a intentar desde el Director.');
            setPendingApproval(null);
          }
        } catch {
          if (mountedRef.current) {
            setError('La aprobación expiró. Volvé a intentar desde el Director.');
            setPendingApproval(null);
          }
        }
      } else {
        if (mountedRef.current) setError(err.message);
      }
    }
  }, []);

  const onReject = useCallback(async (missionId, approvalItemId) => {
    setError(null);
    lastApprovalActionRef.current = { missionId, approvalItemId, action: 'rejected' };
    try {
      await postApprovalReply(missionId, approvalItemId, 'rejected', { fetchImpl: window.fetch });

      try {
        const row = await emitRow(
          'approval-required',
          'rejected',
          {
            missionId,
            initiator: 'operator',
            target: 'swarm-director',
            authority: 'operator',
            fallback: '',
          },
          window.fetch
        );
        if (mountedRef.current) {
          setTimelineRows((prev) => [...prev, row]);
          setPendingApproval(null);
        }
      } catch {
        if (mountedRef.current) setPendingApproval(null);
      }
    } catch (err) {
      if (err.code === 'APPROVAL_EXPIRED' || err.status === 409) {
        try {
          const row = await emitRow(
            'mission-result',
            'failed',
            {
              missionId,
              initiator: 'operator',
              target: 'swarm-director',
              authority: 'operator',
              fallback: 'La aprobación expiró. Volvé a intentar desde el Director.',
            },
            window.fetch
          );
          if (mountedRef.current) {
            setTimelineRows((prev) => [...prev, row]);
            setError('La aprobación expiró. Volvé a intentar desde el Director.');
            setPendingApproval(null);
          }
        } catch {
          if (mountedRef.current) {
            setError('La aprobación expiró. Volvé a intentar desde el Director.');
            setPendingApproval(null);
          }
        }
      } else {
        if (mountedRef.current) setError(err.message);
      }
    }
  }, []);

  const retryMission = useCallback(() => {
    if (!lastApprovalActionRef.current) return;
    const { missionId, approvalItemId, action } = lastApprovalActionRef.current;
    if (action === 'approved') {
      onApprove(missionId, approvalItemId);
    } else {
      onReject(missionId, approvalItemId);
    }
  }, [onApprove, onReject]);

  const resetMission = useCallback(() => {
    if (pollingRef.current) {
      pollingRef.current.stop();
      pollingRef.current = null;
    }
    setActiveMissionIdState(null);
    setTimelineRows([]);
    setPollingState('idle');
    setCurrentDirectorStatus(null);
    setPendingApproval(null);
    setLastPollAt(null);
    setError(null);
    saveActiveMissionId(projectId, null);
    clearActiveMission();
  }, [projectId]);

  return {
    activeMissionId,
    timelineRows,
    pollingState,
    currentDirectorStatus,
    pendingApproval,
    lastPollAt,
    error,
    composeMissionRequest,
    onApprove,
    onReject,
    retryMission,
    resetMission,
  };
}

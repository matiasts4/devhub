import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  composeControlRoomSnapshot,
  persistMissionControlComposerMessage,
  selectControlRoomAgents,
  selectControlRoomApprovals,
  selectControlRoomDiagnostics,
  selectControlRoomEvidenceTimeline,
  selectControlRoomErrors,
  selectControlRoomHeader,
  selectControlRoomMission,
  selectControlRoomRuns,
  selectControlRoomWorkspaces,
  selectDirectorQueue,
  selectDirectorMissionSummary,
} from '@/lib/operations/swarmControl';
import ControlRoomHeader from '@/components/control-room/ControlRoomHeader';
import DirectorQueuePanel from '@/components/control-room/DirectorQueuePanel';
import AgentsClaimsPanel from '@/components/control-room/AgentsClaimsPanel';
import WorkspacesPanel from '@/components/control-room/WorkspacesPanel';
import RunsArtifactsPanel from '@/components/control-room/RunsArtifactsPanel';
import ApprovalsErrorsPanel from '@/components/control-room/ApprovalsErrorsPanel';
import DiagnosticOverlay from '@/components/control-room/DiagnosticOverlay';
import MissionKernelPanel from '@/components/control-room/MissionKernelPanel';
import EvidenceTimelinePanel from '@/components/control-room/EvidenceTimelinePanel';

void [
  ControlRoomHeader,
  DirectorQueuePanel,
  AgentsClaimsPanel,
  WorkspacesPanel,
  RunsArtifactsPanel,
  ApprovalsErrorsPanel,
  DiagnosticOverlay,
  MissionKernelPanel,
  EvidenceTimelinePanel,
];

function buildSnapshotInput({ snapshotInput, fetchedInput, project }) {
  if (snapshotInput) return snapshotInput;
  if (fetchedInput) return fetchedInput;
  return project ? { project } : {};
}

export default function SwarmControl({ snapshotInput = null }) {
  const { project } = useOutletContext() || {};
  const [fetchedInput, setFetchedInput] = useState(null);
  const [loading, setLoading] = useState(false);
  const [missionControlOverride, setMissionControlOverride] = useState(null);
  const [directorQueueOverride, setDirectorQueueOverride] = useState(null);
  const [handoffSubmitState, setHandoffSubmitState] = useState({ submitting: false, error: null });
  const [filterText, setFilterText] = useState('');
  const [layout, setLayout] = useState('grid');
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [expandedPanels, setExpandedPanels] = useState({ diagnostics: true });

  useEffect(() => {
    if (snapshotInput) return undefined;

    let cancelled = false;

    async function loadSnapshot() {
      setLoading(true);

      try {
        const params = new URLSearchParams();
        if (project?.id) params.set('project_id', project.id);

        const response = await fetch(
          params.size
            ? `/api/agenthub/operations/health?${params.toString()}`
            : '/api/agenthub/operations/health',
          { cache: 'no-store' }
        );
        if (!response.ok) return;

        const payload = await response.json();
        const nextInput =
          payload.control_room_input ||
          payload.control_room_snapshot_input ||
          payload.control_room ||
          null;

        if (!cancelled && nextInput) {
          setFetchedInput(nextInput);
        }
      } catch {
        // Snapshot endpoint may not yet expose control-room payload in this slice.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSnapshot();

    return () => {
      cancelled = true;
    };
  }, [project?.id, snapshotInput]);

  const snapshot = useMemo(
    () =>
      composeControlRoomSnapshot(
        buildSnapshotInput({
          snapshotInput,
          fetchedInput,
          project,
        })
      ),
    [snapshotInput, fetchedInput, project]
  );

  const header = useMemo(() => selectControlRoomHeader(snapshot), [snapshot]);
  const missionSummary = useMemo(() => selectDirectorMissionSummary(snapshot), [snapshot]);
  const agents = useMemo(() => selectControlRoomAgents(snapshot), [snapshot]);
  const workspaces = useMemo(() => selectControlRoomWorkspaces(snapshot), [snapshot]);
  const runs = useMemo(() => selectControlRoomRuns(snapshot), [snapshot]);
  const approvals = useMemo(() => selectControlRoomApprovals(snapshot), [snapshot]);
  const diagnostics = useMemo(() => selectControlRoomDiagnostics(snapshot), [snapshot]);
  const evidenceTimeline = useMemo(() => selectControlRoomEvidenceTimeline(snapshot), [snapshot]);
  const errors = useMemo(() => selectControlRoomErrors(snapshot), [snapshot]);
  const missionControl = useMemo(() => selectControlRoomMission(snapshot), [snapshot]);
  const directorQueue = useMemo(() => selectDirectorQueue(snapshot), [snapshot]);
  const effectiveMissionControl = missionControlOverride || missionControl;
  const effectiveDirectorQueue = directorQueueOverride || directorQueue;

  const eligibleExecutors = useMemo(
    () =>
      (Array.isArray(effectiveMissionControl?.participants)
        ? effectiveMissionControl.participants
        : []
      ).filter(
        (participant) =>
          participant?.status === 'active' && participant?.role_in_mission !== 'director'
      ),
    [effectiveMissionControl]
  );
  const handoffUnsafe = eligibleExecutors.length !== 1;
  const handoffDisabledReason = handoffSubmitState.error
    ? handoffSubmitState.error
    : handoffUnsafe
      ? 'Resolución insegura de destinatario: exactamente un executor activo.'
      : null;

  useEffect(() => {
    setMissionControlOverride(null);
  }, [missionControl]);

  useEffect(() => {
    setDirectorQueueOverride(null);
    setHandoffSubmitState({ submitting: false, error: null });
  }, [directorQueue]);

  const handleComposerSubmit = async ({ recipient_agent_ids, body_summary }) => {
    if (!effectiveMissionControl?.mission?.mission_id) {
      throw new Error('No hay misión activa para este mensaje local.');
    }

    const nextMissionControl = await persistMissionControlComposerMessage({
      recipient_agent_ids,
      body_summary,
    });

    setMissionControlOverride(nextMissionControl);
  };

  const handleClaimNext = async () => {
    if (handoffUnsafe || !project?.id) return;

    setHandoffSubmitState({ submitting: true, error: null });

    try {
      const response = await fetch('/api/agenthub/operations/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claim_director_next_task',
          project_id: project.id,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo reclamar el siguiente task durable.');
      }

      const nextDirectorQueue =
        payload?.control_room_snapshot_input?.director_queue ||
        payload?.control_room_input?.director_queue;

      if (nextDirectorQueue) {
        setDirectorQueueOverride(nextDirectorQueue);
      }

      setHandoffSubmitState({ submitting: false, error: null });
    } catch (error) {
      setHandoffSubmitState({
        submitting: false,
        error: error?.message || 'No se pudo reclamar el siguiente task durable.',
      });
    }
  };

  const normalizedFilter = filterText.trim().toLowerCase();
  const matchesFilter = useCallback(
    (record) => {
      if (!normalizedFilter) return true;
      return JSON.stringify(record || {})
        .toLowerCase()
        .includes(normalizedFilter);
    },
    [normalizedFilter]
  );

  const filteredAgents = useMemo(() => agents.filter(matchesFilter), [agents, matchesFilter]);
  const filteredWorkspaces = useMemo(
    () => workspaces.filter(matchesFilter),
    [workspaces, matchesFilter]
  );
  const filteredRuns = useMemo(() => runs.filter(matchesFilter), [runs, matchesFilter]);
  const filteredApprovals = useMemo(
    () => approvals.filter(matchesFilter),
    [approvals, matchesFilter]
  );
  const filteredErrors = useMemo(() => errors.filter(matchesFilter), [errors, matchesFilter]);

  return (
    <div
      className="min-h-full p-6"
      style={{ background: 'var(--surface-app)', color: 'var(--text-primary)' }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <ControlRoomHeader
          header={header}
          loading={loading}
          projectName={header.workspace_label}
          missionSummary={missionSummary}
        />

        <MissionKernelPanel
          missionControl={effectiveMissionControl}
          onComposerSubmit={handleComposerSubmit}
        />

        <DirectorQueuePanel
          queue={effectiveDirectorQueue}
          handoffDisabled={handoffUnsafe}
          handoffDisabledReason={handoffDisabledReason}
          isSubmitting={handoffSubmitState.submitting}
          onClaimNext={handleClaimNext}
        />

        <div
          className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
          style={{
            background: 'var(--surface-muted)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <label className="flex flex-1 flex-col gap-2 text-xs font-medium">
            <span style={{ color: 'var(--text-muted)' }}>Filtrar registros</span>
            <input
              aria-label="Filtrar registros"
              className="rounded-lg border px-3 py-2 outline-none"
              style={{
                background: 'var(--surface-app)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
              placeholder="agente, workspace, run, evidencia…"
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
            />
          </label>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setLayout('grid')}
              aria-pressed={layout === 'grid'}
              className="rounded-lg border px-3 py-2"
              style={{
                background: layout === 'grid' ? 'var(--surface-elevated)' : 'transparent',
                borderColor: 'var(--border-subtle)',
              }}
            >
              Grilla
            </button>
            <button
              type="button"
              onClick={() => setLayout('stack')}
              aria-pressed={layout === 'stack'}
              className="rounded-lg border px-3 py-2"
              style={{
                background: layout === 'stack' ? 'var(--surface-elevated)' : 'transparent',
                borderColor: 'var(--border-subtle)',
              }}
            >
              Pila
            </button>
          </div>
        </div>

        <div className={layout === 'grid' ? 'grid gap-6 xl:grid-cols-2' : 'flex flex-col gap-6'}>
          <EvidenceTimelinePanel items={evidenceTimeline} />
          <AgentsClaimsPanel agents={filteredAgents} />
          <WorkspacesPanel workspaces={filteredWorkspaces} />
          <RunsArtifactsPanel
            runs={filteredRuns}
            selectedRunId={selectedRunId}
            onSelectRun={setSelectedRunId}
          />
          <ApprovalsErrorsPanel approvals={filteredApprovals} errors={filteredErrors} />
        </div>

        <DiagnosticOverlay
          diagnostics={diagnostics}
          expanded={expandedPanels.diagnostics}
          onToggle={() =>
            setExpandedPanels((current) => ({
              ...current,
              diagnostics: !current.diagnostics,
            }))
          }
        />
      </div>
    </div>
  );
}

import {
  createControlRoomStatus,
  mergeControlRoomStatus,
  normalizeEvidenceRefs,
} from '@/lib/operations/contracts';

export function getSourceByKey(snapshot, key) {
  return snapshot?.sources?.find((source) => source.key === key) || null;
}

export function deriveSwarmControlHealthModel(snapshot = {}) {
  const processSource = getSourceByKey(snapshot, 'opencode-process');
  const queueSource = getSourceByKey(snapshot, 'queue');

  return {
    summary: snapshot.summary || { total: 0, worst_status: 'unknown' },
    process: processSource
      ? {
          status: processSource.status,
          authority: processSource.authority,
          pid: processSource.metrics?.pid ?? null,
          port: processSource.metrics?.port ?? null,
          memory_rss: processSource.metrics?.memory_rss ?? null,
          status_reason: processSource.status_reason || '',
        }
      : null,
    queue: queueSource
      ? {
          status: queueSource.status,
          authority: queueSource.authority,
          length: queueSource.metrics?.length ?? 0,
          estimated_wait_ms: queueSource.metrics?.estimated_wait_ms ?? 0,
          active_agents: queueSource.metrics?.active_agents ?? 0,
        }
      : null,
  };
}

function getProcessTone(status) {
  if (status === 'healthy') return 'success';
  if (status === 'offline') return 'danger';
  if (status === 'degraded' || status === 'stale') return 'warning';
  return 'muted';
}

function getProcessLabel(process) {
  if (!process) return 'Server sin datos';
  if (process.status === 'healthy') return 'Server OK';
  if (process.status === 'offline') return 'Server off';
  if (process.status === 'degraded' || process.status === 'stale') return 'Server degradado';
  return 'Server sin datos';
}

export function deriveSwarmHeaderModel({
  snapshot = {},
  swarmConfig = null,
  activeAgentsCount = 0,
} = {}) {
  const health = deriveSwarmControlHealthModel(snapshot);
  const process = health.process;
  const queue = health.queue || { length: 0, active_agents: 0, estimated_wait_ms: 0 };

  return {
    process,
    processLabel: getProcessLabel(process),
    processTone: getProcessTone(process?.status),
    processReason: process?.status_reason || '',
    queue,
    concurrency: {
      current: activeAgentsCount,
      max: swarmConfig?.max_concurrent_swarms ?? 0,
    },
  };
}

function pickFirstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createEmptyMissionSummary() {
  return {
    title: null,
    status: 'unknown',
    participantCount: 0,
    pendingDeliveryCount: 0,
    latestMessageSummary: null,
    activePresenceCount: 0,
    stalePresenceCount: 0,
    offlinePresenceCount: 0,
    snapshotAt: null,
    watermark: null,
  };
}

function createEmptyMissionControl() {
  return {
    mission: null,
    participants: [],
    recent_messages: [],
    latest_message: null,
    pending_deliveries: [],
    snapshot_at: null,
    watermark: null,
    presence: {
      active: [],
      stale: [],
      offline: [],
    },
  };
}

function createEmptyDirectorQueueHandoff() {
  return {
    status: 'idle',
    recipient_agent_id: null,
    message: null,
    task: null,
    workspace: null,
    run: null,
    artifact: null,
    supervisor: null,
  };
}

function createEmptyDirectorQueue() {
  return {
    authority: 'unavailable',
    freshness: 'unavailable',
    items: [],
    handoff: createEmptyDirectorQueueHandoff(),
  };
}

function normalizeMission(mission = null) {
  if (!mission) return null;

  return {
    mission_id: mission.mission_id || null,
    project_id: mission.project_id || null,
    task_id: mission.task_id || null,
    workspace_id: mission.workspace_id || null,
    run_id: mission.run_id || null,
    status: mission.status || 'unknown',
    title: mission.title || null,
    summary: mission.summary || null,
    evidence_ref: mission.evidence_ref || null,
  };
}

function normalizeMissionParticipant(participant = {}) {
  return {
    participant_id: participant.participant_id || null,
    agent_id: participant.agent_id || null,
    role_in_mission: participant.role_in_mission || null,
    status: participant.status || 'unknown',
    joined_at: participant.joined_at || null,
  };
}

function normalizeMissionMessage(message = {}) {
  return {
    message_id: message.message_id || null,
    sender_agent_id: message.sender_agent_id || null,
    message_kind: message.message_kind || null,
    body_summary: message.body_summary || null,
    created_at: message.created_at || null,
    evidence_ref: message.evidence_ref || null,
  };
}

function normalizeMissionDelivery(delivery = {}) {
  return {
    delivery_id: delivery.delivery_id || null,
    recipient_agent_id: delivery.recipient_agent_id || null,
    channel: delivery.channel || null,
    status: delivery.status || 'unknown',
    last_error: delivery.last_error || null,
    last_attempt_at: delivery.last_attempt_at || null,
    evidence_ref: delivery.evidence_ref || null,
  };
}

function normalizeMissionPresenceRow(presence = {}) {
  return {
    presence_id: presence.presence_id || null,
    agent_id: presence.agent_id || null,
    runtime_surface: presence.runtime_surface || null,
    presence_state: presence.presence_state || null,
    effective_state: presence.effective_state || 'offline',
    last_seen_at: presence.last_seen_at || null,
    expires_at: presence.expires_at || null,
    evidence_ref: presence.evidence_ref || null,
  };
}

function normalizeMissionControl(snapshot = null) {
  const missionControl = snapshot || {};
  const recentMessages = asArray(
    missionControl.recent_messages ||
      (missionControl.latest_message ? [missionControl.latest_message] : [])
  ).map(normalizeMissionMessage);
  const latestMessage = normalizeMissionMessage(
    pickFirstDefined(missionControl.latest_message, recentMessages[0]) || {}
  );

  return {
    mission: normalizeMission(missionControl.mission || null),
    participants: asArray(missionControl.participants).map(normalizeMissionParticipant),
    recent_messages: recentMessages,
    latest_message: latestMessage.message_id ? latestMessage : null,
    pending_deliveries: asArray(missionControl.pending_deliveries).map(normalizeMissionDelivery),
    snapshot_at: missionControl.snapshot_at || null,
    watermark: missionControl.watermark || null,
    presence: {
      active: asArray(missionControl.presence?.active).map(normalizeMissionPresenceRow),
      stale: asArray(missionControl.presence?.stale).map(normalizeMissionPresenceRow),
      offline: asArray(missionControl.presence?.offline).map(normalizeMissionPresenceRow),
    },
  };
}

function normalizeDirectorQueueItem(item = {}, index = 0) {
  return {
    id: item.id || null,
    title: item.title || null,
    status: item.blocked ? 'blocked' : item.status || 'unknown',
    position: Number.isFinite(item.position) ? item.position : index + 1,
    priority: item.priority || null,
    blocked_reason: pickFirstDefined(item.blocked_reason, item.blocking_dependencies?.[0]),
    supervisor: item.supervisor || null,
  };
}

function normalizeDirectorQueueHandoff(handoff = null) {
  if (!handoff) return createEmptyDirectorQueueHandoff();

  return {
    ...createEmptyDirectorQueueHandoff(),
    status: handoff.status || 'idle',
    recipient_agent_id: handoff.recipient_agent_id || null,
    message: handoff.message || null,
    task: handoff.task || null,
    workspace: handoff.workspace || null,
    run: handoff.run || null,
    artifact: handoff.artifact || null,
    supervisor: handoff.supervisor || null,
  };
}

function normalizeDirectorQueue(queue = null) {
  if (!queue) return createEmptyDirectorQueue();

  const status = statusFromRecord(queue, {
    authority: pickFirstDefined(queue.authority, 'authoritative'),
    freshness: pickFirstDefined(queue.freshness, 'degraded'),
  });

  return {
    authority: status.authority,
    freshness: status.freshness,
    items: asArray(queue.items).map(normalizeDirectorQueueItem),
    handoff: normalizeDirectorQueueHandoff(queue.handoff),
  };
}

function getMissionControlSnapshot(payload = {}) {
  return (
    payload?.mission_control ||
    payload?.control_room_snapshot_input?.mission_control ||
    payload?.control_room_input?.mission_control ||
    payload?.control_room?.mission_control ||
    null
  );
}

export function extractMissionControlPayload(payload = {}) {
  return normalizeMissionControl(getMissionControlSnapshot(payload));
}

export async function persistMissionControlComposerMessage({
  recipient_agent_ids,
  body_summary,
  fetchImpl = fetch,
} = {}) {
  const response = await fetchImpl('/api/agenthub/operations/health', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create_local_mission_message',
      recipient_agent_ids,
      body_summary,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || 'No se pudo guardar el mensaje local.');
  }

  return extractMissionControlPayload(payload);
}

const HEALTH_TO_CONTROL_ROOM_DIAGNOSTIC_KEY = Object.freeze({
  'opencode-process': 'process',
  mcp: 'mcp',
  telegram: 'telegram',
  'session-stream': 'session_stream',
});

function isMissing(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function buildMissingSourceLabel(source) {
  return source ? `${source} snapshot` : 'snapshot';
}

function mapAuthority(value) {
  if (value === 'authoritative' || value === 'inferred' || value === 'cached') {
    return value;
  }
  return 'unavailable';
}

function mapFreshness(value, hasEvidence = false) {
  if (value === 'current' || value === 'degraded' || value === 'stale' || value === 'unavailable') {
    return value;
  }

  if (typeof value === 'number') {
    if (value <= 60_000) return 'current';
    if (value <= 5 * 60_000) return 'degraded';
    return 'stale';
  }

  return hasEvidence ? 'current' : 'degraded';
}

function statusFromRecord(record = {}, fallback = {}) {
  const evidenceRefs = normalizeEvidenceRefs(
    record.evidence_refs,
    record.evidence_ref,
    fallback.evidence_refs,
    fallback.evidence_ref
  );
  const authority = mapAuthority(
    pickFirstDefined(record.authority, record.source_authority, fallback.authority)
  );
  const freshness = mapFreshness(
    pickFirstDefined(record.freshness, record.freshness_ms, fallback.freshness),
    evidenceRefs.length > 0
  );

  return createControlRoomStatus({
    authority,
    freshness,
    evidence_refs: evidenceRefs,
  });
}

function normalizeAgent(agent = {}, liveHintsByAgent = {}) {
  const liveHint = agent.agent_id ? liveHintsByAgent[agent.agent_id] || null : null;
  const status = statusFromRecord(agent, { authority: 'authoritative' });

  return {
    agent_id: agent.agent_id || null,
    task_id: pickFirstDefined(agent.task_id, agent.current_task_id),
    lease_expires_at: agent.lease_expires_at || null,
    workspace_id: pickFirstDefined(agent.workspace_id, agent.current_workspace_id),
    run_id: agent.run_id || null,
    supervisor_state: agent.supervisor_state || 'idle',
    authority: status.authority,
    freshness: status.freshness,
    evidence_ref: status.evidence_ref,
    evidence_refs: status.evidence_refs,
    missing_source: status.evidence_ref ? null : 'agent evidence',
    live_hint: liveHint
      ? {
          status: liveHint.status || null,
          authority: mapAuthority(liveHint.authority || 'cached'),
        }
      : null,
  };
}

function normalizeWorkspace(workspace = {}) {
  const status = statusFromRecord(workspace, { authority: 'authoritative' });
  const freshness = status.evidence_ref ? status.freshness : 'degraded';

  return {
    workspace_id: workspace.id || workspace.workspace_id || null,
    agent_id: workspace.agent_id || null,
    task_id: workspace.current_task_id || workspace.task_id || null,
    status: workspace.status || 'unknown',
    branch_name: workspace.branch_name || null,
    authority: status.authority,
    freshness,
    evidence_ref: status.evidence_ref,
    evidence_refs: status.evidence_refs,
    missing_source: status.evidence_ref ? null : 'workspace evidence',
  };
}

function normalizeRun(run = {}, artifactsByRun = {}, approvalGate = null) {
  const latestArtifact = (artifactsByRun[run.run_id] || [])[0] || null;
  const status = mergeControlRoomStatus(
    statusFromRecord(run, { authority: 'authoritative' }),
    latestArtifact ? statusFromRecord(latestArtifact, { authority: 'authoritative' }) : null
  );
  const riskyPendingApproval = approvalGate?.status === 'pending';

  return {
    run_id: run.run_id || null,
    workspace_id: run.workspace_id || null,
    status: run.status || 'unknown',
    authority: status.authority,
    freshness: status.freshness,
    evidence_ref: status.evidence_ref,
    evidence_refs: status.evidence_refs,
    missing_source:
      status.evidence_refs.length > 0
        ? null
        : latestArtifact
          ? 'artifact evidence'
          : 'run evidence',
    approval_gate: approvalGate,
    outcome_applied: !riskyPendingApproval,
    latest_artifact: latestArtifact
      ? {
          artifact_id: latestArtifact.artifact_id || null,
          kind: latestArtifact.kind || null,
          seq: latestArtifact.seq ?? null,
          evidence_ref: latestArtifact.evidence_ref || null,
        }
      : null,
  };
}

function normalizeApproval(approval = {}) {
  const status = statusFromRecord(approval, { authority: 'authoritative' });
  const missingSource = status.evidence_ref ? null : 'approval evidence';

  return {
    task_id: approval.task_id || null,
    workspace_id: approval.workspace_id || null,
    run_id: approval.run_id || null,
    status: approval.status || 'pending',
    reason_class: approval.reason_class || null,
    authority: status.authority,
    freshness: status.freshness,
    evidence_ref: status.evidence_ref,
    evidence_refs: status.evidence_refs,
    missing_source: missingSource,
  };
}

function normalizeAgentProfile(profile = {}) {
  const status = statusFromRecord(profile, { authority: 'authoritative' });

  return {
    agent_profile_id: profile.id || profile.agent_profile_id || null,
    agent_id: profile.agent_id || null,
    key: profile.key || profile.profile_key || null,
    label: profile.label || profile.display_name || null,
    authority: status.authority,
    freshness: status.freshness,
    evidence_ref: status.evidence_ref,
    evidence_refs: status.evidence_refs,
    missing_source: status.evidence_ref ? null : 'agent profile evidence',
  };
}

function normalizeAgentTeam(team = {}) {
  const status = statusFromRecord(team, { authority: 'authoritative' });

  return {
    team_id: team.id || team.team_id || null,
    key: team.key || team.team_key || null,
    label: team.label || team.display_name || null,
    authority: status.authority,
    freshness: status.freshness,
    evidence_ref: status.evidence_ref,
    evidence_refs: status.evidence_refs,
    missing_source: status.evidence_ref ? null : 'agent team evidence',
  };
}

function normalizeTeamMember(member = {}) {
  const status = statusFromRecord(member, { authority: 'authoritative' });

  return {
    team_member_id: member.id || member.team_member_id || null,
    team_id: member.team_id || null,
    agent_id: member.agent_id || null,
    agent_profile_id: member.agent_profile_id || member.profile_id || null,
    role: member.role || member.member_role || null,
    authority: status.authority,
    freshness: status.freshness,
    evidence_ref: status.evidence_ref,
    evidence_refs: status.evidence_refs,
    missing_source: status.evidence_ref ? null : 'team member evidence',
  };
}

function normalizeDiagnosticRecord(record = null, fallbackAuthority = 'unavailable') {
  if (!record) {
    return {
      status: 'unavailable',
      authority: 'unavailable',
      freshness: 'unavailable',
      evidence_ref: null,
      evidence_refs: [],
      missing_source: buildMissingSourceLabel(
        fallbackAuthority === 'telegram' ? 'telegram' : fallbackAuthority
      ),
    };
  }
  const status = statusFromRecord(record, { authority: fallbackAuthority });

  return {
    status: record.status || record.worst_status || 'unknown',
    authority: status.authority,
    freshness: status.freshness,
    evidence_ref: status.evidence_ref,
    evidence_refs: status.evidence_refs,
    missing_source: status.evidence_ref ? null : `${fallbackAuthority} snapshot`,
  };
}

function indexApprovals(approvals = []) {
  return approvals.reduce(
    (acc, approval) => {
      if (approval.run_id) acc.byRun[approval.run_id] = approval;
      if (approval.workspace_id) acc.byWorkspace[approval.workspace_id] = approval;
      if (approval.task_id) acc.byTask[approval.task_id] = approval;
      return acc;
    },
    { byRun: {}, byWorkspace: {}, byTask: {} }
  );
}

function indexArtifactsByRun(artifacts = []) {
  return artifacts.reduce((acc, artifact) => {
    if (!artifact?.run_id) return acc;
    acc[artifact.run_id] = acc[artifact.run_id] || [];
    acc[artifact.run_id].push(artifact);
    acc[artifact.run_id].sort((left, right) => Number(right.seq || 0) - Number(left.seq || 0));
    return acc;
  }, {});
}

function indexLiveHintsByAgent(liveHints = []) {
  return asArray(liveHints).reduce((acc, hint) => {
    if (hint?.agent_id) acc[hint.agent_id] = hint;
    return acc;
  }, {});
}

export function buildControlRoomSnapshotInputFromHealth(snapshot = {}) {
  const diagnostics = asArray(snapshot.sources).reduce((acc, source) => {
    const key = HEALTH_TO_CONTROL_ROOM_DIAGNOSTIC_KEY[source?.key];
    if (!key) return acc;
    acc[key] = source;
    return acc;
  }, {});

  return Object.keys(diagnostics).length > 0 ? { diagnostics } : null;
}

export function composeControlRoomSnapshot(input = {}) {
  const supervisor = input.supervisor || {};
  const workspaces = asArray(input.workspaces).map(normalizeWorkspace);
  const artifactsByRun = indexArtifactsByRun(asArray(input.artifacts));
  const approvals = asArray(supervisor.approvals || input.approvals).map(normalizeApproval);
  const agentProfiles = asArray(input.agent_profiles).map(normalizeAgentProfile);
  const agentTeams = asArray(input.agent_teams).map(normalizeAgentTeam);
  const teamMembers = asArray(input.team_members).map(normalizeTeamMember);
  const approvalsIndex = indexApprovals(approvals);
  const runs = asArray(input.runs).map((run) =>
    normalizeRun(
      run,
      artifactsByRun,
      approvalsIndex.byRun[run.run_id] ||
        approvalsIndex.byWorkspace[run.workspace_id] ||
        approvalsIndex.byTask[run.task_id] ||
        null
    )
  );
  const errors = asArray(supervisor.errors || input.errors);
  const liveHintsByAgent = indexLiveHintsByAgent(input.liveHints?.agents);
  const agents = asArray(supervisor.agents || input.agents).map((agent) =>
    normalizeAgent(agent, liveHintsByAgent)
  );
  const headerStatus = mergeControlRoomStatus(
    statusFromRecord(supervisor, {
      authority: 'unavailable',
      freshness: supervisor.evidence_ref ? 'current' : 'unavailable',
    }),
    ...workspaces,
    ...runs
  );

  return {
    header: {
      workspace_label: input.project?.name || input.project?.id || 'Workspace Control Room',
      supervisor_state: supervisor.supervisor_state || 'unavailable',
      active: Number(supervisor.active_agents || 0),
      max: Number(supervisor.max_agents || 0),
      queue_depth: Number(supervisor.queue_depth || 0),
      authority: headerStatus.authority,
      freshness: headerStatus.freshness,
      evidence_ref: headerStatus.evidence_ref,
      evidence_refs: headerStatus.evidence_refs,
      missing_source:
        headerStatus.evidence_refs.length > 0 || !isMissing(supervisor.supervisor_state)
          ? null
          : 'supervisor snapshot',
    },
    agents,
    workspaces,
    runs,
    approvals,
    agent_profiles: agentProfiles,
    agent_teams: agentTeams,
    team_members: teamMembers,
    diagnostics: {
      telegram: normalizeDiagnosticRecord(input.diagnostics?.telegram, 'telegram'),
      mcp: normalizeDiagnosticRecord(input.diagnostics?.mcp, 'mcp'),
      process: normalizeDiagnosticRecord(input.diagnostics?.process, 'process'),
      session_stream: normalizeDiagnosticRecord(
        input.diagnostics?.session_stream,
        'session stream'
      ),
    },
    director_queue: normalizeDirectorQueue(input.director_queue),
    mission_control: normalizeMissionControl(input.mission_control),
    errors,
  };
}

export function selectControlRoomHeader(snapshot = {}) {
  return snapshot.header || composeControlRoomSnapshot().header;
}

export function selectControlRoomAgents(snapshot = {}) {
  return asArray(snapshot.agents);
}

export function selectControlRoomWorkspaces(snapshot = {}) {
  return asArray(snapshot.workspaces);
}

export function selectControlRoomRuns(snapshot = {}) {
  return asArray(snapshot.runs);
}

export function selectControlRoomApprovals(snapshot = {}) {
  return asArray(snapshot.approvals);
}

export function selectControlRoomMission(snapshot = {}) {
  return snapshot.mission_control || createEmptyMissionControl();
}

export function selectDirectorQueue(snapshot = {}) {
  return snapshot.director_queue || createEmptyDirectorQueue();
}

export function selectDirectorMissionSummary(snapshot = {}) {
  const missionControl = selectControlRoomMission(snapshot);
  const summary = createEmptyMissionSummary();

  return {
    ...summary,
    title: missionControl.mission?.title || null,
    status: missionControl.mission?.status || summary.status,
    participantCount: asArray(missionControl.participants).length,
    pendingDeliveryCount: asArray(missionControl.pending_deliveries).length,
    latestMessageSummary: missionControl.latest_message?.body_summary || null,
    activePresenceCount: asArray(missionControl.presence?.active).length,
    stalePresenceCount: asArray(missionControl.presence?.stale).length,
    offlinePresenceCount: asArray(missionControl.presence?.offline).length,
    snapshotAt: missionControl.snapshot_at || null,
    watermark: missionControl.watermark || null,
  };
}

export function selectControlRoomAgentProfiles(snapshot = {}) {
  return asArray(snapshot.agent_profiles);
}

export function selectControlRoomAgentTeams(snapshot = {}) {
  return asArray(snapshot.agent_teams);
}

export function selectControlRoomTeamMembers(snapshot = {}) {
  return asArray(snapshot.team_members);
}

export function selectControlRoomDiagnostics(snapshot = {}) {
  return (
    snapshot.diagnostics || {
      telegram: null,
      mcp: null,
      process: null,
      session_stream: null,
    }
  );
}

export function selectControlRoomErrors(snapshot = {}) {
  return asArray(snapshot.errors);
}

export { normalizeMissionControl };

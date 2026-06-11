import {
  createControlRoomStatus,
  mergeControlRoomStatus,
  normalizeEvidenceRefs,
} from '@/lib/operations/contracts';
import { DEFAULT_OPENCODE_AGENT } from '@/lib/opencodeAgentDefaults';
import { buildPrompt } from '../sdd/SwarmPromptEngine';

/** Launchpad template: ZED + N SDD Workers (gentle-orchestrator), standby by default. */
export const ZED_ORCHESTRATOR_TEMPLATE_ID = 'zed-orchestrator-pod';

export function resolveLaunchKickoffBodySummary({
  mission,
  bootstrapMode = 'engram_first',
  launchLabel = '',
} = {}) {
  const trimmedMission = String(mission ?? '').trim();
  if (trimmedMission) return trimmedMission;

  if (bootstrapMode === 'standby') {
    return 'Modo standby — terminales listas; esperando instrucciones del operador antes de delegar trabajo.';
  }

  const label = String(launchLabel ?? '').trim();
  if (label) return label;

  return 'Kickoff durable del swarm.';
}

export function isOrchestratorRoleKey(roleKey = '') {
  const key = String(roleKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return key === 'director' || key === 'zed';
}

export function isSddWorkerRoleKey(roleKey = '') {
  const key = String(roleKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^sdd_worker_\d+$/.test(key);
}

export function buildZedSddPodTopology(workerCount = 4) {
  const count = Math.min(4, Math.max(1, Number(workerCount) || 4));
  const workerRoles = Array.from({ length: count }, (_, index) => `SDD Worker ${index + 1}`);
  return {
    label: `ZED → ${workerRoles.join(' / ')}`,
    roles: ['ZED', ...workerRoles],
    connections: workerRoles.map((worker) => `ZED → ${worker}`),
  };
}

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

function countPendingApprovals(approvals = []) {
  return asArray(approvals).filter((approval) => approval?.status === 'pending').length;
}

function buildSwarmTemplateCatalog() {
  return [
    {
      id: ZED_ORCHESTRATOR_TEMPLATE_ID,
      label: 'ZED Orchestrator Pod',
      summary:
        'ZED en standby + SDD Workers con Gentle Orchestrator. Vos conversás con ZED; él delega changes sin SDD custom.',
      readiness: 'ready-now',
      featured: true,
      tags: ['nuevo', 'zed', 'sdd', 'standby', 'orchestration'],
      category: 'orchestration',
      swarm_type_id: 'zed-orchestration-swarm',
      default_team_id: 'zed-sdd-pod',
      default_provider_id: 'minimax-coding-plan/MiniMax-M3',
      default_mission: '',
      launch_defaults: {
        bootstrapMode: 'standby',
        launchStrategy: 'director_first',
        sddEnabled: false,
        workerCount: 4,
      },
      topology: buildZedSddPodTopology(4),
    },
    {
      id: 'approval-recovery',
      label: 'Resolver aprobaciones y destrabar',
      summary: 'Volvé al swarm activo, cerrá bloqueos y seguí desde la cola durable.',
      readiness: 'ready-now',
      tags: ['active', 'approval', 'recovery'],
      category: 'recovery',
      swarm_type_id: 'recovery-swarm',
      default_team_id: 'amber-recovery-cell',
      default_provider_id: 'claude-opus-4-20250514',
      default_mission:
        'Resolver checkpoints pendientes, recuperar runs degradados y devolver la cola durable a un estado operable.',
      topology: {
        label: 'Director → Recovery Ops → QA → Director',
        roles: ['Director', 'Recovery Ops', 'QA'],
        connections: ['Director → Recovery Ops', 'Recovery Ops → QA', 'QA → Director'],
      },
    },
    {
      id: 'queue-restart',
      label: 'Retomar backlog durable',
      summary: 'Reordená la cola y elegí el siguiente foco operativo del swarm.',
      readiness: 'ready-now',
      tags: ['active', 'queue', 'focus'],
      category: 'delivery',
      swarm_type_id: 'delivery-swarm',
      default_team_id: 'amber-delivery-pod',
      default_provider_id: 'claude-sonnet-4-20250514',
      default_mission:
        'Tomar el siguiente foco durable, coordinar ejecución y dejar handoff claro para QA.',
      topology: {
        label: 'Director → Builder → QA → Director',
        roles: ['Director', 'Builder', 'QA'],
        connections: ['Director → Builder', 'Builder → QA', 'QA → Director'],
      },
    },
    {
      id: 'clean-slate',
      label: 'Arranque limpio guiado',
      summary: 'Abrí un director y cuatro agentes listos para trabajar desde el workspace actual.',
      readiness: 'ready-now',
      tags: ['idle', 'launchpad', 'template-first'],
      category: 'delivery',
      swarm_type_id: 'delivery-swarm',
      default_team_id: 'feature-delivery-team',
      default_provider_id: 'github-copilot/gpt-4o-mini',
      default_mission:
        'Lanzar un swarm de feature delivery con Director, Coder, Auditor, DevOps y Architect; validar que cada terminal abra en el workspace correcto y dejar evidencia de handoff.',
      topology: {
        label: 'Director → Coder / Auditor / DevOps / Architect',
        roles: ['Director', 'Coder', 'Auditor', 'DevOps', 'Architect'],
        connections: [
          'Director → Coder',
          'Director → Auditor',
          'Director → DevOps',
          'Director → Architect',
          'Auditor → Director',
        ],
      },
    },
  ];
}

function buildSwarmTypeCatalog() {
  return [
    {
      id: 'zed-orchestration-swarm',
      label: 'ZED Orchestration',
      summary:
        'ZED delega changes a SDD Workers (gentle-orchestrator); flujo SDD estándar por worker.',
      readiness: 'ready-now',
      defaults_preview: ['standby', 'mcp-queue', 'human-qa-gate'],
      category: 'orchestration',
      default_team_id: 'zed-sdd-pod',
      default_provider_id: 'minimax-coding-plan/MiniMax-M3',
      topology: buildZedSddPodTopology(4),
    },
    {
      id: 'delivery-swarm',
      label: 'Delivery swarm',
      summary: 'Ejecuta, valida y entrega con foco en handoff seguro.',
      readiness: 'prep-only',
      defaults_preview: ['handoff-first', 'checkpoint-safe'],
      category: 'delivery',
      default_team_id: 'feature-delivery-team',
      default_provider_id: 'github-copilot/gpt-4o-mini',
      topology: {
        label: 'Director → Coder / Auditor / DevOps / Architect',
        roles: ['Director', 'Coder', 'Auditor', 'DevOps', 'Architect'],
        connections: [
          'Director → Coder',
          'Director → Auditor',
          'Director → DevOps',
          'Director → Architect',
          'Auditor → Director',
        ],
      },
    },
    {
      id: 'recovery-swarm',
      label: 'Recovery swarm',
      summary: 'Recupera runs o workspaces degradados sin abrir configuración profunda.',
      readiness: 'prep-only',
      defaults_preview: ['approval-aware', 'durable-refresh'],
      category: 'recovery',
      default_team_id: 'amber-recovery-cell',
      default_provider_id: 'claude-opus-4-20250514',
      topology: {
        label: 'Director → Recovery Ops → Evidence → QA',
        roles: ['Director', 'Recovery Ops', 'Evidence', 'QA'],
        connections: [
          'Director → Recovery Ops',
          'Recovery Ops → Evidence',
          'Evidence → QA',
          'QA → Director',
        ],
      },
    },
    {
      id: 'research-swarm',
      label: 'Research swarm',
      summary: 'Explora contexto y arma focos antes de despachar ejecución.',
      readiness: 'prep-only',
      defaults_preview: ['context-first', 'evidence-trace'],
      category: 'research',
      default_team_id: 'launchpad-scout-team',
      default_provider_id: 'github-copilot/gpt-4o-mini',
      topology: {
        label: 'Director → Scout → Analyst → Director',
        roles: ['Director', 'Scout', 'Analyst'],
        connections: ['Director → Scout', 'Scout → Analyst', 'Analyst → Director'],
      },
    },
  ];
}

function buildSwarmLaunchCategories() {
  return [
    {
      id: 'orchestration',
      label: 'Orquestación',
      summary: 'ZED + SDD Workers en standby; delegación conversacional y SDD estándar por worker.',
    },
    {
      id: 'delivery',
      label: 'Delivery',
      summary: 'Entregar, validar y cerrar handoff sin perder contexto durable.',
    },
    {
      id: 'recovery',
      label: 'Recovery',
      summary: 'Recuperar workspaces, approvals y runs degradados con foco operativo.',
    },
    {
      id: 'research',
      label: 'Research',
      summary: 'Preparar contexto, roster y evidencia antes de despachar ejecución.',
    },
  ];
}

function buildSwarmLaunchProviders() {
  return [
    {
      id: 'minimax-coding-plan/MiniMax-M3',
      label: 'MiniMax M3',
      summary: 'Modelo por defecto para ZED Orchestrator Pod y swarms DevHub.',
    },
    {
      id: 'claude-sonnet-4-20250514',
      label: 'Claude Sonnet 4',
      summary: 'Balanceado para delivery y handoff corto.',
    },
    {
      id: 'claude-opus-4-20250514',
      label: 'Claude Opus 4',
      summary: 'Mayor criterio para recovery, approvals y decisiones delicadas.',
    },
    {
      id: 'github-copilot/gpt-4o-mini',
      label: 'GPT-4o mini (OpenAI)',
      summary: 'Modo pruebas: menor consumo por request para swarms y validación rápida.',
    },
    {
      id: 'github-copilot/gpt-4o',
      label: 'GPT-4o (OpenAI)',
      summary: 'Bueno para planning, scouting y coordinación de launchpad.',
    },
  ];
}

function buildSwarmLaunchPrograms() {
  return [
    {
      id: 'opencode',
      label: 'OpenCode',
      summary: 'Cliente recomendado para ejecución snapshot-first dentro de DevHub.',
    },
    {
      id: 'codex',
      label: 'Codex',
      summary: 'Buen fit para dirección y revisión puntual con contexto acotado.',
    },
    {
      id: 'hermes',
      label: 'Hermes',
      summary: 'Cliente alternativo para flujos simples o apoyo operativo.',
    },
    {
      id: 'zed',
      label: 'Zed / OpenCode + MiniMax M2.7',
      summary: 'Zed — Senior Architect con MiniMax M2.7 via OpenCode subscription.',
    },
  ];
}

function buildSwarmLaunchTeams() {
  return [
    {
      id: 'zed-sdd-pod',
      label: 'ZED SDD Pod',
      category: 'orchestration',
      summary: 'ZED Orchestrator + SDD Workers (gentle-orchestrator) en standby hasta delegación.',
      topology: buildZedSddPodTopology(4),
    },
    {
      id: 'feature-delivery-team',
      label: 'Feature Delivery Team',
      category: 'delivery',
      summary: 'Director central con cuatro terminal members: Coder, Auditor, DevOps y Architect.',
      topology: {
        label: 'Director → Coder / Auditor / DevOps / Architect',
        roles: ['Director', 'Coder', 'Auditor', 'DevOps', 'Architect'],
        connections: [
          'Director → Coder',
          'Director → Auditor',
          'Director → DevOps',
          'Director → Architect',
          'Coder → Auditor',
          'Auditor → Director',
        ],
      },
    },
    {
      id: 'amber-delivery-pod',
      label: 'Amber Delivery Pod',
      category: 'delivery',
      summary: 'Director, implementer y QA en circuito corto para shipping rápido.',
      topology: {
        label: 'Director → Builder → QA',
        roles: ['Director', 'Builder', 'QA'],
        connections: ['Director → Builder', 'Builder → QA', 'QA → Director'],
      },
    },
    {
      id: 'amber-recovery-cell',
      label: 'Amber Recovery Cell',
      category: 'recovery',
      summary: 'Recovery ops + evidencia + QA para desbloquear y cerrar checkpoints.',
      topology: {
        label: 'Director → Recovery Ops → Evidence → QA',
        roles: ['Director', 'Recovery Ops', 'Evidence', 'QA'],
        connections: [
          'Director → Recovery Ops',
          'Recovery Ops → Evidence',
          'Evidence → QA',
          'QA → Director',
        ],
      },
    },
    {
      id: 'launchpad-scout-team',
      label: 'Launchpad Scout Team',
      category: 'research',
      summary: 'Scout inicial para definir topología, contexto y primer vector de launch.',
      topology: {
        label: 'Director → Scout → Analyst → Builder',
        roles: ['Director', 'Scout', 'Analyst', 'Builder'],
        connections: [
          'Director → Scout',
          'Scout → Analyst',
          'Analyst → Builder',
          'Builder → Director',
        ],
      },
    },
  ];
}

function slugifyRoleKey(role = '') {
  return String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildDefaultRolePrograms(topology = null, defaultProgramId = 'opencode') {
  return asArray(topology?.roles).reduce((acc, role) => {
    const key = slugifyRoleKey(role);
    if (!key) return acc;
    acc[key] = defaultProgramId;
    return acc;
  }, {});
}

function mergeRolePrograms(defaultRolePrograms = {}, draftRolePrograms = {}) {
  return Object.entries(draftRolePrograms || {}).reduce(
    (acc, [key, value]) => {
      if (!key || !value) return acc;
      acc[key] = value;
      return acc;
    },
    { ...defaultRolePrograms }
  );
}

function buildRoleProgramPreview(topology = null, rolePrograms = {}, programs = []) {
  const programsById = new Map(asArray(programs).map((program) => [program.id, program]));

  return asArray(topology?.roles)
    .map((role) => {
      const roleKey = slugifyRoleKey(role);
      if (!roleKey) return null;

      const programId = rolePrograms?.[roleKey] || null;
      const program = programId ? programsById.get(programId) || null : null;

      return {
        role,
        role_key: roleKey,
        program_id: programId,
        program_label: program?.label || programId || null,
      };
    })
    .filter(Boolean);
}

function selectRecommendedTemplateId(snapshot = {}) {
  const approvals = countPendingApprovals(selectControlRoomApprovals(snapshot));
  const queue = selectDirectorQueue(snapshot);
  const header = selectControlRoomHeader(snapshot);

  if (approvals > 0) return 'approval-recovery';
  if (asArray(queue.items).length > 0 || Number(header.queue_depth || 0) > 0)
    return 'queue-restart';
  return ZED_ORCHESTRATOR_TEMPLATE_ID;
}

function findTemplateById(templates = [], templateId) {
  return templates.find((template) => template.id === templateId) || templates[0] || null;
}

function findTemplateBySwarmTypeId(templates = [], swarmTypeId) {
  return templates.find((template) => template.swarm_type_id === swarmTypeId) || null;
}

function findRecordById(records = [], id) {
  if (id === undefined || id === null || id === '') {
    return null;
  }
  return records.find((record) => record.id === id) || null;
}

function hasActiveSwarm(snapshot = {}) {
  const mission = selectControlRoomMission(snapshot)?.mission;
  const header = selectControlRoomHeader(snapshot);
  const directorQueue = selectDirectorQueue(snapshot);
  const agents = selectControlRoomAgents(snapshot);

  // Check if at least one agent is non-offline (stale counts as potentially live).
  // 'stale' means the agent hasn't pinged recently but is not confirmed dead.
  // Only 'offline' and 'unknown' mean the agent is confirmed gone.
  const hasNonOfflineAgent =
    agents.length > 0 &&
    agents.some((agent) => {
      const status = String(agent.supervisor_state || agent.status || '').toLowerCase();
      return status !== 'offline' && status !== 'unknown';
    });

  // If the database has an active mission, but we have agents and ALL are confirmed offline/unknown,
  // then the swarm is actually dead.
  if (mission?.status === 'active' && agents.length > 0 && !hasNonOfflineAgent) {
    return false;
  }

  return (
    (mission?.status === 'active' && (agents.length === 0 || hasNonOfflineAgent)) ||
    Number(header.active || 0) > 0 ||
    directorQueue?.handoff?.status !== 'idle'
  );
}

function buildActivePrimaryCta(snapshot = {}) {
  const directorQueue = selectDirectorQueue(snapshot);
  const pendingApprovals = countPendingApprovals(selectControlRoomApprovals(snapshot));
  const nextQueueItem = asArray(directorQueue.items)[0] || null;
  const activeHandoff = directorQueue?.handoff?.status && directorQueue.handoff.status !== 'idle';

  if (nextQueueItem || pendingApprovals > 0 || activeHandoff) {
    return {
      kind: 'anchor',
      target: 'director-queue',
      label: 'Continuar desde cola durable',
      disabled: false,
      reason: null,
    };
  }

  return {
    kind: 'action',
    target: 'terminate-swarm',
    label: 'Finalizar swarm',
    disabled: false,
    reason: null,
  };
}

function buildIdlePrimaryCta() {
  return {
    kind: 'anchor',
    target: 'launchpad-templates',
    label: 'Elegir plantilla recomendada',
    disabled: false,
    reason: null,
  };
}

function buildPrimarySurfaceStats(snapshot = {}) {
  const header = selectControlRoomHeader(snapshot);
  const mission = selectControlRoomMission(snapshot);

  return {
    activeAgents: Number(header.active || 0),
    queueDepth: Number(header.queue_depth || 0),
    pendingApprovals: countPendingApprovals(selectControlRoomApprovals(snapshot)),
    pendingDeliveries: asArray(mission.pending_deliveries).length,
  };
}

function humanizeLaunchRole(value = '') {
  const normalized = String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!normalized) return 'Agent';
  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildActiveRoster(snapshot = {}) {
  const missionControl = selectControlRoomMission(snapshot);
  const diagnostics = selectControlRoomDiagnostics(snapshot);
  const runtimeMetrics = diagnostics.runtime?.metrics || {};
  const agentsById = new Map(
    selectControlRoomAgents(snapshot).map((agent) => [agent.agent_id, agent])
  );
  const participants = asArray(missionControl.participants);

  const resolveRosterStatus = (baseStatus, agent, isDirector = false) => {
    const normalizedSupervisorState = String(agent?.supervisor_state || '').toLowerCase();
    const normalizedLiveHintStatus = String(agent?.live_hint?.status || '').toLowerCase();
    const hasLiveActivity = [
      'running',
      'working',
      'active',
      'thinking',
      'asking_questions',
    ].includes(normalizedLiveHintStatus);

    if (runtimeMetrics.quota_blocked && isDirector) {
      return 'quota-blocked';
    }

    if (normalizedSupervisorState === 'idle' && hasLiveActivity) {
      return 'stale-registry';
    }

    if (hasLiveActivity) {
      return normalizedLiveHintStatus;
    }

    if (
      Number(runtimeMetrics.stale_registry_agents || 0) > 0 &&
      normalizedSupervisorState === 'idle'
    ) {
      return 'stale-registry';
    }

    return baseStatus;
  };

  const roster =
    participants.length > 0
      ? participants.map((participant, index) => {
          const agent = agentsById.get(participant.agent_id) || {};
          const role =
            participant.role_in_mission === 'director'
              ? 'Director'
              : humanizeLaunchRole(
                  participant.agent_id?.split('-').pop() || participant.role_in_mission
                );

          return {
            id: participant.agent_id || participant.participant_id || `participant-${index}`,
            label: role,
            role,
            status: resolveRosterStatus(
              agent.supervisor_state || participant.status || 'active',
              agent,
              participant.role_in_mission === 'director'
            ),
            isDirector: participant.role_in_mission === 'director',
            workspaceId: agent.workspace_id || null,
            runId: agent.run_id || null,
            phase: agent.phase || null,
          };
        })
      : selectControlRoomAgents(snapshot).map((agent, index) => {
          const role = humanizeLaunchRole(agent.agent_id?.split('-').pop() || `Agent ${index + 1}`);

          return {
            id: agent.agent_id || `agent-${index}`,
            label: role,
            role,
            status: resolveRosterStatus(
              agent.supervisor_state || 'active',
              agent,
              /director/i.test(role)
            ),
            isDirector: /director/i.test(role),
            workspaceId: agent.workspace_id || null,
            runId: agent.run_id || null,
            phase: agent.phase || null,
          };
        });

  return roster.sort((left, right) => {
    if (left.isDirector && !right.isDirector) return -1;
    if (!left.isDirector && right.isDirector) return 1;
    return String(left.label).localeCompare(String(right.label));
  });
}

function buildActiveTopology(roster = []) {
  const director = roster.find((member) => member.isDirector) || roster[0] || null;
  const workers = roster.filter((member) => member.id !== director?.id);

  if (!director) return null;

  return {
    label: `${director.label} → ${workers.map((member) => member.label).join(' / ') || 'workers'}`,
    roles: roster.map((member) => member.label),
    connections: workers.flatMap((member) => [
      `${director.label} → ${member.label}`,
      `${member.label} → ${director.label}`,
    ]),
  };
}

function buildLaunchIdentityHealth(snapshot = {}) {
  const agents = selectControlRoomAgents(snapshot);
  const workspacesById = new Map(
    selectControlRoomWorkspaces(snapshot).map((workspace) => [workspace.workspace_id, workspace])
  );
  const runsById = new Map(selectControlRoomRuns(snapshot).map((run) => [run.run_id, run]));
  const runtimeMetrics = selectControlRoomDiagnostics(snapshot).runtime?.metrics || {};

  const issues = [];

  agents.forEach((agent) => {
    if (!agent.agent_id) return;

    if (!agent.workspace_id) {
      issues.push(`agent ${agent.agent_id} missing workspace_id`);
      return;
    }

    const workspace = workspacesById.get(agent.workspace_id);
    if (!workspace) {
      issues.push(`agent ${agent.agent_id} points to unknown workspace ${agent.workspace_id}`);
    }

    if (!agent.run_id) {
      issues.push(`agent ${agent.agent_id} missing run_id`);
      return;
    }

    const run = runsById.get(agent.run_id);
    if (!run) {
      issues.push(`agent ${agent.agent_id} points to unknown run ${agent.run_id}`);
      return;
    }

    if (run.workspace_id && agent.workspace_id && run.workspace_id !== agent.workspace_id) {
      issues.push(
        `agent ${agent.agent_id} workspace/run mismatch (${agent.workspace_id} vs ${run.workspace_id})`
      );
    }
  });

  const orphanedProcessCount = Number(runtimeMetrics.orphaned_processes || 0);
  if (orphanedProcessCount > 0) {
    issues.push(`runtime reports ${orphanedProcessCount} orphaned process(es)`);
  }

  return {
    status: issues.length > 0 ? 'degraded' : 'healthy',
    issueCount: issues.length,
    issues: issues.slice(0, 3),
  };
}

function buildActiveHero(snapshot = {}) {
  const header = selectControlRoomHeader(snapshot);
  const missionSummary = selectDirectorMissionSummary(snapshot);
  const missionControl = selectControlRoomMission(snapshot);
  const directorQueue = selectDirectorQueue(snapshot);
  const nextQueueItem = asArray(directorQueue.items)[0] || null;
  const roster = buildActiveRoster(snapshot);
  const identityHealth = buildLaunchIdentityHealth(snapshot);

  return {
    title: missionSummary.title || 'Swarm activo',
    status: missionSummary.status || 'active',
    authority: header.authority,
    freshness: header.freshness,
    primaryCta: buildActivePrimaryCta(snapshot),
    stats: buildPrimarySurfaceStats(snapshot),
    identityHealth,
    roster,
    topology: buildActiveTopology(roster),
    launchId: missionControl?.mission?.launch_id || missionControl?.mission?.mission_id || null,
    highlights: [
      missionSummary.latestMessageSummary || 'Seguí el foco activo desde la cola durable.',
      nextQueueItem?.title || 'Sin siguiente task durable confirmado.',
    ].filter(Boolean),
    nextFocus: nextQueueItem
      ? {
          title: nextQueueItem.title || 'Sin título durable',
          status: nextQueueItem.status || 'unknown',
          priority: nextQueueItem.priority || null,
        }
      : null,
  };
}

function buildIdleHero(snapshot = {}) {
  const header = selectControlRoomHeader(snapshot);
  const catalog = selectSwarmLaunchCatalog(snapshot);
  const recommendedTemplate = findTemplateById(catalog.templates, catalog.recommended_template_id);

  return {
    title: 'Lanzá un swarm nuevo',
    status: 'idle',
    authority: header.authority,
    freshness: header.freshness,
    primaryCta: buildIdlePrimaryCta(),
    stats: buildPrimarySurfaceStats(snapshot),
    highlights: [
      recommendedTemplate?.summary || 'Elegí una plantilla para arrancar sin builder profundo.',
      'Tipos y presets quedan en modo preparación, no en editor profundo.',
    ],
    recommendedTemplate,
  };
}

const PRIMARY_EVIDENCE_TIMELINE_KINDS = Object.freeze(
  new Set([
    'mission_message',
    'delivery',
    'presence',
    'run',
    'artifact',
    'supervisor_snapshot',
    'approval_checkpoint',
  ])
);

const EVIDENCE_TIMELINE_KIND_RANK = Object.freeze({
  approval_checkpoint: 0,
  supervisor_snapshot: 1,
  artifact: 2,
  run: 3,
  delivery: 4,
  presence: 5,
  mission_message: 6,
});

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

function createEmptyDirectorBriefingPreview(state = 'empty') {
  return {
    state,
    recipientIds: [],
    lines: [],
    previewText: '',
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

function isEligibleDirectorBriefingParticipant(participant = {}) {
  return Boolean(participant?.agent_id) && participant.role_in_mission !== 'director';
}

function canonicalizeDirectorBriefingRecipients(participants = [], recipientAgentIds = []) {
  const selectedIds = new Set(asArray(recipientAgentIds).filter(Boolean));

  return asArray(participants)
    .filter((participant) => selectedIds.has(participant.agent_id))
    .filter(isEligibleDirectorBriefingParticipant)
    .map((participant) => participant.agent_id);
}

function pushDirectorBriefingLine(lines, label, value) {
  if (value === undefined || value === null || value === '') return;
  lines.push(`${label}: ${value}`);
}

function countMissionPresence(presence = {}) {
  return {
    active: asArray(presence.active).length,
    stale: asArray(presence.stale).length,
    offline: asArray(presence.offline).length,
  };
}

function buildDirectorBriefingLines(missionControl = {}, recipientIds = []) {
  const lines = [];
  const presence = countMissionPresence(missionControl.presence);

  pushDirectorBriefingLine(lines, 'Mission', missionControl.mission?.title || null);
  pushDirectorBriefingLine(lines, 'Status', missionControl.mission?.status || null);
  pushDirectorBriefingLine(lines, 'Summary', missionControl.mission?.summary || null);
  pushDirectorBriefingLine(lines, 'Recipients', recipientIds.join(', '));
  pushDirectorBriefingLine(
    lines,
    'Latest message',
    missionControl.latest_message?.body_summary ||
      missionControl.recent_messages?.[0]?.body_summary ||
      null
  );
  pushDirectorBriefingLine(
    lines,
    'Pending deliveries',
    String(asArray(missionControl.pending_deliveries).length)
  );
  pushDirectorBriefingLine(
    lines,
    'Presence',
    `active ${presence.active} · stale ${presence.stale} · offline ${presence.offline}`
  );
  pushDirectorBriefingLine(lines, 'Snapshot', missionControl.snapshot_at || null);
  pushDirectorBriefingLine(lines, 'Watermark', missionControl.watermark || null);

  return lines;
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

function normalizeEvidenceTimelineLinkedIds(linkedIds = {}) {
  return {
    mission_id: linkedIds.mission_id || null,
    task_id: linkedIds.task_id || null,
    workspace_id: linkedIds.workspace_id || null,
    run_id: linkedIds.run_id || null,
    artifact_id: linkedIds.artifact_id || null,
    approval_checkpoint_key: linkedIds.approval_checkpoint_key || null,
  };
}

function normalizeSecondarySessionEvidence(item = {}) {
  return {
    source: item.source || null,
    observed_at: item.observed_at || null,
    summary: item.summary || null,
    authority: 'secondary',
    label: 'Secondary session evidence',
  };
}

function normalizeEvidenceTimelineItem(item = {}) {
  if (!PRIMARY_EVIDENCE_TIMELINE_KINDS.has(item.kind)) return null;

  const status = statusFromRecord(item, {
    authority: item.authority || 'authoritative',
    freshness: item.freshness || 'degraded',
  });

  return {
    item_id: item.item_id || null,
    kind: item.kind,
    occurred_at: item.occurred_at || null,
    authority: status.authority,
    freshness: status.freshness,
    summary: item.summary || null,
    linked_ids: normalizeEvidenceTimelineLinkedIds(item.linked_ids),
    evidence_ref: status.evidence_ref,
    evidence_refs: status.evidence_refs,
    missing_source:
      item.missing_source || (status.evidence_refs.length > 0 ? null : 'timeline evidence'),
    secondary_session_evidence: asArray(item.secondary_session_evidence).map(
      normalizeSecondarySessionEvidence
    ),
  };
}

function compareEvidenceTimelineItems(left = {}, right = {}) {
  const leftTime = left.occurred_at ? Date.parse(left.occurred_at) : Number.NEGATIVE_INFINITY;
  const rightTime = right.occurred_at ? Date.parse(right.occurred_at) : Number.NEGATIVE_INFINITY;

  if (leftTime !== rightTime) return rightTime - leftTime;

  const leftRank = EVIDENCE_TIMELINE_KIND_RANK[left.kind] ?? Number.MAX_SAFE_INTEGER;
  const rightRank = EVIDENCE_TIMELINE_KIND_RANK[right.kind] ?? Number.MAX_SAFE_INTEGER;

  if (leftRank !== rightRank) return leftRank - rightRank;

  return String(left.item_id || '').localeCompare(String(right.item_id || ''));
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
    ...(item.checkpoint_gate ? { checkpoint_gate: item.checkpoint_gate } : {}),
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

export async function performDirectorApprovalDecision({
  task_id,
  checkpoint_key,
  decision,
  workspace_id,
  run_id,
  evidence_ref,
  decision_note,
  fetchImpl = fetch,
} = {}) {
  const response = await fetchImpl('/api/agenthub/director-approval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_id,
      checkpoint_key,
      decision,
      workspace_id,
      run_id,
      evidence_ref,
      decision_note,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || 'No se pudo registrar la decisión del Director.');
  }

  return payload;
}

const HEALTH_TO_CONTROL_ROOM_DIAGNOSTIC_KEY = Object.freeze({
  'opencode-process': 'process',
  mcp: 'mcp',
  telegram: 'telegram',
  'session-stream': 'session_stream',
  'runtime-diagnostics': 'runtime',
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
    // phase: SDD phase this agent is executing (e.g. 'sdd-design', 'sdd-apply').
    // Populated by swarm infrastructure when launching with SDD context.
    // Enables SwarmPhaseBadge on agent cards in the DevHub UI.
    phase: agent.phase || null,
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
    // WSN-3 / WSN-S7: preserve naming metadata for semantic label derivation on restore
    sessionType: workspace.sessionType || null,
    swarmRole: workspace.swarmRole || null,
    swarmId: workspace.swarmId || null,
    workspace_label: workspace.workspace_label || null,
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
    checkpoint_key: approval.checkpoint_key || approval.approval_checkpoint_key || null,
    task_id: approval.task_id || null,
    workspace_id: approval.workspace_id || null,
    run_id: approval.run_id || null,
    status: approval.status || 'pending',
    reason_class: approval.reason_class || null,
    decision_note: approval.decision_note || null,
    decided_at: approval.decided_at || null,
    linked_supervisor_state: approval.linked_supervisor_state || approval.supervisor_state || null,
    linked_supervisor_outcome: approval.linked_supervisor_outcome || approval.outcome || null,
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
    metrics: record.metrics || {},
    status_reason: record.status_reason || '',
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
      runtime: normalizeDiagnosticRecord(input.diagnostics?.runtime, 'runtime diagnostics'),
    },
    director_queue: normalizeDirectorQueue(input.director_queue),
    mission_control: normalizeMissionControl(input.mission_control),
    evidence_timeline: asArray(input.evidence_timeline),
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

export function selectDirectorBriefingPreview(missionControl = null, recipientAgentIds = []) {
  if (!missionControl?.mission) return createEmptyDirectorBriefingPreview('empty');

  const requestedRecipientIds = asArray(recipientAgentIds).filter(Boolean);
  if (requestedRecipientIds.length === 0) return createEmptyDirectorBriefingPreview('empty');

  const recipientIds = canonicalizeDirectorBriefingRecipients(
    missionControl.participants,
    requestedRecipientIds
  );

  if (recipientIds.length === 0) return createEmptyDirectorBriefingPreview('unavailable');

  const lines = buildDirectorBriefingLines(missionControl, recipientIds);

  return {
    state: 'ready',
    recipientIds,
    lines,
    previewText: lines.join('\n'),
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
      runtime: null,
    }
  );
}

export function selectControlRoomEvidenceTimeline(snapshot = {}) {
  return asArray(snapshot.evidence_timeline)
    .map(normalizeEvidenceTimelineItem)
    .filter(Boolean)
    .sort(compareEvidenceTimelineItems);
}

export function selectControlRoomErrors(snapshot = {}) {
  return asArray(snapshot.errors);
}

function buildSwarmLaunchStrategies() {
  return [
    {
      id: 'director_first',
      label: 'Bootstrap director primero',
      summary: 'Prepara al Director primero y deja el fan-out explícito como segunda fase.',
    },
    {
      id: 'parallel_all',
      label: 'Paralelo todos los roles',
      summary: 'Mantiene el fan-out inmediato para todos los roles desde el launch inicial.',
    },
  ];
}

function buildSwarmBootstrapModes() {
  return [
    {
      id: 'standby',
      label: 'Standby (esperar operador)',
      summary:
        'Terminales abiertas sin trabajo. ZED y workers esperan instrucciones antes de delegar o correr SDD.',
    },
    {
      id: 'engram_first',
      label: 'Engram primero',
      summary: 'El Director arranca leyendo contexto durable antes de repartir foco.',
    },
    {
      id: 'skip_bootstrap',
      label: 'Omitir inicialización',
      summary: 'Salta el checkpoint inicial y deja constancia explícita en el trace.',
    },
  ];
}

export function selectSwarmLaunchCatalog(snapshot = {}) {
  const templates = buildSwarmTemplateCatalog();
  const categories = buildSwarmLaunchCategories();
  const providers = buildSwarmLaunchProviders();
  const programs = buildSwarmLaunchPrograms();
  const teams = buildSwarmLaunchTeams();
  const swarmTypes = buildSwarmTypeCatalog();
  const models = buildSwarmLaunchModels();
  const launchStrategies = buildSwarmLaunchStrategies();
  const bootstrapModes = buildSwarmBootstrapModes();
  const recommendedTemplateId = selectRecommendedTemplateId(snapshot);
  const recommendedTemplate = findTemplateById(templates, recommendedTemplateId);
  const orderedTemplates = [
    recommendedTemplate,
    ...templates.filter((template) => template.id !== recommendedTemplate?.id),
  ].filter(Boolean);

  return {
    authority: 'local-catalog',
    recommended_template_id: recommendedTemplateId,
    categories,
    providers,
    programs,
    teams,
    templates: orderedTemplates,
    swarm_types: swarmTypes,
    models,
    launch_strategies: launchStrategies,
    bootstrap_modes: bootstrapModes,
  };
}

export function createSwarmLaunchDraft({
  catalog = null,
  project = null,
  preferredTemplateId = null,
  preferredSwarmTypeId = null,
  draft = {},
} = {}) {
  const resolvedCatalog = catalog || selectSwarmLaunchCatalog();
  const categories = asArray(resolvedCatalog.categories);
  const providers = asArray(resolvedCatalog.providers);
  const teams = asArray(resolvedCatalog.teams);
  const templates = asArray(resolvedCatalog.templates);
  const swarmTypes = asArray(resolvedCatalog.swarm_types);
  const launchStrategies = asArray(resolvedCatalog.launch_strategies);
  const bootstrapModes = asArray(resolvedCatalog.bootstrap_modes);
  const desiredSwarmTypeId = preferredSwarmTypeId || draft.swarmTypeId || null;
  const preferredTemplateForSwarmType = desiredSwarmTypeId
    ? findTemplateBySwarmTypeId(templates, desiredSwarmTypeId)
    : null;

  const template = findTemplateById(
    templates,
    preferredTemplateId ||
      draft.templateId ||
      preferredTemplateForSwarmType?.id ||
      resolvedCatalog.recommended_template_id
  );
  const swarmType = findRecordById(swarmTypes, desiredSwarmTypeId || template?.swarm_type_id);
  const category = findRecordById(
    categories,
    draft.category || template?.category || swarmType?.category
  );
  const team = findRecordById(
    teams,
    draft.teamId || template?.default_team_id || swarmType?.default_team_id
  );
  const provider = findRecordById(
    providers,
    draft.providerId || template?.default_provider_id || swarmType?.default_provider_id
  );
  const launchStrategy =
    findRecordById(launchStrategies, draft.launchStrategy || null) ||
    findRecordById(launchStrategies, 'director_first');
  const launchDefaults = template?.launch_defaults || {};
  const bootstrapMode =
    findRecordById(bootstrapModes, draft.bootstrapMode || launchDefaults.bootstrapMode || null) ||
    findRecordById(bootstrapModes, 'engram_first');
  let topology = team?.topology || template?.topology || swarmType?.topology || null;
  const isZedPodTemplate = template?.id === ZED_ORCHESTRATOR_TEMPLATE_ID;
  const workerCount = Math.min(
    4,
    Math.max(1, Number(draft.workerCount ?? launchDefaults.workerCount ?? 4) || 4)
  );
  if (isZedPodTemplate) {
    topology = buildZedSddPodTopology(workerCount);
  }
  const rolePrograms = mergeRolePrograms(
    buildDefaultRolePrograms(topology, 'opencode'),
    draft.rolePrograms
  );
  const projectPath =
    project?.local_path || (project?.id ? `/workspace/${project.id}` : '/workspace/devhub');

  // Phase 2: SDD integration — detect if SDD mode is active
  // ZED pod: SDD runs inside gentle-orchestrator workers, not at launch.
  const sddEnabled = isZedPodTemplate
    ? false
    : draft.sddEnabled === true ||
      (draft.sddEnabled === undefined &&
        launchDefaults.sddEnabled !== false &&
        process.env.SDD_ENABLED !== 'false');
  const sddPhase = draft.phase || null;

  const DEFAULT_SWARM_MODEL = 'minimax-coding-plan/MiniMax-M3';
  const SWARM_ROLE_DEFAULT_MODELS = Object.freeze({
    director: 'minimax-coding-plan/MiniMax-M3',
    coder: 'minimax-coding-plan/MiniMax-M3',
    builder: 'minimax-coding-plan/MiniMax-M3',
    qa: 'minimax-coding-plan/MiniMax-M3',
    auditor: 'minimax-coding-plan/MiniMax-M3',
    reviewer: 'minimax-coding-plan/MiniMax-M3',
    devops: 'minimax-coding-plan/MiniMax-M3',
    recovery_ops: 'minimax-coding-plan/MiniMax-M3',
    architect: 'minimax-coding-plan/MiniMax-M3',
    scout: 'minimax-coding-plan/MiniMax-M3',
    analyst: 'minimax-coding-plan/MiniMax-M3',
    evidence: 'minimax-coding-plan/MiniMax-M3',
    zed: 'minimax-coding-plan/MiniMax-M3',
    sdd_worker_1: 'minimax-coding-plan/MiniMax-M3',
    sdd_worker_2: 'minimax-coding-plan/MiniMax-M3',
    sdd_worker_3: 'minimax-coding-plan/MiniMax-M3',
    sdd_worker_4: 'minimax-coding-plan/MiniMax-M3',
  });
  const defaultRoleModels = topology?.roles
    ? topology.roles.reduce((acc, role) => {
        const key = slugifyRoleKey(role);
        if (key) acc[key] = SWARM_ROLE_DEFAULT_MODELS[key] || DEFAULT_SWARM_MODEL;
        return acc;
      }, {})
    : {};

  return {
    mode: draft.mode || 'template',
    category: category?.id || null,
    templateId: template?.id || null,
    swarmTypeId: swarmType?.id || null,
    teamId: team?.id || null,
    providerId: provider?.id || null,
    launchStrategy: launchStrategy?.id || launchDefaults.launchStrategy || 'director_first',
    bootstrapMode: bootstrapMode?.id || launchDefaults.bootstrapMode || 'engram_first',
    workspacePath: draft.workspacePath || projectPath,
    rolePrograms,
    roleModels:
      Object.keys(draft.roleModels || {}).length > 0 ? draft.roleModels : defaultRoleModels,
    workerCount: isZedPodTemplate ? workerCount : draft.workerCount,
    mission:
      draft.mission ?? (bootstrapMode?.id === 'standby' ? '' : (template?.default_mission ?? '')),
    // Phase 2: SDD options — pass sddEnabled + sddPhase to buildAgentLaunchCommand
    // Also expose sddEnabled at top level for SwarmLaunchWizardModal checkbox binding
    sddEnabled,
    sddOptions: {
      sddEnabled,
      phase: sddPhase,
      changeName: draft.changeName || null,
    },
  };
}

export function deriveSwarmLaunchPreview({ catalog = null, draft = null } = {}) {
  const resolvedCatalog = catalog || selectSwarmLaunchCatalog();
  const resolvedDraft = createSwarmLaunchDraft({ catalog: resolvedCatalog, draft });
  const category = findRecordById(resolvedCatalog.categories, resolvedDraft.category);
  const template = findTemplateById(resolvedCatalog.templates, resolvedDraft.templateId);
  const swarmType = findRecordById(resolvedCatalog.swarm_types, resolvedDraft.swarmTypeId);
  const team = findRecordById(resolvedCatalog.teams, resolvedDraft.teamId);
  const provider = findRecordById(resolvedCatalog.providers, resolvedDraft.providerId);
  const launchStrategy = findRecordById(
    resolvedCatalog.launch_strategies,
    resolvedDraft.launchStrategy
  );
  const bootstrapMode = findRecordById(
    resolvedCatalog.bootstrap_modes,
    resolvedDraft.bootstrapMode
  );
  let topology = team?.topology || template?.topology || swarmType?.topology || null;
  if (template?.id === ZED_ORCHESTRATOR_TEMPLATE_ID) {
    topology = buildZedSddPodTopology(resolvedDraft.workerCount || 4);
  }
  const rolePrograms = buildRoleProgramPreview(
    topology,
    resolvedDraft.rolePrograms,
    resolvedCatalog.programs
  );
  const modeLabel = resolvedDraft.mode === 'custom' ? 'Equipo personalizado' : 'Equipo plantilla';

  return {
    draft: resolvedDraft,
    category,
    template,
    swarmType,
    team,
    provider,
    launchStrategy,
    bootstrapMode,
    topology,
    rolePrograms,
    modeLabel,
    launchStrategyLabel: launchStrategy?.label || 'Bootstrap director primero',
    bootstrapModeLabel: bootstrapMode?.label || 'Engram primero',
    launchLabel:
      resolvedDraft.mode === 'custom'
        ? `Lanzar ${swarmType?.label || 'swarm personalizado'}`
        : `Lanzar ${template?.label || 'equipo plantilla'}`,
    summaryLines: [
      `${modeLabel} · ${category?.label || 'Sin categoría'}`,
      `${template?.label || 'Sin plantilla'} · ${swarmType?.label || 'Sin tipo'}`,
      `${team?.label || 'Sin equipo'} · ${provider?.label || 'Sin proveedor'}`,
      resolvedDraft.workspacePath || 'Sin ruta',
      resolvedDraft.bootstrapMode === 'standby'
        ? 'Modo standby — sin misión hasta que el operador hable con ZED'
        : resolvedDraft.mission || 'Sin misión',
    ],
    isReady: Boolean(
      resolvedDraft.workspacePath?.trim() &&
      (resolvedDraft.bootstrapMode === 'standby' || resolvedDraft.mission?.trim()) &&
      category?.id &&
      template?.id &&
      swarmType?.id &&
      team?.id &&
      provider?.id
    ),
    // Phase 2: SDD options for buildAgentLaunchCommand wiring
    sddOptions: resolvedDraft.sddOptions,
  };
}

/**
 * Mapea un role_key de swarm a un perfil de agente OpenCode.
 * Director y workers visibles usan perfiles dedicados por rol.
 *
 * SDD-enhanced version: when changeName + phase are provided, wires
 * SwarmPromptEngine for Phase Contract prompts and injects SDD_ENABLED flag.
 */
export function buildRoleAgentProfile(roleKey = '', changeName = null, phase = null) {
  const normalizedKey = String(roleKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (normalizedKey === 'zed') {
    return changeName !== null && phase !== null
      ? { profileKey: 'zed-orchestrator', sddEnabled: false, phase, changeName, prompt: null }
      : 'zed-orchestrator';
  }

  if (isSddWorkerRoleKey(normalizedKey)) {
    return changeName !== null && phase !== null
      ? { profileKey: DEFAULT_OPENCODE_AGENT, sddEnabled: false, phase, changeName, prompt: null }
      : DEFAULT_OPENCODE_AGENT;
  }

  const mapping = {
    director: 'swarm-director',
    coder: 'swarm-coder',
    builder: 'swarm-coder',
    qa: 'swarm-qa',
    auditor: 'swarm-auditor',
    reviewer: 'swarm-reviewer',
    devops: 'swarm-devops',
    architect: 'swarm-architect',
    scout: 'swarm-explorer',
    analyst: 'swarm-explorer',
    recovery_ops: 'swarm-devops',
    evidence: 'swarm-explorer',
  };

  const profileKey = mapping[normalizedKey] || 'swarm-coder';

  // When changeName + phase provided, return SDD-enriched profile object
  if (changeName !== null && phase !== null) {
    const sddEnabled = process.env.SDD_ENABLED !== 'false';

    if (sddEnabled) {
      const vars = {
        change_name: changeName,
        phase,
        artifacts: 'spec, design, tasks',
        mission_id: null,
        role: roleKey,
        session_id: '{{session_id}}',
      };

      const prompt = buildPrompt(roleKey, phase, vars, { forcePhaseContract: true });

      return {
        profileKey,
        sddEnabled: true,
        phase,
        changeName,
        prompt,
      };
    }

    return { profileKey, sddEnabled: false, phase, changeName };
  }

  return profileKey;
}

/**
 * Catálogo de modelos disponibles para selección por rol en el wizard.
 */
export function buildSwarmLaunchModels() {
  return [
    {
      id: 'minimax-coding-plan/MiniMax-M3',
      label: 'MiniMax M3',
      summary: 'Modelo por token plan — mismo stack que SDD/asistente; recomendado para swarm.',
      recommended_for: [
        'director',
        'coder',
        'builder',
        'qa',
        'auditor',
        'reviewer',
        'devops',
        'architect',
        'explorer',
        'scout',
        'analyst',
        'evidence',
      ],
    },
    {
      id: 'minimax-coding-plan/MiniMax-M2.7',
      label: 'MiniMax M2.7',
      summary: 'Alternativa M2.7 — útil si M3 no está disponible en el plan.',
      recommended_for: [],
    },
    {
      id: 'opencode-go/deepseek-v4-flash',
      label: 'DeepSeek V4 Flash',
      summary: 'Mayor cantidad de requests — ideal para workers intensivos.',
      recommended_for: ['coder', 'builder', 'qa', 'devops', 'recovery_ops'],
    },
    {
      id: 'opencode-go/qwen3.6-plus',
      label: 'Qwen 3.6 Plus',
      summary: 'Balanceado para tareas generales de código.',
      recommended_for: ['director', 'auditor', 'reviewer'],
    },
    {
      id: 'opencode-go/qwen3.5-plus',
      label: 'Qwen 3.5 Plus',
      summary: 'Alternativa con buen ratio de requests.',
      recommended_for: ['explorer', 'scout', 'analyst'],
    },
    {
      id: 'opencode/claude-sonnet-4.6',
      label: 'Claude Sonnet 4.6',
      summary: 'Mayor criterio para decisiones complejas.',
      recommended_for: ['director', 'architect'],
    },
  ];
}

export function selectSwarmControlPrimarySurface(snapshot = {}) {
  const mode = hasActiveSwarm(snapshot) ? 'active' : 'idle';

  return {
    mode,
    hero: mode === 'active' ? buildActiveHero(snapshot) : buildIdleHero(snapshot),
  };
}

/**
 * Builds a FeedItem from a mission_messages row.
 * message_kind 'directive'    → operator-prompt
 * message_kind 'status'        → agent-reply  (sender is an agent)
 * Other kinds are excluded from the transcript feed.
 */
function missionMessageToFeedItem(row) {
  if (!row || !row.message_id) return null;
  const isOperator = row.message_kind === 'directive';
  const isAgent = row.message_kind === 'status';
  if (!isOperator && !isAgent) return null;

  return {
    id: `msg:${row.message_id}`,
    type: isOperator ? 'operator-prompt' : 'agent-reply',
    role: isOperator ? 'operator' : 'agent',
    text: row.body_summary || '',
    timestamp: row.created_at || null,
    occurredAt: row.created_at || null,
  };
}

/**
 * Builds a FeedItem from an agent_events row (action-executed).
 */
function agentEventToFeedItem(row) {
  if (!row || !row.id) return null;
  let status = 'running';
  let completedAt = null;
  let error = null;

  if (row.event_type === 'task_completed') {
    status = 'done';
    completedAt = row.created_at || null;
  } else if (row.event_type === 'crash_detected' || row.event_type === 'heartbeat_missed') {
    status = 'failed';
    completedAt = row.created_at || null;
    try {
      const payload = row.payload_json ? JSON.parse(row.payload_json) : {};
      error = payload?.error || payload?.reason || 'Execution failed';
    } catch {
      error = 'Execution failed';
    }
  }

  let argsSummary = '';
  try {
    const payload = row.payload_json ? JSON.parse(row.payload_json) : {};
    argsSummary = payload?.summary || payload?.next_action || payload?.tool_name || '';
  } catch {
    argsSummary = '';
  }

  return {
    id: `action:${row.id}`,
    type: 'action-executed',
    tool: row.event_type || 'unknown',
    argsSummary: String(argsSummary).slice(0, 120),
    startedAt: row.created_at || null,
    completedAt,
    status,
    error,
    occurredAt: row.created_at || null,
  };
}

/**
 * Derives progress step items from agent_events task transitions.
 * Returns { progressItems, currentStepIndex, totalSteps }
 */
function deriveProgressFromEvents(eventRows = []) {
  const taskEvents = eventRows
    .filter((e) =>
      ['task_started', 'task_progress', 'task_completed', 'needs_help', 'crash_detected'].includes(
        e.event_type
      )
    )
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  if (taskEvents.length === 0) {
    return { progressItems: [], currentStepIndex: -1, totalSteps: 0 };
  }

  const progressItems = [];
  let stepIndex = 0;
  let currentStepIndex = -1;

  for (const event of taskEvents) {
    stepIndex += 1;
    let item = null;

    if (event.event_type === 'task_started' || event.event_type === 'task_progress') {
      let stepLabel = `Step ${stepIndex}`;
      try {
        const payload = JSON.parse(event.payload_json || '{}');
        stepLabel = payload?.summary || payload?.next_action || `Step ${stepIndex}`;
      } catch {
        /* use default */
      }

      item = {
        id: `progress:${event.id}`,
        type: 'progress-active',
        stepIndex,
        totalSteps: stepIndex, // will be updated when total is known
        stepLabel,
        occurredAt: event.created_at || null,
      };
      currentStepIndex = stepIndex - 1; // 0-based index of active item
    } else if (event.event_type === 'task_completed') {
      let stepLabel = `Step ${stepIndex}`;
      try {
        const payload = JSON.parse(event.payload_json || '{}');
        stepLabel = payload?.summary || payload?.next_action || `Step ${stepIndex}`;
      } catch {
        /* use default */
      }

      item = {
        id: `progress:${event.id}`,
        type: 'progress-done',
        stepIndex,
        totalSteps: stepIndex,
        stepLabel,
        completedAt: event.created_at || null,
        occurredAt: event.created_at || null,
      };
    } else if (event.event_type === 'needs_help' || event.event_type === 'crash_detected') {
      let stepLabel = `Step ${stepIndex}`;
      let errorMsg = 'Step encountered an error';
      try {
        const payload = JSON.parse(event.payload_json || '{}');
        stepLabel = payload?.summary || payload?.next_action || `Step ${stepIndex}`;
        errorMsg = payload?.error || payload?.reason || errorMsg;
      } catch {
        /* use default */
      }

      item = {
        id: `progress:${event.id}`,
        type: 'progress-failed',
        stepIndex,
        totalSteps: stepIndex,
        stepLabel,
        error: errorMsg,
        occurredAt: event.created_at || null,
      };
    }

    if (item) progressItems.push(item);
  }

  // Update totalSteps on all progress-active items
  const totalSteps = progressItems.length;
  progressItems.forEach((item) => {
    if (item.type === 'progress-active') {
      item.totalSteps = totalSteps;
    }
  });

  return { progressItems, currentStepIndex, totalSteps };
}

/**
 * getOperatorSidebarModel — returns the operator observer sidebar feed model.
 *
 * @param {Object} opts
 * @param {string|null} opts.sessionId  — run_id of the active mission session
 * @param {string|null} opts.watermark — last seen occurredAt; returns only newer items if set
 * @param {number}     opts.limit      — max items per load (default 200)
 * @param {Function}  opts.fetchImpl   — fetch implementation (for test injection)
 */
export async function getOperatorSidebarModel({
  sessionId = null,
  watermark = null,
  limit = 200,
  fetchImpl = fetch,
} = {}) {
  try {
    const base =
      typeof window !== 'undefined' && window.location
        ? window.location.origin
        : 'http://localhost';

    // Fetch the control room snapshot which contains mission + events
    const response = await fetchImpl(
      `${base}/api/agenthub/operations/health?project_id=&_sidebar=1`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      return emptySidebarModel(sessionId);
    }

    const payload = await response.json();
    const input =
      payload.control_room_input ||
      payload.control_room_snapshot_input ||
      payload.control_room ||
      null;

    if (!input) return emptySidebarModel(sessionId);

    const missionControl = input.mission_control || {};
    const mission = missionControl.mission || null;

    // Resolve active mission
    let activeMission = null;
    if (mission?.mission_id) {
      if (!sessionId || mission.run_id === sessionId || mission.mission_id === sessionId) {
        activeMission = mission;
      }
    }

    if (!activeMission) {
      return emptySidebarModel(sessionId);
    }

    const missionId = activeMission.mission_id;

    // Fetch messages + events for this mission via the events API
    const [messagesResp, eventsResp] = await Promise.all([
      fetchImpl(
        `${base}/api/agenthub/events?mission_id=${encodeURIComponent(missionId)}&limit=${limit}`,
        { cache: 'no-store' }
      ),
      fetchImpl(
        `${base}/api/agenthub/events?mission_id=${encodeURIComponent(missionId)}&event_type=&limit=${limit}`,
        { cache: 'no-store' }
      ),
    ]);

    let messages = [];
    let events = [];

    if (messagesResp.ok) {
      const msgPayload = await messagesResp.json();
      messages = msgPayload.events || [];
    }
    if (eventsResp.ok) {
      const evtPayload = await eventsResp.json();
      events = evtPayload.events || [];
    }

    // Filter by watermark if provided
    const items = [];
    const allRaw = [
      ...messages.map((m) => ({ ...m, _kind: 'message' })),
      ...events.map((e) => ({ ...e, _kind: 'event' })),
    ];

    for (const raw of allRaw) {
      const occurredAt = raw.created_at || raw.occurred_at || null;
      if (watermark && occurredAt && occurredAt <= watermark) continue;

      if (raw._kind === 'message') {
        const item = missionMessageToFeedItem(raw);
        if (item) items.push(item);
      } else {
        const item = agentEventToFeedItem(raw);
        if (item) items.push(item);
      }
    }

    // Derive progress from events
    const { progressItems } = deriveProgressFromEvents(events);
    items.push(...progressItems);

    // Sort by occurredAt ascending
    items.sort((a, b) => {
      const ta = a.occurredAt ? Date.parse(a.occurredAt) : 0;
      const tb = b.occurredAt ? Date.parse(b.occurredAt) : 0;
      return ta - tb;
    });

    // Apply limit
    const hasMore = items.length > limit;
    const feedItems = items.slice(0, limit);

    // Compute watermark from last item
    const lastItem = feedItems[feedItems.length - 1] || null;
    const computedWatermark = lastItem?.occurredAt || null;

    // Derive current progress summary
    const activeProgress = progressItems.find((p) => p.type === 'progress-active') || null;
    const progress = activeProgress
      ? {
          currentStep: activeProgress.stepIndex,
          totalSteps: activeProgress.totalSteps,
          stepLabel: activeProgress.stepLabel,
          status: 'running',
        }
      : progressItems.length > 0
        ? {
            currentStep: progressItems[progressItems.length - 1].stepIndex,
            totalSteps: progressItems[progressItems.length - 1].totalSteps,
            stepLabel: progressItems[progressItems.length - 1].stepLabel,
            status:
              progressItems[progressItems.length - 1].type === 'progress-failed'
                ? 'failed'
                : 'done',
          }
        : null;

    return {
      sessionId: missionId,
      feedItems,
      progress,
      watermark: computedWatermark,
      hasMore,
    };
  } catch (err) {
    console.error('[getOperatorSidebarModel]', err.message);
    return emptySidebarModel(sessionId);
  }
}

function emptySidebarModel(sessionId) {
  return {
    sessionId: sessionId || null,
    feedItems: [],
    progress: null,
    watermark: null,
    hasMore: false,
  };
}

export { normalizeMissionControl };

/**
 * Selects DG bridge observable state from a snapshot.
 * DG state is managed by useDirectorGeneralBridge; this selector
 * provides a consistent derivation interface matching the existing pattern.
 *
 * @param {Object} snapshot — control room snapshot
 * @returns {Object} DG observable state subset
 */
export function selectDGObservableState(snapshot = {}) {
  return {
    activeMissionId: snapshot._dgBridge?.activeMissionId || null,
    timelineRows: snapshot._dgBridge?.timelineRows || [],
    pollingState: snapshot._dgBridge?.pollingState || 'idle',
    pendingApproval: snapshot._dgBridge?.pendingApproval || null,
    error: snapshot._dgBridge?.error || null,
  };
}

// Swarm role and panel semantic metadata model — pure helpers extracted from TerminalWorkspacesManager.jsx.

import { getSwarmSnapshotStorageKey } from '@/lib/terminal/swarmWorkspaceLifecycle';
import { getPanelIdsFromColumns, getPanelsFromColumns } from './workspaceStateModel';

const SWARM_ROLE_ORDER = [
  'coder',
  'auditor',
  'devops',
  'architect',
  'qa',
  'builder',
  'recovery_ops',
  'evidence',
  'scout',
  'analyst',
];

const SWARM_ROLE_META = {
  zed: { label: 'ZED', abbrev: 'ZED', rgb: '245,158,11' },
  director: { label: 'Director', abbrev: 'DIR', rgb: '245,158,11' },
  sdd_worker_1: { label: 'SDD Worker 1', abbrev: 'W1', rgb: '34,197,94' },
  sdd_worker_2: { label: 'SDD Worker 2', abbrev: 'W2', rgb: '52,211,153' },
  sdd_worker_3: { label: 'SDD Worker 3', abbrev: 'W3', rgb: '56,189,248' },
  sdd_worker_4: { label: 'SDD Worker 4', abbrev: 'W4', rgb: '129,140,248' },
  coder: { label: 'Coder', abbrev: 'COD', rgb: '34,197,94' },
  auditor: { label: 'Auditor', abbrev: 'AUD', rgb: '168,85,247' },
  devops: { label: 'DevOps', abbrev: 'DEV', rgb: '20,184,166' },
  architect: { label: 'Architect', abbrev: 'ARC', rgb: '96,165,250' },
  qa: { label: 'QA', abbrev: 'QA', rgb: '250,204,21' },
  builder: { label: 'Builder', abbrev: 'BLD', rgb: '34,197,94' },
  recovery_ops: { label: 'Recovery Ops', abbrev: 'REC', rgb: '251,113,133' },
  evidence: { label: 'Evidence', abbrev: 'EVD', rgb: '45,212,191' },
  scout: { label: 'Scout', abbrev: 'SCT', rgb: '56,189,248' },
  analyst: { label: 'Analyst', abbrev: 'ANL', rgb: '129,140,248' },
};

function readAgentRuns(storage) {
  if (!storage) return {};
  try {
    return JSON.parse(storage.getItem('devhub_agent_runs') || '{}');
  } catch {
    return {};
  }
}

function collectSwarmTerminateHints(storage, launchId, workspaces = []) {
  const normalizedLaunchId = String(launchId || '').trim();
  if (!normalizedLaunchId) {
    return { panel_ids: [], opencode_session_ids: [] };
  }

  const panelIds = new Set();
  const opencodeSessionIds = new Set();

  try {
    const runs = readAgentRuns(storage);
    Object.entries(runs).forEach(([taskId, run]) => {
      const taskLaunchId = String(taskId || '').split(':')[0];
      if ((run?.launchId || taskLaunchId) !== normalizedLaunchId) return;
      if (run?.panelId) panelIds.add(String(run.panelId).trim());
      if (run?.opencodeSessionId) opencodeSessionIds.add(String(run.opencodeSessionId).trim());
    });
  } catch {
    // Ignore localStorage failures.
  }

  workspaces.forEach((workspace) => {
    getPanelsFromColumns(workspace?.columns || []).forEach((panel) => {
      if (panel?.swarmContext?.launchId === normalizedLaunchId && panel?.id) {
        panelIds.add(String(panel.id).trim());
      }
    });
  });

  return {
    panel_ids: [...panelIds],
    opencode_session_ids: [...opencodeSessionIds],
  };
}

function readWorkspaceSwarmLaunchSummary(
  storage,
  workspace,
  projectId = null,
  swarmControlSnapshot = null
) {
  const workspacePanelIds = new Set(getPanelIdsFromColumns(workspace?.columns || []));

  // 1. If we have panel IDs, filter devhub_agent_runs within the workspace
  let runs = [];
  if (workspacePanelIds.size > 0) {
    runs = Object.values(readAgentRuns(storage)).filter(
      (run) =>
        run?.launchOrigin === 'swarm-control-launch' &&
        workspacePanelIds.has(String(run?.panelId || ''))
    );
  }

  // 2. If no matching runs in current workspace, search globally in all agent runs
  if (runs.length === 0) {
    runs = Object.values(readAgentRuns(storage)).filter(
      (run) => run?.launchOrigin === 'swarm-control-launch'
    );
  }

  if (runs.length > 0) {
    const groups = new Map();
    runs.forEach((run) => {
      const taskLaunchId = String(run?.taskId || '').split(':')[0];
      const launchId = run?.launchId || taskLaunchId;
      if (!launchId) return;
      const current = groups.get(launchId) || [];
      current.push(run);
      groups.set(launchId, current);
    });

    const sortedGroups = [...groups.entries()].sort(([, leftRuns], [, rightRuns]) => {
      const leftAt = Math.max(...leftRuns.map((run) => Number(run?.launchedAt) || 0));
      const rightAt = Math.max(...rightRuns.map((run) => Number(run?.launchedAt) || 0));
      return rightAt - leftAt;
    });

    const [launchId, launchRuns] = sortedGroups[0] || [null, null];

    if (launchId && launchRuns?.length) {
      const latestRun = launchRuns.reduce((latest, run) => {
        const latestAt = Number(latest?.launchedAt) || 0;
        const nextAt = Number(run?.launchedAt) || 0;
        return nextAt >= latestAt ? run : latest;
      }, launchRuns[0]);

      return {
        launchId,
        title:
          latestRun?.taskTitle?.split(' · ')?.[0] || latestRun?.taskTitle || 'Active swarm launch',
        count: launchRuns.length,
      };
    }
  }

  // 3. Fallback to cached swarm control snapshot (state or local storage)
  const snapshotToUse =
    swarmControlSnapshot ||
    (() => {
      if (projectId && storage) {
        try {
          return JSON.parse(storage.getItem(getSwarmSnapshotStorageKey(projectId)) || 'null');
        } catch {
          return null;
        }
      }
      return null;
    })();

  if (snapshotToUse) {
    const mission = snapshotToUse.mission_control?.mission || snapshotToUse.mission;
    if (mission && mission.status === 'active' && mission.mission_id) {
      return {
        launchId: mission.mission_id,
        title: mission.title || 'Swarm activo',
        count: 1,
        isFallback: true,
      };
    }
  }

  return null;
}

function getSessionRenderKey(session, fallbackPrefix, index) {
  const sessionKey = session?.id || session?.sessionId || session?.terminalId || 'session';
  const baseKey = `${fallbackPrefix}-${sessionKey}`;
  return `${baseKey}-${index}`;
}

function getAgentFromCommand(command) {
  if (!command || typeof command !== 'string') return null;
  const opencodeMatch = command.match(/--agent\s+([\w-]+)/i);
  if (opencodeMatch?.[1]) return opencodeMatch[1];
  if (command.toLowerCase().includes('gentleman')) return 'gentleman';
  if (command.toLowerCase().includes('gemini')) return 'gemini';

  // Custom detection for opencode sessions
  const opencodeSessionMatch = command.match(/opencode\s+--session\s+([\w-]+)/i);
  if (opencodeSessionMatch) return `OpenCode (${opencodeSessionMatch[1].substring(0, 6)})`;

  if (command.trim().toLowerCase() === 'opencode') return 'OpenCode';

  return null;
}

function normalizeAgentLabel(agent) {
  const raw = typeof agent === 'string' ? agent.trim() : '';
  if (!raw) return null;
  if (raw.toLowerCase() === 'opencode') return 'OpenCode';
  return raw;
}

function normalizeRoleKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function inferSwarmRoleKey(input = {}) {
  const explicit = normalizeRoleKey(input.roleKey || input.role_key);
  if (explicit) return explicit;

  const taskId = String(input.taskId || '');
  const taskRole = taskId.includes(':') ? normalizeRoleKey(taskId.split(':').pop()) : '';
  if (taskRole) return taskRole;

  const text = `${input.roleLabel || ''} ${input.taskTitle || ''} ${input.promptSummary || ''}`;
  const knownRole = Object.keys(SWARM_ROLE_META).find((roleKey) =>
    new RegExp(`\\b${roleKey.replace(/_/g, '[-_\\s]?')}\\b`, 'i').test(text)
  );
  return knownRole || '';
}

function buildSwarmRoleMetadata(input = {}) {
  const roleKey = inferSwarmRoleKey(input);
  if (!roleKey) return null;

  const fallbackLabel = String(input.roleLabel || roleKey)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const base = SWARM_ROLE_META[roleKey] || {
    label: fallbackLabel,
    abbrev: fallbackLabel.slice(0, 3).toUpperCase(),
    rgb: '148,163,184',
  };

  return {
    roleKey,
    label: input.roleLabel || base.label,
    abbrev: input.roleAbbrev || base.abbrev,
    rgb: base.rgb,
  };
}

function getSwarmRoleOrder(roleKey = '') {
  if (roleKey === 'director') return 999;
  const index = SWARM_ROLE_ORDER.indexOf(roleKey);
  return index === -1 ? 500 : index;
}

function shortenSemanticLabel(value, maxLength = 40) {
  const raw = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!raw) return null;
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function resolvePanelStartupConnectionState(panel, panelRestoreModes) {
  if (panelRestoreModes?.[panel?.id] === 'suspended') {
    return 'suspended';
  }
  return undefined;
}

function readAgentRunsByPanel(storage) {
  if (!storage) return {};

  try {
    const rawRuns = JSON.parse(storage.getItem('devhub_agent_runs') || '{}');
    const indexedRuns = {};

    Object.values(rawRuns || {}).forEach((run) => {
      const panelId = typeof run?.panelId === 'string' ? run.panelId.trim() : '';
      if (!panelId) return;

      const previous = indexedRuns[panelId];
      const nextTimestamp = Number(run?.launchedAt) || 0;
      const previousTimestamp = Number(previous?.launchedAt) || 0;

      if (!previous || nextTimestamp >= previousTimestamp) {
        indexedRuns[panelId] = run;
      }
    });

    return indexedRuns;
  } catch {
    return {};
  }
}

function derivePanelCommandMetadata(initialCommand) {
  const command = typeof initialCommand === 'string' ? initialCommand.trim() : '';
  const detectedAgent = normalizeAgentLabel(getAgentFromCommand(command));

  if (detectedAgent?.startsWith('OpenCode (')) {
    return {
      source: 'command',
      primary: detectedAgent,
      secondary: null,
      fullText: detectedAgent,
    };
  }

  if (command.toLowerCase().includes('opencode')) {
    const secondary = detectedAgent && detectedAgent !== 'OpenCode' ? detectedAgent : null;
    const fullText = secondary ? `OpenCode · ${secondary}` : 'OpenCode';
    return {
      source: 'command',
      primary: 'OpenCode',
      secondary,
      fullText,
    };
  }

  if (detectedAgent) {
    return {
      source: 'command',
      primary: detectedAgent,
      secondary: null,
      fullText: detectedAgent,
    };
  }

  const quietCommand = shortenSemanticLabel(shortenCommandSummary(command), 34);
  if (quietCommand && quietCommand !== 'Ejecucion iniciada desde terminal') {
    return {
      source: 'fallback',
      primary: 'Terminal',
      secondary: quietCommand,
      fullText: `Terminal · ${quietCommand}`,
    };
  }

  return {
    source: 'fallback',
    primary: 'Terminal',
    secondary: null,
    fullText: 'Terminal',
  };
}

function derivePanelSemanticMetadata(panel, agentRun) {
  const commandMetadata = derivePanelCommandMetadata(panel?.initialCommand);
  const panelSwarmRole = panel?.swarmRole ? buildSwarmRoleMetadata(panel.swarmRole) : null;
  if (!agentRun) {
    if (!panelSwarmRole) return commandMetadata;
    return {
      source: 'panel',
      primary: `${panelSwarmRole.label} 1`,
      secondary: commandMetadata.primary || null,
      fullText: `${panelSwarmRole.label} · ${commandMetadata.fullText || commandMetadata.primary || 'Terminal'}`,
      swarmRole: panelSwarmRole,
    };
  }

  const swarmRole = buildSwarmRoleMetadata(agentRun) || panelSwarmRole;
  const agentLabel =
    normalizeAgentLabel(agentRun?.selectedAgent) || commandMetadata.primary || 'Terminal';
  const sessionId =
    typeof agentRun?.opencodeSessionId === 'string' ? agentRun.opencodeSessionId.trim() : '';
  const taskTitle = shortenSemanticLabel(agentRun?.taskTitle, 32);
  const promptSummary = shortenSemanticLabel(agentRun?.promptSummary, 36);
  const secondary = swarmRole
    ? `${agentLabel}${promptSummary ? ` · ${promptSummary}` : ''}`
    : taskTitle || promptSummary || null;

  if (swarmRole) {
    return {
      source: 'agent-run',
      primary: `${swarmRole.label} 1`,
      secondary,
      fullText: `${swarmRole.label} · ${secondary || agentLabel}`,
      swarmRole,
    };
  }

  if (sessionId && agentLabel === 'OpenCode' && !secondary) {
    const sessionLabel = `OpenCode (${sessionId.slice(0, 6)})`;
    return {
      source: 'agent-run',
      primary: sessionLabel,
      secondary: null,
      fullText: sessionLabel,
    };
  }

  return {
    source: 'agent-run',
    primary: agentLabel,
    secondary,
    fullText: secondary ? `${agentLabel} · ${secondary}` : agentLabel,
  };
}

function shortPath(path) {
  if (!path) return '~';
  const tokens = String(path).split('/').filter(Boolean);
  if (tokens.length <= 2) return `/${tokens.join('/')}`;
  return `.../${tokens.slice(-2).join('/')}`;
}

function shortenCommandSummary(command) {
  const raw = String(command || '').trim();
  if (!raw) return 'Ejecucion iniciada desde terminal';
  if (raw.length <= 140) return raw;
  return `${raw.slice(0, 137)}...`;
}

export {
  SWARM_ROLE_ORDER,
  SWARM_ROLE_META,
  getSwarmSnapshotStorageKey,
  readAgentRuns,
  collectSwarmTerminateHints,
  readWorkspaceSwarmLaunchSummary,
  getSessionRenderKey,
  getAgentFromCommand,
  normalizeAgentLabel,
  normalizeRoleKey,
  inferSwarmRoleKey,
  buildSwarmRoleMetadata,
  getSwarmRoleOrder,
  shortenSemanticLabel,
  resolvePanelStartupConnectionState,
  readAgentRunsByPanel,
  derivePanelCommandMetadata,
  derivePanelSemanticMetadata,
  shortPath,
  shortenCommandSummary,
};

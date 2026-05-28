// Semantic metadata helpers for panel labels, agent detection, and render keys.
// Extracted from TerminalWorkspacesManager.jsx — no React dependencies.

import {
  SWARM_ROLE_META,
  inferSwarmRoleKey,
  buildSwarmRoleMetadata,
  normalizeRoleKey,
  getSwarmRoleOrder,
} from './swarmRoleMeta';

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

function shortenSemanticLabel(value, maxLength = 40) {
  const raw = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!raw) return null;
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
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

function buildUniqueRenderKey(scope, id, index, countsMap) {
  const normalizedId = String(id || 'unknown');
  const base = `${scope}-${normalizedId}`;
  const used = countsMap.get(base) || 0;
  countsMap.set(base, used + 1);
  if (used === 0) return `${base}-${index}`;
  return `${base}-${index}-${used}`;
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

export {
  getSessionRenderKey,
  getAgentFromCommand,
  normalizeAgentLabel,
  normalizeRoleKey,
  inferSwarmRoleKey,
  buildSwarmRoleMetadata,
  getSwarmRoleOrder,
  shortenSemanticLabel,
  shortPath,
  shortenCommandSummary,
  buildUniqueRenderKey,
  readAgentRunsByPanel,
  derivePanelCommandMetadata,
  derivePanelSemanticMetadata,
};

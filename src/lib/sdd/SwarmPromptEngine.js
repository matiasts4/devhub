/**
 * @module SwarmPromptEngine
 * Dual-mode prompt structure: Standard vs Phase Contract.
 * Variable interpolation for {{change_name}}, {{phase}}, {{artifacts}},
 * {{mission_id}}, {{role}}, {{session_id}}.
 * Prompt versioning support.
 */

'use strict';

const SDD_PHASES = [
  'sdd-explore',
  'sdd-propose',
  'sdd-spec',
  'sdd-design',
  'sdd-tasks',
  'sdd-apply',
  'sdd-verify',
  'sdd-archive',
];

// Phase contract mapping per role
const PHASE_CONTRACTS = {
  director: {
    executable: ['sdd-explore', 'sdd-propose', 'sdd-design'],
    delegatable: ['sdd-spec', 'sdd-tasks', 'sdd-apply', 'sdd-verify', 'sdd-archive'],
    contextBudget: 8000,
    reactivationContract:
      'Re-resolve {{mission_id}} and continue from last checkpoint. Check session_id for prior context.',
  },
  architect: {
    executable: ['sdd-design'],
    delegatable: ['sdd-spec'],
    contextBudget: 8000,
    reactivationContract: 'Resume sdd-design with artifact context from {{artifacts}}.',
  },
  coder: {
    executable: ['sdd-apply'],
    delegatable: [],
    contextBudget: 8000,
    reactivationContract:
      'Resume sdd-apply with spec/design artifacts from {{artifacts}}. Session {{session_id}}.',
  },
  explorer: {
    executable: ['sdd-explore'],
    delegatable: [],
    contextBudget: 8000,
    reactivationContract:
      'Resume sdd-explore for {{change_name}}. Produce summary handoff (200-400 tokens).',
  },
  qa: {
    executable: ['sdd-verify'],
    delegatable: [],
    contextBudget: 8000,
    reactivationContract:
      'Resume sdd-verify. Audit artifacts from {{artifacts}} for phase {{phase}}.',
  },
  reviewer: {
    executable: ['sdd-verify'],
    delegatable: [],
    contextBudget: 8000,
    reactivationContract: 'Resume code review for sdd-apply output. Check {{artifacts}} context.',
  },
  devops: {
    executable: ['sdd-apply'],
    delegatable: ['sdd-archive'],
    contextBudget: 8000,
    reactivationContract:
      'Resume worktree management. Sync phase {{phase}} on branch {{session_id}}.',
  },
  auditor: {
    executable: ['sdd-verify', 'sdd-archive'],
    delegatable: [],
    contextBudget: 8000,
    reactivationContract:
      'Resume cross-phase audit for {{change_name}}. Check all artifact phases.',
  },
  };

/**
 * Interpolate variables in a template string.
 * Variables: {{change_name}}, {{phase}}, {{artifacts}}, {{mission_id}}, {{role}}, {{session_id}}
 */
function interpolate(template, vars = {}) {
  if (!template || typeof template !== 'string') return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = vars[key];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}


/**
 * Build Phase Contract prompt section for a role.
 */
function buildPhaseContractSection(role, phase) {
  const contract = PHASE_CONTRACTS[role] || PHASE_CONTRACTS.coder;
  const executablePhases = contract.executable.join(', ');
  const delegatablePhases =
    contract.delegatable.length > 0 ? contract.delegatable.join(', ') : 'none';

  let section = `## Phase Contract

You are operating as **${role}** in SDD phase **${phase}**.

**Executable phases**: ${executablePhases}
**Delegatable phases**: ${delegatablePhases}
**Context budget**: ~${contract.contextBudget} tokens max per session
**Reactivation**: ${contract.reactivationContract}`;

  // T-9: Prepend Zed identity block when role is zed
  // (Zed role removed — block kept as placeholder for future roles needing identity injection)
  return section;
}

/**
 * Build a full Phase Contract prompt for a role + phase combination.
 */
function buildPhaseContractPrompt(role, phase, vars = {}) {
  if (!SDD_PHASES.includes(phase)) {
    throw new Error(`Invalid SDD phase: ${phase}. Must be one of: ${SDD_PHASES.join(', ')}`);
  }

  const defaults = {
    change_name: vars.change_name || 'unknown-change',
    phase: phase,
    artifacts: 'spec, design, tasks',
    mission_id: vars.mission_id || '{{mission_id}}',
    role: role,
    session_id: vars.session_id || '{{session_id}}',
  };
  const interpolatedVars = { ...defaults, ...vars };

  const contractSection = buildPhaseContractSection(role, phase);
  const contextBudgetSection = `## Context Budget

You MUST keep total prompt + context under ~8000 tokens.
If context exceeds budget, prioritize: (1) current phase spec, (2) design decisions, (3) tasks.
Summarize older artifacts to 200-400 tokens using produceSummaryHandoff().`;

  const reactivationSection = `## Reactivation Contract

To resume after interruption:
1. Re-resolve {{mission_id}} from session {{session_id}}
2. Load artifacts for current phase: ${interpolatedVars.artifacts}
3. Check last checkpoint in SessionPersistence
4. Continue from where work was left off`;

  const preamble = interpolate(
    `You are executing SDD change **{{change_name}}** as **${role}** in phase **{{phase}}**.
Mission ID: {{mission_id}}
Session ID: {{session_id}}`,
    interpolatedVars
  );

  return [preamble, contractSection, contextBudgetSection, reactivationSection].join('\n\n');
}

/**
 * Build a Standard (non-phase-contract) prompt for swarm roles.
 * Used when SDD mode is not active.
 */
function buildStandardPrompt(role, vars = {}) {
  return interpolate(
    `You are **${role}** in the DevHub swarm. Work collaboratively with the Director to accomplish the mission.\n\nMission: {{mission_id}}`,
    vars
  );
}

/**
 * Determine prompt mode: 'phase-contract' or 'standard'
 */
function getPromptMode(options = {}) {
  if (options.forcePhaseContract) return 'phase-contract';
  if (options.forceStandard) return 'standard';
  // Default: SDD is enabled unless explicitly disabled via env var
  return process.env.SDD_ENABLED !== 'false' ? 'phase-contract' : 'standard';
}

/**
 * Build the appropriate prompt based on mode and options.
 */
function buildPrompt(role, phase, vars = {}, options = {}) {
  const mode = getPromptMode(options);

  if (mode === 'phase-contract') {
    return buildPhaseContractPrompt(role, phase, vars);
  }
  return buildStandardPrompt(role, vars);
}

/**
 * Get the list of phases a role can execute directly.
 */
function getExecutablePhases(role) {
  const contract = PHASE_CONTRACTS[role];
  return contract ? contract.executable : [];
}

/**
 * Get the list of phases a role can delegate.
 */
function getDelegatablePhases(role) {
  const contract = PHASE_CONTRACTS[role];
  return contract ? contract.delegatable : [];
}

/**
 * Check if a role can execute a given phase.
 */
function canExecutePhase(role, phase) {
  return getExecutablePhases(role).includes(phase);
}

/**
 * Get context budget for a role.
 */
function getContextBudget(role) {
  const contract = PHASE_CONTRACTS[role];
  return contract ? contract.contextBudget : 8000;
}

module.exports = {
  SDD_PHASES,
  PHASE_CONTRACTS,
  interpolate,
  buildPhaseContractPrompt,
  buildStandardPrompt,
  buildPrompt,
  getPromptMode,
  getExecutablePhases,
  getDelegatablePhases,
  canExecutePhase,
  getContextBudget,
  buildPhaseContractSection,
};

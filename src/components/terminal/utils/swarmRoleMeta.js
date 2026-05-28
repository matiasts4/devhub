// Swarm role constants and pure helper functions.
// Extracted from TerminalWorkspacesManager.jsx — no React dependencies.

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
  director: { label: 'Director', abbrev: 'DIR', rgb: '245,158,11' },
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

function getSwarmSnapshotStorageKey(projectId) {
  return projectId ? `devhub_swarm_control_snapshot:${projectId}` : 'devhub_swarm_control_snapshot';
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

export {
  SWARM_ROLE_ORDER,
  SWARM_ROLE_META,
  getSwarmSnapshotStorageKey,
  normalizeRoleKey,
  inferSwarmRoleKey,
  buildSwarmRoleMetadata,
  getSwarmRoleOrder,
};

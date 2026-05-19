const AGENT_RUN_STATUSES = [
  'planned',
  'running',
  'paused',
  'succeeded',
  'failed',
  'aborted',
  'superseded',
];

const TERMINAL_AGENT_RUN_STATUSES = ['succeeded', 'failed', 'aborted', 'superseded'];

const AGENT_ARTIFACT_PHASES = ['prepare', 'execute', 'qa', 'cleanup', 'recovery'];

const AGENT_ARTIFACT_PRODUCERS = ['executor', 'devhub', 'qa', 'supervisor'];

const AGENT_ARTIFACT_KINDS = [
  'workspace.prepared',
  'workspace.drift',
  'workspace.cleanup',
  'git.branch',
  'git.commit',
  'git.merge',
  'git.checkout',
  'command.exec',
  'test.result',
  'diff.patch',
  'qa.result',
  'attachment.log',
  'attachment.file',
  'decision.note',
  'error.report',
];

function isAgentRunStatus(value) {
  return AGENT_RUN_STATUSES.includes(value);
}

function isTerminalAgentRunStatus(value) {
  return TERMINAL_AGENT_RUN_STATUSES.includes(value);
}

function isAgentArtifactPhase(value) {
  return AGENT_ARTIFACT_PHASES.includes(value);
}

function isAgentArtifactProducer(value) {
  return AGENT_ARTIFACT_PRODUCERS.includes(value);
}

function isAgentArtifactKind(value) {
  return AGENT_ARTIFACT_KINDS.includes(value);
}

function normalizeEvidenceRef(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') {
    throw new Error('evidence_ref debe ser string u objeto estructurado.');
  }

  const normalized = {
    kind: String(value.kind || '').trim(),
    locator: String(value.locator || '').trim(),
  };

  if (!normalized.kind || !normalized.locator) {
    throw new Error('evidence_ref estructurado requiere kind y locator.');
  }

  if (value.version != null && String(value.version).trim()) {
    normalized.version = String(value.version).trim();
  }

  return JSON.stringify(normalized);
}

function parseEvidenceRef(value) {
  if (!value) {
    return {
      kind: null,
      locator: null,
      version: null,
    };
  }

  if (typeof value === 'object') {
    return {
      kind: value.kind || null,
      locator: value.locator || null,
      version: value.version || null,
    };
  }

  try {
    const parsed = JSON.parse(String(value));
    if (parsed && typeof parsed === 'object' && parsed.kind && parsed.locator) {
      return {
        kind: parsed.kind,
        locator: parsed.locator,
        version: parsed.version || null,
      };
    }
  } catch {
    // legacy opaque ref — keep raw locator
  }

  return {
    kind: 'legacy-opaque',
    locator: String(value),
    version: null,
  };
}

function validateAgentArtifactInput(input = {}) {
  if (!isAgentArtifactPhase(input.phase)) {
    throw new Error(`Artifact phase inválida: ${input.phase}`);
  }
  if (!isAgentArtifactKind(input.kind)) {
    throw new Error(`Artifact kind inválido: ${input.kind}`);
  }
  if (!isAgentArtifactProducer(input.producer)) {
    throw new Error(`Artifact producer inválido: ${input.producer}`);
  }
  if (!String(input.summary || '').trim()) {
    throw new Error('Artifact summary es requerido.');
  }
}

module.exports = {
  AGENT_RUN_STATUSES,
  TERMINAL_AGENT_RUN_STATUSES,
  AGENT_ARTIFACT_PHASES,
  AGENT_ARTIFACT_PRODUCERS,
  AGENT_ARTIFACT_KINDS,
  isAgentRunStatus,
  isTerminalAgentRunStatus,
  isAgentArtifactPhase,
  isAgentArtifactProducer,
  isAgentArtifactKind,
  normalizeEvidenceRef,
  parseEvidenceRef,
  validateAgentArtifactInput,
};

const GIT_CHECKPOINT_PREFIX = '[git:checkpoint]';
const CHECKPOINT_WORKTREE_VALUES = new Set(['clean', 'dirty-excluded']);
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;
const ANALYSIS_ONLY_PATTERN =
  /\b(analysis|analysis-only|investigation|investigaci[oó]n|an[aá]lisis)\b/i;

function parseBracketList(raw = '') {
  const trimmed = String(raw || '').trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [];
  return trimmed
    .slice(1, -1)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseCheckpointFields(raw = '') {
  const fields = {};
  const fieldPattern = /(\w+)=("([^"]*)"|\[[^\]]*\]|[^\s]+)/g;
  let match;

  while ((match = fieldPattern.exec(raw))) {
    const [, key, token, quoted] = match;
    fields[key] = quoted ?? token;
  }

  return fields;
}

function parseGitCheckpointComment(content = '') {
  const text = String(content || '').trim();
  if (!text.startsWith(GIT_CHECKPOINT_PREFIX)) return null;

  const fields = parseCheckpointFields(text.slice(GIT_CHECKPOINT_PREFIX.length).trim());
  const docs = parseBracketList(fields.docs || '[]');
  const checks = parseBracketList(fields.checks || '[]');

  return {
    raw: text,
    commit: fields.commit || null,
    worktree: fields.worktree || null,
    summary: fields.summary || null,
    docs,
    checks,
    reason: fields.reason || null,
    excluded: parseBracketList(fields.excluded || '[]'),
    parsed_fields: fields,
  };
}

function buildCheckpointGateResult({
  ok,
  code,
  message,
  remediation = null,
  checkpoint = null,
  missing_fields = [],
}) {
  return {
    ok,
    status: ok ? 'accepted' : 'blocked',
    code,
    message,
    remediation,
    checkpoint,
    missing_fields,
  };
}

function getCheckpointChangedWorkEvidence(checkpoint = null) {
  if (!checkpoint) return false;
  if (checkpoint.commit && checkpoint.commit !== 'none') return true;
  if ((checkpoint.docs || []).some((doc) => String(doc).toLowerCase() !== 'none')) return true;
  if (checkpoint.worktree === 'dirty-excluded') return true;
  return false;
}

function isAnalysisOnlyTask(task = {}) {
  const haystack = [task.title, task.description, task.summary].filter(Boolean).join(' ');
  return ANALYSIS_ONLY_PATTERN.test(haystack);
}

function validateCheckpointShape(checkpoint) {
  if (!checkpoint) {
    return buildCheckpointGateResult({
      ok: false,
      code: 'missing-git-checkpoint',
      message: 'Falta comentario [git:checkpoint] para este handoff.',
      remediation:
        'Agregá [git:checkpoint] con commit=<sha|none>, docs=[...], checks=[...] y worktree=<clean|dirty-excluded>.',
    });
  }

  const missingFields = [];
  if (!checkpoint.commit) missingFields.push('commit');
  if (!checkpoint.worktree) missingFields.push('worktree');
  if (!checkpoint.docs?.length) missingFields.push('docs');
  if (!checkpoint.checks?.length) missingFields.push('checks');

  if (missingFields.length > 0) {
    return buildCheckpointGateResult({
      ok: false,
      code: 'checkpoint-incomplete',
      message: `El checkpoint está incompleto: faltan ${missingFields.join(', ')}.`,
      remediation:
        'Completá el comentario [git:checkpoint] con commit, docs, checks y worktree antes de cerrar el handoff.',
      checkpoint,
      missing_fields: missingFields,
    });
  }

  if (!CHECKPOINT_WORKTREE_VALUES.has(checkpoint.worktree)) {
    return buildCheckpointGateResult({
      ok: false,
      code: 'checkpoint-invalid-worktree',
      message: `worktree inválido: ${checkpoint.worktree}.`,
      remediation: 'Usá worktree=clean o worktree=dirty-excluded.',
      checkpoint,
    });
  }

  if (checkpoint.commit !== 'none' && !SHA_PATTERN.test(checkpoint.commit)) {
    return buildCheckpointGateResult({
      ok: false,
      code: 'checkpoint-invalid-commit',
      message: `commit inválido: ${checkpoint.commit}.`,
      remediation: 'Usá un SHA local trazable o commit=none sólo para análisis sin cambios.',
      checkpoint,
    });
  }

  if (
    (checkpoint.commit === 'none' || checkpoint.worktree === 'dirty-excluded') &&
    !checkpoint.reason
  ) {
    return buildCheckpointGateResult({
      ok: false,
      code: 'checkpoint-reason-required',
      message: 'reason es obligatorio cuando commit=none o worktree=dirty-excluded.',
      remediation: 'Agregá reason="..." explicando por qué no hubo commit o qué quedó excluido.',
      checkpoint,
    });
  }

  return null;
}

function validateCheckpointHandoff({
  task,
  checkpoint,
  latestComment = null,
  handoffKind = 'completed',
  minCreatedAt = null,
} = {}) {
  const shapeError = validateCheckpointShape(checkpoint);
  if (shapeError) return shapeError;

  if (minCreatedAt && latestComment?.created_at) {
    const checkpointMs = Date.parse(latestComment.created_at);
    const minMs = Date.parse(minCreatedAt);
    if (Number.isFinite(checkpointMs) && Number.isFinite(minMs) && checkpointMs < minMs) {
      return buildCheckpointGateResult({
        ok: false,
        code: 'checkpoint-stale',
        message: `El último [git:checkpoint] quedó viejo para el handoff ${handoffKind}.`,
        remediation:
          'Registrá un nuevo [git:checkpoint] ligado al intento actual antes de finalizar QA o cerrar la tarea.',
        checkpoint,
      });
    }
  }

  if (checkpoint.commit === 'none') {
    if (!isAnalysisOnlyTask(task)) {
      return buildCheckpointGateResult({
        ok: false,
        code: 'checkpoint-commit-none-analysis-only',
        message: 'commit=none sólo es válido para tareas de análisis/investigación sin cambios.',
        remediation: 'Creá un local checkpoint commit antes de marcar completed o cerrar QA.',
        checkpoint,
      });
    }

    if (getCheckpointChangedWorkEvidence(checkpoint)) {
      return buildCheckpointGateResult({
        ok: false,
        code: 'checkpoint-commit-none-changed-work',
        message:
          'commit=none no aplica cuando el handoff muestra trabajo cambiado o paths tocados.',
        remediation: 'Creá un local checkpoint commit y registralo en [git:checkpoint].',
        checkpoint,
      });
    }
  }

  return buildCheckpointGateResult({
    ok: true,
    code: 'checkpoint-accepted',
    message: `Checkpoint válido para ${handoffKind}.`,
    checkpoint,
  });
}

module.exports = {
  GIT_CHECKPOINT_PREFIX,
  parseGitCheckpointComment,
  validateCheckpointHandoff,
  isAnalysisOnlyTask,
  getCheckpointChangedWorkEvidence,
};

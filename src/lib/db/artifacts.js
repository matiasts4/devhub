'use strict';
/**
 * @module artifacts
 * Agent artifact persistence — append-only evidence trail for agent runs.
 */
const crypto = require('crypto');
const { getDb, resolveDbArgs, getAgentRunById } = require('./core');
const {
  normalizeEvidenceRef,
  parseEvidenceRef,
  validateAgentArtifactInput,
} = require('./agentRunArtifacts');

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

function listAgentArtifacts(dbOrRunId, maybeRunId) {
  const hasDb = dbOrRunId && typeof dbOrRunId.prepare === 'function';
  const db = hasDb ? dbOrRunId : getDb();
  const runId = hasDb ? maybeRunId : dbOrRunId;
  return db
    .prepare('SELECT * FROM agent_artifacts WHERE run_id = ? ORDER BY seq ASC, created_at ASC')
    .all(runId);
}

function getLatestAgentArtifactForRun(dbOrRunId, maybeRunId) {
  const hasDb = dbOrRunId && typeof dbOrRunId.prepare === 'function';
  const db = hasDb ? dbOrRunId : getDb();
  const runId = hasDb ? maybeRunId : dbOrRunId;
  return (
    db
      .prepare(
        'SELECT * FROM agent_artifacts WHERE run_id = ? ORDER BY seq DESC, created_at DESC LIMIT 1'
      )
      .get(runId) || null
  );
}

function appendAgentArtifact(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.run_id) throw new Error('run_id es requerido para agent_artifacts.');
  const run = getAgentRunById(db, input.run_id);
  if (!run) throw new Error(`agent_run ${input.run_id} no encontrado.`);

  validateAgentArtifactInput(input);
  const normalizedEvidenceRef = normalizeEvidenceRef(input.evidence_ref);
  const parsedEvidenceRef = parseEvidenceRef(normalizedEvidenceRef);
  const previous = getLatestAgentArtifactForRun(db, input.run_id);
  const nextSeq = input.seq || (previous?.seq || 0) + 1;
  if (previous && nextSeq <= previous.seq) {
    throw new Error(`agent_artifacts seq inválido para ${input.run_id}: ${nextSeq}`);
  }

  if (input.parent_artifact_id) {
    const parent = db
      .prepare('SELECT run_id FROM agent_artifacts WHERE artifact_id = ? LIMIT 1')
      .get(input.parent_artifact_id);
    if (!parent || parent.run_id !== input.run_id) {
      throw new Error(`parent_artifact_id inválido para ${input.parent_artifact_id}`);
    }
  }

  if (input.supersedes_artifact_id) {
    const supersedes = db
      .prepare('SELECT run_id FROM agent_artifacts WHERE artifact_id = ? LIMIT 1')
      .get(input.supersedes_artifact_id);
    if (!supersedes || supersedes.run_id !== input.run_id) {
      throw new Error(`supersedes_artifact_id inválido para ${input.supersedes_artifact_id}`);
    }
  }

  const integrity = input.integrity || {};
  const row = {
    artifact_id: input.artifact_id || crypto.randomUUID(),
    run_id: input.run_id,
    seq: nextSeq,
    phase: input.phase,
    kind: input.kind,
    producer: input.producer,
    summary: String(input.summary).trim(),
    evidence_ref: normalizedEvidenceRef,
    evidence_kind: parsedEvidenceRef.kind,
    evidence_locator: parsedEvidenceRef.locator,
    evidence_version: parsedEvidenceRef.version,
    parent_artifact_id: input.parent_artifact_id || null,
    supersedes_artifact_id: input.supersedes_artifact_id || null,
    content_digest: integrity.content_digest || null,
    locator_version: integrity.locator_version || null,
    observed_at: integrity.observed_at || input.observed_at || new Date().toISOString(),
  };

  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO agent_artifacts (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key] ?? null));

  return db
    .prepare('SELECT * FROM agent_artifacts WHERE artifact_id = ? LIMIT 1')
    .get(row.artifact_id);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  listAgentArtifacts,
  getLatestAgentArtifactForRun,
  appendAgentArtifact,
};

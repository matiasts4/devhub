import { NextResponse } from 'next/server';
import {
  getDb,
  getLatestAgentArtifactForRun,
  getLatestAgentRunForTask,
  getLatestAgentRunForWorkspace,
  getSupervisorApprovalCheckpoint,
  getSupervisorSnapshot,
  listAgentRuns,
  upsertSupervisorApprovalCheckpoint,
  upsertSupervisorSnapshot,
} from '@/lib/db/localDb';
import { evaluateSupervisorSnapshot } from '@/lib/swarm/supervisorLoop';
import { gatherOperationalHealth } from '@/app/api/agenthub/operations/health/route';

export const runtime = 'nodejs';

const DECISION_TO_STATUS = Object.freeze({
  approve: 'approved',
  reject: 'rejected',
});

function badRequest(error) {
  return NextResponse.json({ error }, { status: 400 });
}

function conflict(error, details = {}) {
  return NextResponse.json({ error, ...details }, { status: 409 });
}

function readTask(db, taskId) {
  return db.tables?.tasks?.single?.({ where: [['id', '=', taskId]] }) || null;
}

function readWorkspace(db, workspaceId) {
  if (!workspaceId) return null;
  return db.tables?.agent_workspaces?.single?.({ where: [['id', '=', workspaceId]] }) || null;
}

function validatePayload(body = {}) {
  const payload = {
    task_id: typeof body.task_id === 'string' ? body.task_id.trim() : '',
    checkpoint_key: typeof body.checkpoint_key === 'string' ? body.checkpoint_key.trim() : '',
    decision: typeof body.decision === 'string' ? body.decision.trim() : '',
    workspace_id: typeof body.workspace_id === 'string' ? body.workspace_id.trim() : '',
    run_id: typeof body.run_id === 'string' ? body.run_id.trim() : '',
    evidence_ref: typeof body.evidence_ref === 'string' ? body.evidence_ref.trim() : '',
    decision_note: typeof body.decision_note === 'string' ? body.decision_note.trim() : '',
  };

  if (!payload.task_id) return { error: 'task_id es requerido.' };
  if (!payload.checkpoint_key) return { error: 'checkpoint_key es requerido.' };
  if (!payload.decision) return { error: 'decision es requerido.' };
  if (!DECISION_TO_STATUS[payload.decision]) {
    return { error: 'decision inválida. Usá approve o reject.' };
  }

  return { payload };
}

function ensureLinkageMatches({ payload, snapshot, checkpoint }) {
  const expectedWorkspaceId = checkpoint.workspace_id || snapshot.workspace_id || null;
  const expectedRunId = checkpoint.run_id || snapshot.run_id || null;
  const expectedEvidenceRef = checkpoint.evidence_ref || snapshot.evidence_ref || null;

  if (payload.workspace_id && payload.workspace_id !== expectedWorkspaceId) {
    return 'La linkage durable cambió: workspace_id ya no coincide.';
  }
  if (payload.run_id && payload.run_id !== expectedRunId) {
    return 'La linkage durable cambió: run_id ya no coincide.';
  }
  if (payload.evidence_ref && expectedEvidenceRef && payload.evidence_ref !== expectedEvidenceRef) {
    return 'La linkage durable cambió: evidence_ref ya no coincide.';
  }

  return null;
}

function resolveLatestRun(db, taskId, workspaceId, dependencies = {}) {
  const readRunForWorkspace =
    dependencies.getLatestAgentRunForWorkspace || getLatestAgentRunForWorkspace;
  const readRunForTask = dependencies.getLatestAgentRunForTask || getLatestAgentRunForTask;

  return readRunForWorkspace(db, workspaceId) || readRunForTask(db, taskId) || null;
}

export async function POST(request, _context, dependencies = {}) {
  try {
    const body = await request.json();
    const validation = validatePayload(body);
    if (validation.error) return badRequest(validation.error);

    const { payload } = validation;
    const now = new Date().toISOString();
    const db = dependencies.getDb ? dependencies.getDb() : getDb();
    const task = readTask(db, payload.task_id);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const readSnapshot = dependencies.getSupervisorSnapshot || getSupervisorSnapshot;
    const readCheckpoint =
      dependencies.getSupervisorApprovalCheckpoint || getSupervisorApprovalCheckpoint;
    const snapshot = readSnapshot(db, payload.task_id);

    if (!snapshot || snapshot.supervisor_state !== 'awaiting_approval') {
      return conflict('Supervisor snapshot ya no está awaiting_approval.', {
        supervisor: snapshot || null,
      });
    }

    if (snapshot.approval_checkpoint_key !== payload.checkpoint_key) {
      return conflict('La linkage durable cambió: checkpoint_key ya no coincide.', {
        supervisor: snapshot,
      });
    }

    const checkpoint = readCheckpoint(db, payload.checkpoint_key);
    if (!checkpoint || checkpoint.task_id !== payload.task_id) {
      return conflict('Checkpoint durable ausente o relinked.', {
        supervisor: snapshot,
        checkpoint: checkpoint || null,
      });
    }

    if (checkpoint.status !== 'pending') {
      return conflict('Checkpoint durable ya no está pending.', {
        supervisor: snapshot,
        checkpoint,
      });
    }

    const linkageError = ensureLinkageMatches({ payload, snapshot, checkpoint });
    if (linkageError) {
      return conflict(linkageError, {
        supervisor: snapshot,
        checkpoint,
      });
    }

    const status = DECISION_TO_STATUS[payload.decision];
    const finalWorkspaceId =
      checkpoint.workspace_id || snapshot.workspace_id || payload.workspace_id || null;
    const workspace = readWorkspace(db, finalWorkspaceId);
    const latestRun = resolveLatestRun(db, payload.task_id, finalWorkspaceId, dependencies);
    const latestArtifact = latestRun?.run_id
      ? (dependencies.getLatestAgentArtifactForRun || getLatestAgentArtifactForRun)(
          db,
          latestRun.run_id
        )
      : null;
    const runFacts =
      (dependencies.listAgentRuns || listAgentRuns)(db, { task_id: payload.task_id }) || [];
    const updatedCheckpoint = (
      dependencies.upsertSupervisorApprovalCheckpoint || upsertSupervisorApprovalCheckpoint
    )(db, {
      checkpoint_key: checkpoint.checkpoint_key,
      task_id: checkpoint.task_id,
      workspace_id:
        checkpoint.workspace_id || snapshot.workspace_id || payload.workspace_id || null,
      run_id: checkpoint.run_id || latestRun?.run_id || snapshot.run_id || payload.run_id || null,
      reason_class: checkpoint.reason_class,
      evidence_ref:
        checkpoint.evidence_ref || snapshot.evidence_ref || payload.evidence_ref || null,
      status,
      decision_note: payload.decision_note || null,
      decided_at: now,
      updated_at: now,
    });

    const nextSupervisor = (dependencies.evaluateSupervisorSnapshot || evaluateSupervisorSnapshot)({
      task,
      workspace,
      latestRun,
      latestArtifact,
      runFacts,
      existingSnapshot: snapshot,
      approvalCheckpoint: updatedCheckpoint,
      staleLeaseObserved: false,
    });

    const persistedSupervisor = (dependencies.upsertSupervisorSnapshot || upsertSupervisorSnapshot)(
      db,
      {
        ...nextSupervisor,
        updated_at: now,
      }
    );

    const refreshed = await (dependencies.gatherOperationalHealth || gatherOperationalHealth)(
      {},
      request
    );

    return NextResponse.json({
      success: true,
      checkpoint: updatedCheckpoint,
      supervisor: persistedSupervisor,
      control_room_snapshot_input: refreshed?.control_room_snapshot_input || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Director approval failed.' },
      { status: 500 }
    );
  }
}

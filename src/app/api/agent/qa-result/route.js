import { NextResponse } from 'next/server';
import {
  getDb,
  getLatestAgentRunForWorkspace,
  getLatestAgentRunForTask,
  getLatestTaskComment,
  getSupervisorSnapshot,
  getSupervisorApprovalCheckpoint,
  upsertSupervisorApprovalCheckpoint,
  upsertSupervisorSnapshot,
  updateAgentRunTerminal,
  appendAgentArtifact,
} from '@/lib/db/localDb';
import {
  parseGitCheckpointComment,
  validateCheckpointHandoff,
} from '@/lib/gitCheckpointHandoff.js';

function resolveRun(db, { workspace_id, task_id }) {
  return (
    getLatestAgentRunForWorkspace(db, workspace_id) || getLatestAgentRunForTask(db, task_id) || null
  );
}

function appendQaArtifact(db, runId, { result, reasons, evidence_ref }) {
  if (!runId) return null;
  return appendAgentArtifact(db, {
    run_id: runId,
    phase: 'qa',
    kind: 'qa.result',
    producer: 'qa',
    summary: `QA ${result}${reasons?.length ? `: ${reasons.join(' | ')}` : ''}`,
    evidence_ref: evidence_ref || `qa://${runId}/${result}`,
    integrity: {
      observed_at: new Date().toISOString(),
    },
  });
}

function buildDecisionNote(reasons = [], fallback) {
  return reasons?.length ? reasons.join(' | ') : fallback;
}

function buildQaCheckpointGate(db, task, { handoffKind = 'qa-ready', evidence_ref = null } = {}) {
  const latestComment = getLatestTaskComment(db, task?.id);
  const checkpoint = latestComment ? parseGitCheckpointComment(latestComment.content) : null;
  return validateCheckpointHandoff({
    task,
    checkpoint,
    latestComment,
    handoffKind,
    minCreatedAt: evidence_ref || null,
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { task_id, result, reasons, workspace_id, evidence_ref } = body;

    if (!task_id || !result) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getDb();
    const task = db.tables.tasks.single({
      where: [['id', '=', task_id]],
    });
    const run = resolveRun(db, { workspace_id, task_id });
    const supervisor = getSupervisorSnapshot(db, task_id);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (!supervisor || supervisor.supervisor_state !== 'awaiting_approval') {
      return NextResponse.json(
        {
          error: 'Supervisor is not awaiting a human approval decision for this task',
          supervisor: supervisor || null,
        },
        { status: 409 }
      );
    }

    const approvalCheckpoint = supervisor.approval_checkpoint_key
      ? getSupervisorApprovalCheckpoint(db, supervisor.approval_checkpoint_key)
      : null;

    if (!approvalCheckpoint || approvalCheckpoint.status !== 'pending') {
      return NextResponse.json(
        {
          error: 'Supervisor approval checkpoint is missing or no longer pending',
          supervisor: supervisor || null,
        },
        { status: 409 }
      );
    }

    if (result === 'approved') {
      const checkpointGate = buildQaCheckpointGate(db, task, {
        handoffKind: 'qa-ready',
        evidence_ref,
      });
      if (!checkpointGate.ok) {
        return NextResponse.json(
          {
            error: checkpointGate.message,
            code: checkpointGate.code,
            remediation: checkpointGate.remediation || null,
            checkpoint_gate: checkpointGate,
          },
          { status: 409 }
        );
      }

      const decidedAt = new Date().toISOString();
      const decisionNote = buildDecisionNote(reasons, 'Approved');
      const checkpoint = upsertSupervisorApprovalCheckpoint(db, {
        checkpoint_key: approvalCheckpoint.checkpoint_key,
        task_id,
        workspace_id: workspace_id || supervisor.workspace_id || approvalCheckpoint.workspace_id,
        run_id: run?.run_id || supervisor.run_id || approvalCheckpoint.run_id,
        reason_class: approvalCheckpoint.reason_class,
        evidence_ref: evidence_ref || supervisor.evidence_ref || approvalCheckpoint.evidence_ref,
        status: 'approved',
        decision_note: decisionNote,
        decided_at: decidedAt,
      });

      db.tables.tasks.update(
        { status: 'completed', last_qa_feedback: reasons?.join('\n') || 'Approved' },
        [['id', '=', task_id]]
      );

      if (workspace_id) {
        db.tables.agent_workspaces.update(
          {
            status: 'cleanup_pending',
            last_error: null,
            recovery_reason: null,
            evidence_ref: evidence_ref || `qa://${task_id}/approved`,
          },
          [['id', '=', workspace_id]]
        );
      }

      // Liberar agente
      db.tables.agent_registry.update({ current_task_id: null, status: 'idle' }, [
        ['current_task_id', '=', task_id],
      ]);

      if (run) {
        updateAgentRunTerminal(db, run.run_id, {
          status: 'succeeded',
          terminal_reason_class: 'qa_approved',
          completed_at: decidedAt,
        });
        appendQaArtifact(db, run.run_id, { result, reasons, evidence_ref });
      }

      const snapshot = upsertSupervisorSnapshot(db, {
        task_id,
        supervisor_state: 'closed',
        outcome: 'close',
        reason_class: 'completed',
        task_retry_count: Number(task.retry_count || supervisor.task_retry_count || 0),
        attempt_count: Number(supervisor.attempt_count || 0),
        unchanged_failure_count: Number(supervisor.unchanged_failure_count || 0),
        approval_request_count: Number(supervisor.approval_request_count || 1),
        orphan_recovery_count: Number(supervisor.orphan_recovery_count || 0),
        workspace_id: workspace_id || supervisor.workspace_id || approvalCheckpoint.workspace_id,
        run_id: run?.run_id || supervisor.run_id || approvalCheckpoint.run_id,
        evidence_ref: evidence_ref || supervisor.evidence_ref || approvalCheckpoint.evidence_ref,
        approval_checkpoint_key: checkpoint.checkpoint_key,
        updated_at: decidedAt,
      });

      return NextResponse.json({
        success: true,
        message: 'Task approved; cleanup intent recorded for executor handoff.',
        run_id: run?.run_id || null,
        supervisor: snapshot,
        checkpoint_gate: checkpointGate,
      });
    } else {
      const decidedAt = new Date().toISOString();
      const decisionNote = buildDecisionNote(reasons, 'Rejected');
      const checkpoint = upsertSupervisorApprovalCheckpoint(db, {
        checkpoint_key: approvalCheckpoint.checkpoint_key,
        task_id,
        workspace_id: workspace_id || supervisor.workspace_id || approvalCheckpoint.workspace_id,
        run_id: run?.run_id || supervisor.run_id || approvalCheckpoint.run_id,
        reason_class: approvalCheckpoint.reason_class,
        evidence_ref: evidence_ref || supervisor.evidence_ref || approvalCheckpoint.evidence_ref,
        status: 'rejected',
        decision_note: decisionNote,
        decided_at: decidedAt,
      });
      const snapshot = upsertSupervisorSnapshot(db, {
        task_id,
        supervisor_state: 'blocked',
        outcome: 'block',
        reason_class: 'approval_rejected',
        task_retry_count: Number(task.retry_count || supervisor.task_retry_count || 0),
        attempt_count: Number(supervisor.attempt_count || 0),
        unchanged_failure_count: Number(supervisor.unchanged_failure_count || 0),
        approval_request_count: Number(supervisor.approval_request_count || 1),
        orphan_recovery_count: Number(supervisor.orphan_recovery_count || 0),
        workspace_id: workspace_id || supervisor.workspace_id || approvalCheckpoint.workspace_id,
        run_id: run?.run_id || supervisor.run_id || approvalCheckpoint.run_id,
        evidence_ref: evidence_ref || supervisor.evidence_ref || approvalCheckpoint.evidence_ref,
        approval_checkpoint_key: checkpoint.checkpoint_key,
        updated_at: decidedAt,
      });

      return NextResponse.json({
        success: true,
        message: 'Supervisor approval rejected. Task remains blocked until conditions change.',
        run_id: run?.run_id || null,
        supervisor: snapshot,
      });
    }
  } catch (error) {
    console.error('Agent QA Result Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

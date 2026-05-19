import { NextResponse } from 'next/server';
import {
  getDb,
  getLatestAgentRunForWorkspace,
  getLatestAgentRunForTask,
  updateAgentRunTerminal,
  appendAgentArtifact,
} from '@/lib/db/localDb';

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

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (result === 'approved') {
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
          completed_at: new Date().toISOString(),
        });
        appendQaArtifact(db, run.run_id, { result, reasons, evidence_ref });
      }

      return NextResponse.json({
        success: true,
        message: 'Task approved; cleanup intent recorded for executor handoff.',
        run_id: run?.run_id || null,
      });
    } else {
      // Rejected
      const newRetries = (task.retry_count || 0) + 1;
      const feedback = reasons?.join('\n') || 'No reasons provided';

      if (newRetries >= 3) {
        // Block task
        db.tables.tasks.update(
          { status: 'blocked', retry_count: newRetries, last_qa_feedback: feedback },
          [['id', '=', task_id]]
        );

        db.tables.agent_registry.update({ current_task_id: null, status: 'idle' }, [
          ['current_task_id', '=', task_id],
        ]);

        if (workspace_id) {
          db.tables.agent_workspaces.update(
            {
              status: 'cleanup_pending',
              last_error: feedback,
              recovery_reason: 'qa-blocked',
              evidence_ref: evidence_ref || `qa://${task_id}/blocked`,
            },
            [['id', '=', workspace_id]]
          );
        }
        if (run) {
          updateAgentRunTerminal(db, run.run_id, {
            status: 'failed',
            terminal_reason_class: 'qa_blocked',
            completed_at: new Date().toISOString(),
          });
          appendQaArtifact(db, run.run_id, {
            result: 'blocked',
            reasons,
            evidence_ref: evidence_ref || `qa://${task_id}/blocked`,
          });
        }
        return NextResponse.json({ success: true, message: 'Task blocked after 3 retries.' });
      } else {
        // Retry
        db.tables.tasks.update({ retry_count: newRetries, last_qa_feedback: feedback }, [
          ['id', '=', task_id],
        ]);

        if (workspace_id) {
          db.tables.agent_workspaces.update(
            {
              status: 'paused',
              last_error: feedback,
              recovery_reason: 'qa-rejected',
              evidence_ref: evidence_ref || `qa://${task_id}/rejected/${newRetries}`,
            },
            [['id', '=', workspace_id]]
          );
        }

        if (run) {
          updateAgentRunTerminal(db, run.run_id, {
            status: 'failed',
            terminal_reason_class: 'qa_rejected',
            completed_at: new Date().toISOString(),
          });
          appendQaArtifact(db, run.run_id, { result, reasons, evidence_ref });
        }

        return NextResponse.json({
          success: true,
          message: 'Task rejected. Sent back for retry.',
          run_id: run?.run_id || null,
        });
      }
    }
  } catch (error) {
    console.error('Agent QA Result Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

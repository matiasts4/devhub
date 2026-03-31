import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/localDb';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request) {
  try {
    const body = await request.json();
    const { task_id, result, reasons, branch_name } = body;

    if (!task_id || !result || !branch_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getDb();
    const task = db.tables.tasks.single({
      where: [['id', '=', task_id]],
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (result === 'approved') {
      // Approve and trigger merge
      await execAsync(
        `git checkout main && git merge ${branch_name} && git branch -d ${branch_name}`
      ).catch(console.error);

      db.tables.tasks.update(
        { status: 'completed', last_qa_feedback: reasons?.join('\n') || 'Approved' },
        [['id', '=', task_id]]
      );

      // Liberar agente
      db.tables.agent_registry.update({ current_task_id: null, status: 'idle' }, [
        ['current_task_id', '=', task_id],
      ]);

      return NextResponse.json({ success: true, message: 'Task approved and merged.' });
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
        return NextResponse.json({ success: true, message: 'Task blocked after 3 retries.' });
      } else {
        // Retry
        db.tables.tasks.update({ retry_count: newRetries, last_qa_feedback: feedback }, [
          ['id', '=', task_id],
        ]);

        return NextResponse.json({ success: true, message: 'Task rejected. Sent back for retry.' });
      }
    }
  } catch (error) {
    console.error('Agent QA Result Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

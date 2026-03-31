import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/localDb';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request) {
  try {
    const body = await request.json();
    const { task_id, agent_id, llm_provider, llm_model } = body;

    if (!task_id || !agent_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getDb();

    // 1. Validate agent exists
    const agent = db.tables.agent_registry.select({
      where: [['agent_id', '=', agent_id]],
    })?.[0];

    if (!agent) {
      return NextResponse.json({ error: 'Agent not registered or available' }, { status: 400 });
    }

    // 2. Assign task to agent and set status to working
    db.tables.agent_registry.update({ current_task_id: task_id, status: 'working' }, [
      ['agent_id', '=', agent_id],
    ]);

    // 3. Mark task as in_progress
    const task = db.tables.tasks.update({ status: 'in_progress' }, [['id', '=', task_id]]);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // 4. Create git branch
    const branchName = `agent/${agent_id}/${task_id.split('-')[0]}`;
    await execAsync(`git checkout -b ${branchName} || true`).catch(console.error);

    return NextResponse.json({
      success: true,
      message: `Execution started on branch ${branchName}`,
      branch: branchName,
      agent_id: agent_id,
      task_id: task_id,
    });
  } catch (error) {
    console.error('Agent Execute Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

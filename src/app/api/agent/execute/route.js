import { NextResponse } from 'next/server';
import { getDb, prepareAgentWorkspaceLease } from '@/lib/db/localDb';

const FROZEN_BASE_COMMIT = 'f814998dd05cb491caf8637bf570dbd74b539090';

export async function POST(request) {
  try {
    const body = await request.json();
    const { task_id, agent_id } = body;

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

    const prepared = prepareAgentWorkspaceLease(
      db,
      {
        task_id,
        agent_id,
        requested_base_ref: FROZEN_BASE_COMMIT,
        correlation_id: `execute-${task_id}-${agent_id}`,
      },
      {
        acceptedAt: new Date().toISOString(),
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Workspace preparation requested; executor must provision workspace outside DevHub.',
      workspace_id: prepared.ack.workspace_id,
      correlation_id: prepared.ack.correlation_id,
      agent_id: agent_id,
      task_id: task_id,
    });
  } catch (error) {
    console.error('Agent Execute Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

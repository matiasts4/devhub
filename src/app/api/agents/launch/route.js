import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { getProfileHome } from '@/utils/geminiProfiles';
import { getDb } from '@/lib/db/localDb';
import { enforceDocOpsGateOnText, isDocOpsPlanningPrompt } from '@/lib/docopsPrompts';

const DEFAULT_PROFILE_NAME = 'default';

export async function POST(request) {
  try {
    const body = await request.json();
    const { task, projectId } = body;
    let { profileName } = body;

    if (!task) {
      return NextResponse.json({ error: 'Task description is required' }, { status: 400 });
    }

    if (!profileName || profileName === 'auto') {
      profileName = DEFAULT_PROFILE_NAME;
    }

    if (isDocOpsPlanningPrompt(task) && !projectId) {
      return NextResponse.json(
        {
          error:
            'DocOps/planning launches require projectId so the runtime gate can resolve project-scoped context before spawn.',
        },
        { status: 400 }
      );
    }

    // 1. Prepare the profile directory
    let geminiCliHome;
    try {
      geminiCliHome = getProfileHome(profileName);
    } catch (error) {
      return NextResponse.json(
        { error: `Failed to prepare profile: ${error.message}` },
        { status: 500 }
      );
    }

    // 2. Track the agent in local SQLite
    const db = getDb();
    const agentId = `opencode-${Date.now()}`;

    try {
      db.tables.agent_registry.insert({
        agent_id: agentId,
        nombre: 'OpenCode Launcher',
        modelo_llm: profileName || 'OpenCode Local',
        project_id: projectId || null,
        status: 'working',
        last_heartbeat: new Date().toISOString(),
      });
    } catch (dbError) {
      console.warn('Could not insert into agent_registry. Ensure the table exists.', dbError);
    }

    // 3. Launch OpenCode engine
    const childEnv = {
      ...process.env,
      GEMINI_CLI_HOME: geminiCliHome,
      AGENT_ID: agentId,
    };

    const runtimeTask = isDocOpsPlanningPrompt(task) ? enforceDocOpsGateOnText(task) : task;

    const child = spawn('opencode', ['--task', runtimeTask], {
      env: childEnv,
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    return NextResponse.json({
      success: true,
      agentId,
      message: `Agent launched successfully using OpenCode engine with profile ${profileName}`,
      geminiCliHome,
    });
  } catch (error) {
    console.error('Error launching agent:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

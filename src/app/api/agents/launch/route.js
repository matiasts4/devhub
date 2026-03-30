import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { getProfileHome } from '@/utils/geminiProfiles';
import { createClient } from '@/lib/supabase/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { task, profileName, projectId } = body;

    if (!task) {
      return NextResponse.json({ error: 'Task description is required' }, { status: 400 });
    }

    if (!profileName) {
      return NextResponse.json({ error: 'Profile name is required' }, { status: 400 });
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

    // 2. Track the agent in Supabase
    // Using the 'agent_registry' table to track running agents.
    const supabase = await createClient();

    const { data: agentRecord, error: dbError } = await supabase
      .from('agent_registry')
      .insert([
        {
          task_description: task,
          profile_name: profileName,
          project_id: projectId || null,
          status: 'running',
        },
      ])
      .select()
      .single();

    if (dbError) {
      console.warn('Could not insert into agent_registry. Ensure the table exists.', dbError);
    }

    const agentId = agentRecord?.id || `agent-${Date.now()}`;

    // 3. Launch OpenCode engine
    // We spawn the OpenCode engine as a detached child process, overriding GEMINI_CLI_HOME.
    const childEnv = {
      ...process.env,
      GEMINI_CLI_HOME: geminiCliHome,
      AGENT_ID: agentId,
    };

    // Replace 'opencode' with the actual execution command if needed
    const child = spawn('opencode', ['--task', task], {
      env: childEnv,
      detached: true,
      stdio: 'ignore',
    });

    child.unref(); // Allow the parent to exit independently of the child

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

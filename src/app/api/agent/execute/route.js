import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { task_id, agent_id, llm_provider, llm_model } = body;

    if (!task_id || !agent_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Validate agent exists
    const { data: agent, error: agentError } = await supabase
      .from("agent_registry")
      .select("*")
      .eq("agent_id", agent_id)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: "Agent not registered or available" }, { status: 400 });
    }

    // 2. Assign task to agent and set status to working
    await supabase
      .from("agent_registry")
      .update({ current_task_id: task_id, status: "working" })
      .eq("agent_id", agent_id);

    // 3. Mark task as in_progress
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .update({ status: "in_progress" })
      .eq("id", task_id)
      .select("*, projects(*)")
      .single();

    if (taskError) throw taskError;

    // 4. Create git branch
    const branchName = `agent/${agent_id}/${task_id.split("-")[0]}`;
    await execAsync(`git checkout -b ${branchName} || true`).catch(console.error);

    // TODO: In a real environment, we'd invoke the LLM Provider here (Anthropic/OpenAI) using the prompt builder.
    // For Phase 5 milestone, we simulate the LLM orchestrator start.
    
    // Simulate some work: Let's emit an event or return success stating the worker started.
    // The actual LLM execution would happen asynchronously or in a background worker process.

    return NextResponse.json({
      success: true,
      message: `Execution started on branch ${branchName}`,
      branch: branchName,
      agent_id: agent_id,
      task_id: task_id
    });
    
  } catch (error) {
    console.error("Agent Execute Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

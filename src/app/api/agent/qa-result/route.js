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
    const { task_id, result, score, reasons, branch_name } = body;

    // result should be 'approved' or 'rejected'
    if (!task_id || !result || !branch_name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", task_id)
      .single();

    if (taskError) throw taskError;

    if (result === 'approved') {
      // Approve and trigger merge
      await execAsync(`git checkout main && git merge ${branch_name} && git branch -d ${branch_name}`).catch(console.error);

      await supabase
        .from("tasks")
        .update({ status: 'completed', last_qa_feedback: reasons?.join('\n') || 'Approved' })
        .eq("id", task_id);

      // Liberar agente
      await supabase.from("agent_registry").update({ current_task_id: null, status: 'idle' }).eq("current_task_id", task_id);

      return NextResponse.json({ success: true, message: "Task approved and merged." });

    } else {
      // Rejected
      const newRetries = (task.retry_count || 0) + 1;
      const feedback = reasons?.join('\n') || 'No reasons provided';
      
      if (newRetries >= 3) {
        // Block task
        await supabase
          .from("tasks")
          .update({ status: 'blocked', retry_count: newRetries, last_qa_feedback: feedback })
          .eq("id", task_id);
          
        await supabase.from("agent_registry").update({ current_task_id: null, status: 'idle' }).eq("current_task_id", task_id);
        return NextResponse.json({ success: true, message: "Task blocked after 3 retries." });
      } else {
        // Retry
        await supabase
          .from("tasks")
          .update({ retry_count: newRetries, last_qa_feedback: feedback })
          .eq("id", task_id);
          
        return NextResponse.json({ success: true, message: "Task rejected. Sent back for retry." });
      }
    }
  } catch (error) {
    console.error("Agent QA Result Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

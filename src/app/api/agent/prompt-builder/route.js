import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import fs from "fs/promises";
import path from "path";

export async function POST(request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { task_id } = body;

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("*, projects(*)")
      .eq("id", task_id)
      .single();

    if (taskError) throw taskError;
    
    let milestone = null;
    if (task.milestone_id) {
       const { data: ms } = await supabase.from("milestones").select("*").eq("id", task.milestone_id).single();
       milestone = ms;
    }

    const sections = [];

    // 1. System Prompt del Worker
    try {
      const sysPromptPath = path.join(process.cwd(), "docs", "09_Prompts_Maestros_Agentes.md");
      const sysPrompt = await fs.readFile(sysPromptPath, "utf8");
      sections.push(sysPrompt);
    } catch(e) {
      sections.push("Eres un Agent Worker encargado de ejecutar tareas automáticas.");
    }

    // 2. Contexto del proyecto
    sections.push(`## Proyecto: ${task.projects.name}\n${task.projects.description || ""}`);

    // 3. Milestone actual
    if (milestone) {
      sections.push(`## Milestone: ${milestone.title}\n${milestone.description || ""}`);
    }

    // 4. Tarea a ejecutar
    sections.push(`## Tu Tarea: ${task.title}\n${task.description || ""}`);

    // Feedback previo si existe
    if (task.last_qa_feedback) {
      sections.push(`## AVISO: Intento anterior rechazado.\nCorrige estos problemas:\n${task.last_qa_feedback}`);
    }

    const promptText = sections.join("\n\n---\n\n");

    return NextResponse.json({
      success: true,
      prompt: promptText
    });
    
  } catch (error) {
    console.error("Prompt Builder Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

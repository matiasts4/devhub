import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/localDb';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request) {
  try {
    const body = await request.json();
    const { task_id } = body;

    const db = getDb();
    const task = db.tables.tasks.single({
      where: [['id', '=', task_id]],
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Get project
    const project = db.tables.projects.single({
      where: [['id', '=', task.project_id]],
    });

    let milestone = null;
    if (task.milestone_id) {
      milestone = db.tables.milestones.single({
        where: [['id', '=', task.milestone_id]],
      });
    }

    const sections = [];

    // 1. System Prompt del Worker
    try {
      const sysPromptPath = path.join(process.cwd(), 'docs', '09_Prompts_Maestros_Agentes.md');
      const sysPrompt = await fs.readFile(sysPromptPath, 'utf8');
      sections.push(sysPrompt);
    } catch (e) {
      sections.push('Eres un Agent Worker encargado de ejecutar tareas automáticas.');
    }

    // 2. Contexto del proyecto
    sections.push(`## Proyecto: ${project?.name || 'N/A'}\n${project?.description || ''}`);

    // 3. Milestone actual
    if (milestone) {
      sections.push(`## Milestone: ${milestone.title}\n${milestone.description || ''}`);
    }

    // 4. Tarea a ejecutar
    sections.push(`## Tu Tarea: ${task.title}\n${task.description || ''}`);

    // Feedback previo si existe
    if (task.last_qa_feedback) {
      sections.push(
        `## AVISO: Intento anterior rechazado.\nCorrige estos problemas:\n${task.last_qa_feedback}`
      );
    }

    const promptText = sections.join('\n\n---\n\n');

    return NextResponse.json({
      success: true,
      prompt: promptText,
    });
  } catch (error) {
    console.error('Prompt Builder Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

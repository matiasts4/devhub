export const dynamic = 'force-static';

import { createClient } from '@/lib/supabase/server';

import { NextResponse } from 'next/server';

/**
 * POST /api/ai/chat
 * Sends a message to an AI model and returns the response.
 * Persists the conversation to ai_interactions table.
 *
 * Body: { project_id, message, history: [{role, content}] }
 */
export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project_id, message, history = [] } = await request.json();
  if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });

  // Fetch project context for the system prompt
  let projectContext = '';
  if (project_id) {
    const { data: proj } = await supabase.from('projects').select('name, description, status').eq('id', project_id).single();
    const { data: tasks } = await supabase.from('tasks').select('title, status, priority').eq('project_id', project_id);
    const { data: milestones } = await supabase.from('milestones').select('title, status, due_date').eq('project_id', project_id);

    const taskSummary = tasks?.map(t => `- ${t.title} (${t.status}, ${t.priority})`).join('\n') || 'Sin tareas.';
    const msSummary = milestones?.map(m => `- ${m.title} (${m.status})`).join('\n') || 'Sin hitos.';

    projectContext = `
Proyecto activo: "${proj?.name}"
Descripción: ${proj?.description || 'No especificada'}
Estado: ${proj?.status}

Tareas:
${taskSummary}

Hitos del Roadmap:
${msSummary}
`;
  }

  const systemPrompt = `Eres un agente de productividad personal integrado en DevHub. 
Ayudas al usuario a gestionar sus proyectos, tareas e hitos.
${projectContext ? `\nContexto del proyecto:\n${projectContext}` : ''}
Responde siempre en español, de forma concisa y útil. 
Si el usuario pide crear, completar o modificar tareas o hitos, explica exactamente qué harías y sugiere que use la interfaz correspondiente o confirme para que ejecutes la acción.`;

  // Build message array for the API
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  // Save user message
  await supabase.from('ai_interactions').insert({
    project_id: project_id || null,
    user_id: user.id,
    role: 'user',
    content: message,
    model: 'gemini',
  });

  // Call Google Gemini via REST (no SDK needed)
  const apiKey = process.env.GEMINI_API_KEY;
  let assistantContent = '';

  if (apiKey) {
    try {
      const geminiMessages = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: geminiMessages,
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
          }),
        }
      );
      const data = await response.json();
      assistantContent = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No pude generar una respuesta.';
    } catch (err) {
      assistantContent = `Error al conectar con la IA: ${err.message}`;
    }
  } else {
    // Fallback when no API key is configured
    assistantContent = `⚠️ No hay una clave API de Gemini configurada. Agrega \`GEMINI_API_KEY\` a tu \`.env.local\` para habilitar el agente IA.\n\nPuedes obtener una clave gratuita en [Google AI Studio](https://aistudio.google.com/).`;
  }

  // Save assistant response
  await supabase.from('ai_interactions').insert({
    project_id: project_id || null,
    user_id: user.id,
    role: 'assistant',
    content: assistantContent,
    model: 'gemini',
  });

  return NextResponse.json({ response: assistantContent });
}

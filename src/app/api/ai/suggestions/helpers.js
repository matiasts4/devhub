/**
 * src/app/api/ai/suggestions/helpers.js
 * Pure helper functions for the suggestions route.
 * Extracted for testability (no Next.js, no DB, no fetch).
 */

const MAX_CONTEXT_CHARS = 2000;

/**
 * Build the system prompt for the LLM, serializing project context.
 *
 * @param {{ id: string, name: string, progress: number }} project
 * @param {Array} tasks
 * @param {Array} milestones
 * @param {string} [userPrompt]
 * @returns {string}
 */
function buildSystemPrompt(project, tasks, milestones, userPrompt) {
  const taskLines = (tasks || [])
    .slice(0, 30) // cap to avoid token explosion
    .map((t) => `- ${t.title} (${t.status}, ${t.priority || 'medium'})`)
    .join('\n');

  const msLines = (milestones || [])
    .slice(0, 10)
    .map((m) => `- ${m.title} (${m.status}${m.due_date ? ', vence: ' + m.due_date : ''})`)
    .join('\n');

  const context = [
    `Proyecto: "${project?.name || 'Sin nombre'}"`,
    `Progreso: ${project?.progress ?? 0}%`,
    `\nTareas (${tasks?.length || 0} total):`,
    taskLines || 'Sin tareas.',
    `\nHitos (${milestones?.length || 0} total):`,
    msLines || 'Sin hitos.',
  ].join('\n');

  // Truncate context to MAX_CONTEXT_CHARS
  const truncatedContext =
    context.length > MAX_CONTEXT_CHARS ? context.slice(0, MAX_CONTEXT_CHARS) + '...' : context;

  const promptSection = userPrompt
    ? `\nSolicitud del usuario: ${userPrompt}`
    : '\nAnalizá el estado del proyecto y generá sugerencias proactivas.';

  return `Sos un asistente de gestión de proyectos. Analizá el contexto del proyecto y retorná exactamente un array JSON de sugerencias (máximo 5). 

CONTEXTO DEL PROYECTO:
${truncatedContext}
${promptSection}

FORMATO DE RESPUESTA (JSON array — SIN texto adicional, SOLO el array):
[
  {
    "id": "unique-id",
    "title": "Título corto de la sugerencia",
    "description": "Descripción clara en 1-2 oraciones",
    "type": "risk|alert|opportunity|tip",
    "action_hint": "Acción concreta recomendada"
  }
]

TIPOS: risk (rojo), alert (amarillo), opportunity (verde), tip (azul).
Retorná SOLO el array JSON, sin markdown extra fuera del bloque.`;
}

/**
 * Parse a JSON array from LLM text output.
 * Tries: ```json block, bare array, fallback null.
 *
 * @param {string} text
 * @returns {Array | null}
 */
function parseJsonFromText(text) {
  if (!text || typeof text !== 'string') return null;

  // Try ```json ... ``` block first
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  // Try bare JSON array
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Accumulate text content from NDJSON chunk lines (from agenthub/chat).
 * Only processes lines with type === "chunk".
 *
 * @param {string[]} lines — array of raw NDJSON lines
 * @returns {string} — concatenated content from all chunk lines
 */
function accumulateChunks(lines) {
  if (!lines || lines.length === 0) return '';

  let text = '';
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'chunk' && parsed.content) {
        text += parsed.content;
      }
    } catch {
      // skip invalid JSON lines
    }
  }
  return text;
}

module.exports = { buildSystemPrompt, parseJsonFromText, accumulateChunks };

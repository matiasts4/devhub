import { getDocOpsContextBudgetPolicy } from './docopsPolicy.js';

const DOCOPS_RETRIEVAL_FIRST_ORDER = [
  '1. Identificá primero el topic exacto a trabajar.',
  '2. Llamá a `validate_topic_key` con el topic_key propuesto.',
  '3. Si el topic_key es inválido o falta, frená y pedile al usuario una clave canónica.',
  '4. Llamá a `build_context_pack` con `project_id`, `objective` y el `topic_key` validado.',
  '5. Si no existe un Context Pack válido, no avances con planificación ni documentación.',
  '6. Trabajá retrieval-first: topic exacto -> tareas/hitos vinculados -> memoria -> anexos sólo si hace falta.',
].join('\n');

function buildDocOpsContextBudgetLanguage() {
  const policy = getDocOpsContextBudgetPolicy();
  return [
    'Presupuesto DocOps compartido:',
    `- max_tokens_context: ${policy.max_tokens_context}`,
    `- max_expansions: ${policy.max_expansions}`,
    `- expansion_step_tokens: ${policy.expansion_step_tokens}`,
  ].join('\n');
}

const DOCOPS_REFUSAL_RULES = [
  'No redactes ni planifiques contenido documental sin Context Pack válido.',
  'No uses historiales completos por defecto.',
  'No sigas si el pack no cumple el presupuesto o si falta la evidencia mínima.',
].join('\n');

function parseLaunchPromptArgument(promptArg = '') {
  const trimmed = String(promptArg || '').trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }

  if (trimmed.startsWith("'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function buildDocOpsGateLanguage() {
  return [
    'Aplicá este gate DocOps como una mejora del sdd-orchestrator existente, no como reemplazo:',
    DOCOPS_RETRIEVAL_FIRST_ORDER,
    '',
    buildDocOpsContextBudgetLanguage(),
    '',
    DOCOPS_REFUSAL_RULES,
    'El orquestador sigue siendo el punto de decisión; el MCP aporta validación, registro y cronología.',
  ].join('\n');
}

export function buildDocOpsGatePrompt({ agentId, objective, topicKey, projectId, telemetryId }) {
  return [
    `[Eres el Orquestador SDD. Tu agent_id es '${agentId}'.`,
    `Antes de cualquier trabajo de documentacion o planificacion:`,
    buildDocOpsGateLanguage(),
    '',
    `Si el usuario no proporciono un topic_key, proponer uno breve y canonico antes de llamar a validate_topic_key.`,
    `Si el usuario si proporciono un objetivo, usalo para \`objective\`; si no, extraelo del pedido original.`,
    projectId ? `project_id: ${projectId}` : null,
    topicKey ? `topic_key candidato: ${topicKey}` : null,
    objective ? `objetivo: ${objective}` : null,
    telemetryId
      ? `Cuando termines, usa update_agent_status con status='completed' y agent_id='${telemetryId}'.`
      : null,
    `]`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function enforceDocOpsGateOnText(text = '') {
  const rawText = String(text || '').trim();
  if (!isDocOpsPlanningPrompt(rawText)) return text;
  if (rawText.includes('Aplicá este gate DocOps') || rawText.includes('validate_topic_key')) {
    return text;
  }

  return [buildDocOpsGateLanguage(), '', rawText].join('\n');
}

export function enforceDocOpsGateOnLaunchCommand(command = '') {
  const normalizedCommand = String(command || '').trim();
  const flag = normalizedCommand.includes('--prompt ')
    ? '--prompt '
    : normalizedCommand.includes('--task ')
      ? '--task '
      : null;
  if (!flag) return command;

  const promptIndex = normalizedCommand.lastIndexOf(flag);
  if (promptIndex === -1) return command;

  const prefix = normalizedCommand.slice(0, promptIndex + flag.length);
  const promptArg = normalizedCommand.slice(promptIndex + flag.length);
  const promptText = parseLaunchPromptArgument(promptArg);

  if (!promptText || !isDocOpsPlanningPrompt(promptText)) return command;

  return `${prefix}${shellQuotePrompt(enforceDocOpsGateOnText(promptText))}`;
}

export function buildDocOpsOrchestratorLaunchPrompt({
  agentId,
  prompt,
  projectId,
  telemetryId,
  topicKey,
  objective,
}) {
  const safePrompt = (prompt || '').trim();
  return `${buildDocOpsGatePrompt({
    agentId,
    projectId,
    telemetryId,
    topicKey,
    objective,
  })}\n\n/sdd-new ${safePrompt}`;
}

export function isDocOpsPlanningPrompt(text = '') {
  const normalized = String(text).toLowerCase();
  return [
    'docops',
    'document',
    'documentaci',
    'planning',
    'planific',
    'sdd',
    'topic_key',
    'retrieval-first',
    'context pack',
    'contexto',
  ].some((token) => normalized.includes(token));
}

export function buildDocOpsTaskPrompt({
  agentId,
  taskId,
  telemetryId,
  taskTitle,
  taskDescription,
}) {
  const taskContext = [taskTitle, taskDescription].filter(Boolean).join(' — ');
  const docOpsGate = isDocOpsPlanningPrompt(taskContext)
    ? [
        'Antes de tocar cualquier artefacto documental o de planning, aplicá el gate DocOps.',
        buildDocOpsGateLanguage(),
      ].join('\n')
    : null;

  return [
    `[Tu ID de telemetría es '${telemetryId}'].`,
    `Sos el agente ${agentId}.`,
    `Implementa la tarea de DevHub con ID: ${taskId}.`,
    docOpsGate,
    `Usa devhub_get_next_task o actualizala a in_progress directamente, trabaja en ella y luego reportala como completada usando update_agent_status con status='completed' y agent_id='${telemetryId}'.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function shellQuotePrompt(prompt = '') {
  return JSON.stringify(String(prompt));
}

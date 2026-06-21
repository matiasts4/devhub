/** @typedef {'initial' | 'continue' | 'replan'} PlanningMode */

export const PLANNING_MODES = [
  {
    id: 'initial',
    label: 'Plan inicial',
    description: 'Proyecto nuevo o sin roadmap — generá hitos y tareas desde cero.',
  },
  {
    id: 'continue',
    label: 'Continuar',
    description: 'Proyecto en curso — proponé la siguiente fase sin duplicar lo hecho.',
  },
  {
    id: 'replan',
    label: 'Replanificar',
    description: 'Revisá el roadmap actual y ajustá prioridades, hitos o tareas.',
  },
];

const PLANNING_CLOSE_INSTRUCTION =
  'Al terminar, marcá el proyecto con `update_project({ project_id, planning_status: "completed" })`.';

/**
 * @param {PlanningMode} mode
 * @param {{ projectId: string, projectName?: string, hasExistingWork?: boolean }} opts
 */
export function buildPlanningKickoffPrompt(
  mode,
  { projectId, projectName = '', hasExistingWork = false }
) {
  const header = projectName
    ? `Proyecto DevHub: **${projectName}** (project_id: \`${projectId}\`)`
    : `Proyecto DevHub (project_id: \`${projectId}\`)`;

  const sharedSteps = [
    `1. Usá DevHub MCP con \`get_project_context({ project_id: "${projectId}" })\` — leé planning_prompt, archivos, política documental y estado del roadmap.`,
    '2. Haceme las preguntas que necesites para cerrar alcance, tecnologías y prioridades.',
    '3. Creá **hitos** con `bulk_create_milestones` y **tareas** con `bulk_create_tasks` (mínimo 40 tareas en planes iniciales grandes).',
    `4. ${PLANNING_CLOSE_INSTRUCTION}`,
  ];

  if (mode === 'continue') {
    return [
      `Necesito **continuar la planificación** de un proyecto en curso.`,
      header,
      '',
      'El contexto incluye hitos y tareas existentes. No dupliques trabajo ya completado.',
      '',
      ...sharedSteps,
      hasExistingWork
        ? '5. Enfocate en la **siguiente fase**: tareas nuevas que desbloqueen lo pendiente.'
        : '5. Si el roadmap está vacío, tratá esto como plan inicial.',
      '',
      'Empezá leyendo el contexto del proyecto.',
    ].join('\n');
  }

  if (mode === 'replan') {
    return [
      `Necesito **replanificar** un proyecto DevHub — revisar y ajustar el roadmap actual.`,
      header,
      '',
      'Analizá hitos/tareas existentes. Podés agregar, re-priorizar o proponer cierre de items obsoletos vía comentarios en tareas.',
      '',
      ...sharedSteps,
      '5. Documentá en comentarios qué cambió respecto al plan anterior.',
      '',
      'Empezá leyendo el contexto del proyecto.',
    ].join('\n');
  }

  return [
    'Estoy arrancando un proyecto en DevHub y necesito **planificación completa**.',
    header,
    '',
    ...sharedSteps,
    '',
    'Empezá leyendo el contexto del proyecto.',
  ].join('\n');
}

/**
 * Prompt listo para copiar (flujo manual / Antigravity).
 * @param {PlanningMode} mode
 * @param {{ projectId: string, userId?: string, projectName?: string, fileNames?: string[] }} opts
 */
import { LOCAL_USER_ID } from '@/lib/constants/local';

export function buildPlanningCopyPrompt(
  mode,
  { projectId, userId = LOCAL_USER_ID, projectName = '', fileNames = [] }
) {
  const filesLine =
    fileNames.length > 0
      ? `Archivos de contexto cargados: ${fileNames.join(', ')}`
      : 'Sin archivos de contexto adicionales.';

  return [
    buildPlanningKickoffPrompt(mode, { projectId, projectName }),
    '',
    '---',
    `user_id para MCP: ${userId}`,
    filesLine,
  ].join('\n');
}

export function resolveDefaultPlanningMode({
  taskCount = 0,
  milestoneCount = 0,
  planningStatus = 'none',
} = {}) {
  if (planningStatus === 'pending') return 'initial';
  if (taskCount > 0 || milestoneCount > 0) return 'continue';
  return 'initial';
}

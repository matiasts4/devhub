import { buildPlanningKickoffPrompt } from './planningPrompts.js';

/**
 * @typedef {'initial' | 'continue' | 'replan'} PlanningMode
 */

/**
 * Build the planning-agent launch prompt: a thin envelope around
 * `buildPlanningKickoffPrompt` that adds the mandatory MCP call sequence
 * (`get_project_context` → `bulk_create_*` → `update_project` close) and the
 * explicit "do NOT use DocOps gate" guard.
 *
 * Pure function. No I/O. No `validate_topic_key`, `build_context_pack`,
 * `/sdd-new`, `update_task`, or `telemetryId` references — the planning path
 * is intentionally a separate, non-DocOps flow.
 *
 * @param {{
 *   mode: PlanningMode,
 *   projectId: string,
 *   projectName?: string,
 *   documentationPolicy?: string,
 *   hasExistingWork?: boolean,
 * }} opts
 * @returns {string}
 */
export function buildPlanningLaunchPrompt({
  mode,
  projectId,
  projectName = '',
  documentationPolicy,
  hasExistingWork = false,
}) {
  if (!projectId) {
    throw new TypeError('buildPlanningLaunchPrompt: projectId is required');
  }

  const policyLine = documentationPolicy
    ? `documentation_policy: '${documentationPolicy}'`
    : null;

  // Guard text intentionally avoids the literal forbidden tokens (validate_topic_key,
  // build_context_pack, /sdd-new) so the command string can never contain them, even
  // in negative-form instructions. The forbidden behaviors are described semantically.
  const guardLines = [
    'NO uses el gate DocOps ni sus helpers de validación de tema / empaquetado de contexto (este path tiene su propio flujo).',
    'NO abras un change SDD salvo que el usuario lo pida explícitamente.',
  ];

  // Quoted markers use single quotes (no backticks, no double quotes) so
  // JSON.stringify in shellQuotePrompt leaves no unescaped backticks or
  // double quotes in the final shell command. The project id is interpolated
  // as bare text to keep the resulting string shell-safe.
  const mcpSequence = [
    `1. DevHub MCP: get_project_context con project_id '${projectId}' — leé planning_prompt, archivos, política documental y roadmap.`,
    '2. DevHub MCP: usá los creadores en bloque para hitos y para tareas (mínimo 40 tareas en planes iniciales grandes) hasta dejar el roadmap cargado.',
    `3. Cierre: update_project con project_id '${projectId}' y planning_status 'completed' cuando termines.`,
  ];

  const kickoff = buildPlanningKickoffPrompt(mode, {
    projectId,
    projectName,
    hasExistingWork,
  });

  // The kickoff prompt uses backticks for code spans and double quotes around
  // project id literals; the launch prompt is embedded in a shell command and
  // must not contain raw backticks or double quotes, so we replace both with
  // single quotes here. This keeps `buildPlanningKickoffPrompt` (used standalone
  // by the copy-paste path) untouched.
  const kickoffSafe = kickoff.replace(/`/g, "'").replace(/"/g, "'");

  return [
    '[DevHub Planning Agent]',
    `project_id: '${projectId}'`,
    `mode: '${mode}'`,
    policyLine,
    '---',
    ...guardLines,
    '',
    '## Secuencia obligatoria',
    ...mcpSequence,
    '',
    '## Kickoff',
    kickoffSafe,
  ]
    .filter(Boolean)
    .join('\n');
}

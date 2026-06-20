/**
 * Multi-step planning tool for Zed.
 *
 * Given a high-level objective, returns a structured plan of tool calls.
 * This initial implementation uses a deterministic template; a future version
 * can call the LLM to generate richer plans.
 */

import { zedLog } from '../utils/zed-logger';

function parseObjectiveIntoPlan(objective) {
  const lower = objective.toLowerCase();
  const plan = [];

  if (lower.includes('delegar') || lower.includes('open code') || lower.includes('opencode')) {
    plan.push({
      step: 1,
      tool: 'list_tasks',
      input: { status: 'all' },
      reason: 'Identificar las tareas candidatas para delegar.',
    });
    plan.push({
      step: 2,
      tool: 'launch_agent_session',
      input: { program: 'opencode', prompt: objective },
      reason: 'Abrir una sesión de OpenCode con el contexto completo.',
    });
    plan.push({
      step: 3,
      tool: 'list_agent_runs',
      input: { agent_id: 'opencode', limit: 5 },
      reason: 'Monitorear el run del agente delegado.',
    });
  } else if (lower.includes('tarea') || lower.includes('hito')) {
    plan.push({
      step: 1,
      tool: 'get_project_context',
      input: {},
      reason: 'Entender el estado actual del proyecto.',
    });
    plan.push({
      step: 2,
      tool: lower.includes('hito') ? 'create_milestone' : 'create_task',
      input: lower.includes('hito') ? { title: objective } : { title: objective },
      reason: 'Crear el recurso de planificación solicitado.',
    });
  } else {
    plan.push({
      step: 1,
      tool: 'get_project_context',
      input: {},
      reason: 'Recopilar contexto del proyecto.',
    });
    plan.push({
      step: 2,
      tool: 'create_task',
      input: { title: objective, priority: 'medium' },
      reason: 'Registrar el objetivo como tarea.',
    });
  }

  return plan;
}

export const createPlanTool = {
  name: 'create_plan',
  description:
    'Create a multi-step plan from a high-level objective. Returns the plan for human confirmation before execution.',
  parameters: {
    objective: { type: 'string', description: 'High-level objective to plan.' },
  },
  async execute(params = {}) {
    const objective = typeof params?.objective === 'string' ? params.objective.trim() : '';
    if (!objective) return { error: 'missing required parameter: objective' };

    const plan = parseObjectiveIntoPlan(objective);
    zedLog.info('TOOL', 'create_plan', { objective, steps: plan.length });

    return {
      objective,
      steps: plan,
      requires_confirmation: true,
      message: `Propongo un plan de ${plan.length} pasos. ¿Confirmás la ejecución?`,
    };
  },
};

export const executePlanTool = {
  name: 'execute_plan',
  description: 'Execute a confirmed multi-step plan step by step.',
  parameters: {
    plan: { type: 'array', description: 'Array of plan steps with tool and input.' },
  },
  async execute(params = {}) {
    const plan = Array.isArray(params?.plan) ? params.plan : [];
    if (plan.length === 0) return { error: 'empty_plan', message: 'El plan está vacío.' };

    zedLog.info('TOOL', 'execute_plan', { steps: plan.length });

    return {
      success: true,
      steps: plan.length,
      note: 'Plan accepted for execution. The UI/runZedFastPath will dispatch each step in order.',
    };
  },
};

/**
 * Client-side supervised plan runner for Zed (Phase 8).
 *
 * Wraps `createPlanExecutor` with a server-backed `executeTool` function so the
 * plan lifecycle (pause/resume/abort, per-step approval, retries) runs in the
 * browser while tool execution stays on the server sandbox.
 */

import { createPlanExecutor, PLAN_STATES } from './planExecutor';
import { labelForZedToolStart } from './zedToolLabels';

const ENDPOINT = '/api/assistant/execute-plan-step';

async function executePlanStepOnServer(tool, input, context = {}) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, input, context, source: 'plan' }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return { error: data.error || `HTTP ${response.status}` };
  }

  const data = await response.json();
  if (!data.ok) {
    return data.result || { error: 'tool execution failed' };
  }
  return data.result;
}

/**
 * @param {object} options
 * @param {object} [options.context] Server request context (terminal counts, workspace terminals).
 * @param {(evt: { type: string, payload: unknown }) => void} [options.onEvent] Raw executor events.
 * @param {(step: object) => void} [options.onStepStart]
 * @param {(step: object, result: unknown) => void} [options.onStepDone]
 * @param {(state: string, payload?: object) => void} [options.onStateChange]
 */
export function createZedPlanRunner({
  context = {},
  onEvent = null,
  onStepStart = null,
  onStepDone = null,
  onStateChange = null,
} = {}) {
  const planContext = { ...context };

  const wrappedOnEvent = (event) => {
    if (event.type === 'step_start') {
      onStepStart?.(event.payload.step);
    }
    if (event.type === 'step_done') {
      onStepDone?.(event.payload.step, event.payload.result);
    }
    if (event.type === 'state_change') {
      onStateChange?.(event.payload.state, event.payload);
    }
    onEvent?.(event);
  };

  const executor = createPlanExecutor({ onEvent: wrappedOnEvent });

  const executeTool = async (tool, input) => {
    const result = await executePlanStepOnServer(tool, input, planContext);
    // Refresh workspace terminals if the tool opened a terminal.
    if (tool === 'open_terminal' && result && !result.error && result.terminalId) {
      const row = {
        terminalId: result.terminalId,
        displayName: result.displayName || result.terminalId,
        cwd: result.cwd || null,
      };
      const existing = (planContext.workspace_terminals || []).find(
        (t) => t.terminalId === row.terminalId
      );
      if (existing) {
        Object.assign(existing, row);
      } else {
        planContext.workspace_terminals = [...(planContext.workspace_terminals || []), row];
      }
    }
    return result;
  };

  return {
    run: (plan) => executor.run(plan, executeTool),
    approveStep: () => executor.approveStep(executeTool),
    pause: executor.pause,
    resume: () => executor.resume(executeTool),
    abort: executor.abort,
    getState: executor.getState,
    PLAN_STATES,
    labelForStep: (step) => labelForZedToolStart(step?.tool, step?.input),
  };
}

export { PLAN_STATES };
export default createZedPlanRunner;

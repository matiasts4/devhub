/**
 * Supervised plan executor for Zed (Phase 8).
 *
 * Executes a confirmed multi-step plan step by step, requesting human
 * confirmation for risky actions, retrying transient failures, and allowing
 * pause/resume/abort between steps.
 */

const DEFAULT_LOGGER =
  typeof console !== 'undefined'
    ? console
    : { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} };

const CRITICAL_TOOLS = new Set([
  'close_terminal',
  'close_all_terminals',
  'execute_in_terminal',
  'launch_agent_session',
  'launch_swarm_local',
  'create_task',
  'create_milestone',
  'update_task',
  'update_milestone',
  'delete_project',
]);

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

function isCriticalStep(step) {
  return CRITICAL_TOOLS.has(step?.tool);
}

function isRecoverableError(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.error === 'command_requires_approval') return false;
  if (result.error === 'command_blocked') return false;
  if (result.error === 'missing required parameters') return false;
  if (result.error === 'empty_plan') return false;
  return Boolean(result.error);
}

function clonePlan(plan) {
  return Array.isArray(plan) ? plan.map((s) => ({ ...s })) : [];
}

export const PLAN_STATES = Object.freeze({
  APPROVED: 'approved',
  RUNNING: 'running',
  AWAITING_HUMAN: 'awaiting_human',
  PAUSED: 'paused',
  FAILED: 'failed',
  COMPLETED: 'completed',
  ABORTED: 'aborted',
});

export function createPlanExecutor({ onEvent = null, logger = DEFAULT_LOGGER } = {}) {
  let plan = [];
  let state = PLAN_STATES.APPROVED;
  let currentStepIndex = 0;
  let pendingApprovalStep = null;
  let runningPromise = null;

  const emit = (type, payload) => {
    if (typeof onEvent === 'function') {
      try {
        onEvent({ type, payload });
      } catch (err) {
        logger.error('planExecutor event handler error', err);
      }
    }
  };

  const updateState = (nextState, extra = {}) => {
    state = nextState;
    emit('state_change', { state, currentStepIndex, ...extra });
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const executeStep = async (step, executeTool) => {
    let attempt = 0;
    while (attempt <= MAX_RETRIES) {
      const result = await executeTool(step.tool, step.input);
      if (!isRecoverableError(result)) {
        return result;
      }
      attempt += 1;
      if (attempt > MAX_RETRIES) {
        return result;
      }
      logger.info('planExecutor retrying step', { step: step.step, attempt });
      await sleep(RETRY_DELAY_MS * attempt);
    }
    return { error: 'max_retries_exceeded' };
  };

  const runLoop = async (executeTool) => {
    for (let i = currentStepIndex; i < plan.length; i += 1) {
      if (state === PLAN_STATES.ABORTED || state === PLAN_STATES.PAUSED) {
        return { state };
      }

      currentStepIndex = i;
      const step = plan[i];
      emit('step_start', { index: i, step });

      if (isCriticalStep(step)) {
        pendingApprovalStep = step;
        updateState(PLAN_STATES.AWAITING_HUMAN, { step });
        return { state: PLAN_STATES.AWAITING_HUMAN, step };
      }

      const result = await executeStep(step, executeTool);

      if (state === PLAN_STATES.ABORTED || state === PLAN_STATES.PAUSED) {
        return { state };
      }

      plan[i] = { ...step, result, executedAt: new Date().toISOString() };
      emit('step_done', { index: i, step: plan[i], result });

      if (isRecoverableError(result)) {
        updateState(PLAN_STATES.FAILED, { step, result });
        return { state: PLAN_STATES.FAILED, failedStep: step, result };
      }
    }

    updateState(PLAN_STATES.COMPLETED);
    return { state: PLAN_STATES.COMPLETED, plan };
  };

  const startRun = async (executeTool) => {
    if (state === PLAN_STATES.PAUSED || state === PLAN_STATES.ABORTED) {
      return { state };
    }
    updateState(PLAN_STATES.RUNNING);
    try {
      return await runLoop(executeTool);
    } catch (err) {
      logger.error('planExecutor run error', err);
      updateState(PLAN_STATES.FAILED, { error: err.message });
      return { state: PLAN_STATES.FAILED, error: err.message };
    }
  };

  const run = async (initialPlan, executeTool) => {
    if (runningPromise) {
      throw new Error('Plan executor is already running');
    }
    plan = clonePlan(initialPlan);
    currentStepIndex = 0;
    pendingApprovalStep = null;
    const promise = startRun(executeTool);
    runningPromise = promise;
    try {
      return await promise;
    } finally {
      runningPromise = null;
    }
  };

  const approveStep = async (executeTool) => {
    if (state !== PLAN_STATES.AWAITING_HUMAN || !pendingApprovalStep) {
      throw new Error('No step awaiting approval');
    }
    if (runningPromise) {
      throw new Error('Plan executor is already running');
    }

    const step = pendingApprovalStep;
    pendingApprovalStep = null;
    updateState(PLAN_STATES.RUNNING);

    const promise = (async () => {
      try {
        const result = await executeStep(step, executeTool);

        if (state === PLAN_STATES.ABORTED) {
          return { state: PLAN_STATES.ABORTED };
        }

        plan[currentStepIndex] = { ...step, result, executedAt: new Date().toISOString() };
        emit('step_done', { index: currentStepIndex, step: plan[currentStepIndex], result });

        if (isRecoverableError(result)) {
          updateState(PLAN_STATES.FAILED, { step, result });
          return { state: PLAN_STATES.FAILED, failedStep: step, result };
        }

        currentStepIndex += 1;
        return runLoop(executeTool);
      } catch (err) {
        logger.error('planExecutor approveStep error', err);
        updateState(PLAN_STATES.FAILED, { error: err.message });
        return { state: PLAN_STATES.FAILED, error: err.message };
      }
    })();

    runningPromise = promise;
    try {
      return await promise;
    } finally {
      runningPromise = null;
    }
  };

  const pause = () => {
    if (state !== PLAN_STATES.RUNNING && state !== PLAN_STATES.APPROVED) {
      return { state };
    }
    updateState(PLAN_STATES.PAUSED);
    return { state: PLAN_STATES.PAUSED };
  };

  const resume = async (executeTool) => {
    if (state !== PLAN_STATES.PAUSED) {
      return { state };
    }
    if (runningPromise) {
      throw new Error('Plan executor is already running');
    }
    updateState(PLAN_STATES.RUNNING);
    const promise = startRun(executeTool);
    runningPromise = promise;
    try {
      return await promise;
    } finally {
      runningPromise = null;
    }
  };

  const abort = () => {
    updateState(PLAN_STATES.ABORTED);
    return { state: PLAN_STATES.ABORTED };
  };

  const getState = () => ({
    state,
    currentStepIndex,
    pendingApprovalStep,
    plan,
  });

  return {
    run,
    approveStep,
    pause,
    resume,
    abort,
    getState,
    PLAN_STATES,
  };
}

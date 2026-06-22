'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createZedPlanRunner, PLAN_STATES } from './zedPlanRunner';
import { dispatchZedAuraOutcome } from './zedOverlayEvents';

/**
 * React wrapper around `createZedPlanRunner`.
 *
 * Keeps UI state in sync with the supervised plan executor and exposes
 * pause/resume/abort controls.
 */
export function useZedPlanRunner({ context = {}, onPlanComplete = null } = {}) {
  const [planState, setPlanState] = useState(PLAN_STATES.APPROVED);
  const [currentPlanStep, setCurrentPlanStep] = useState(null);
  const [pendingStepApproval, setPendingStepApproval] = useState(null);
  const [planResults, setPlanResults] = useState([]);
  const [planError, setPlanError] = useState(null);
  const runnerRef = useRef(null);
  const contextRef = useRef(context);

  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  const reset = useCallback(() => {
    setPlanState(PLAN_STATES.APPROVED);
    setCurrentPlanStep(null);
    setPendingStepApproval(null);
    setPlanResults([]);
    setPlanError(null);
    runnerRef.current = null;
  }, []);

  const getRunner = useCallback(() => {
    if (!runnerRef.current) {
      runnerRef.current = createZedPlanRunner({
        context: contextRef.current,
        onStepStart: (step) => {
          setCurrentPlanStep({
            tool: step.tool,
            label: step.label || step.tool,
            status: 'running',
            input: step.input,
          });
        },
        onStepDone: (step, result) => {
          const ok = !result?.error;
          setCurrentPlanStep({
            tool: step.tool,
            label: step.label || step.tool,
            status: ok ? 'ok' : 'error',
            input: step.input,
            result,
          });
          setPlanResults((prev) => [
            ...prev,
            { tool: step.tool, input: step.input, result, executedAt: step.executedAt },
          ]);
          dispatchZedAuraOutcome(ok ? 'success' : 'error');
        },
        onStateChange: (state, payload) => {
          setPlanState(state);
          if (state === PLAN_STATES.AWAITING_HUMAN && payload?.step) {
            setPendingStepApproval(payload.step);
          }
          if (state === PLAN_STATES.RUNNING) {
            setPendingStepApproval(null);
          }
        },
      });
    }
    return runnerRef.current;
  }, []);

  const runPlan = useCallback(
    async (plan, { onComplete = null } = {}) => {
      reset();
      const runner = getRunner();
      try {
        const result = await runner.run(plan);
        setPlanState(result.state);
        if (result.state === PLAN_STATES.COMPLETED) {
          onComplete?.(result.plan);
          onPlanComplete?.(result.plan);
        }
        return result;
      } catch (err) {
        setPlanError(err.message);
        setPlanState(PLAN_STATES.FAILED);
        dispatchZedAuraOutcome('error');
        return { state: PLAN_STATES.FAILED, error: err.message };
      }
    },
    [getRunner, reset, onPlanComplete]
  );

  const approveStep = useCallback(async () => {
    const runner = getRunner();
    try {
      const result = await runner.approveStep();
      setPlanState(result.state);
      return result;
    } catch (err) {
      setPlanError(err.message);
      setPlanState(PLAN_STATES.FAILED);
      dispatchZedAuraOutcome('error');
      return { state: PLAN_STATES.FAILED, error: err.message };
    }
  }, [getRunner]);

  const pause = useCallback(() => {
    const runner = getRunner();
    const result = runner.pause();
    setPlanState(result.state);
  }, [getRunner]);

  const resume = useCallback(async () => {
    const runner = getRunner();
    try {
      const result = await runner.resume();
      setPlanState(result.state);
      return result;
    } catch (err) {
      setPlanError(err.message);
      setPlanState(PLAN_STATES.FAILED);
      dispatchZedAuraOutcome('error');
      return { state: PLAN_STATES.FAILED, error: err.message };
    }
  }, [getRunner]);

  const abort = useCallback(() => {
    const runner = getRunner();
    const result = runner.abort();
    setPlanState(result.state);
  }, [getRunner]);

  return {
    planState,
    currentPlanStep,
    pendingStepApproval,
    planResults,
    planError,
    runPlan,
    approveStep,
    pause,
    resume,
    abort,
    reset,
    PLAN_STATES,
    isPlanRunning: planState === PLAN_STATES.RUNNING || planState === PLAN_STATES.AWAITING_HUMAN,
  };
}

export { PLAN_STATES };
export default useZedPlanRunner;

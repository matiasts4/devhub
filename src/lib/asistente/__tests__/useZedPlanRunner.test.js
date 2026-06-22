/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useZedPlanRunner, PLAN_STATES } from '../useZedPlanRunner';

describe('useZedPlanRunner', () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, tool: 'list_terminals', input: {}, result: { processes: [] } }),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('initial state is approved', () => {
    const { result } = renderHook(() => useZedPlanRunner());
    expect(result.current.planState).toBe(PLAN_STATES.APPROVED);
    expect(result.current.isPlanRunning).toBe(false);
  });

  test('runs a plan and updates state', async () => {
    const { result } = renderHook(() => useZedPlanRunner());

    await act(async () => {
      await result.current.runPlan([{ step: 1, tool: 'list_terminals', input: {} }]);
    });

    expect(result.current.planState).toBe(PLAN_STATES.COMPLETED);
    expect(result.current.planResults).toHaveLength(1);
  });

  test('pause and resume update state', async () => {
    const { result } = renderHook(() => useZedPlanRunner());

    act(() => {
      result.current.pause();
    });
    expect(result.current.planState).toBe(PLAN_STATES.PAUSED);

    await act(async () => {
      await result.current.resume();
    });

    expect(result.current.planState).toBe(PLAN_STATES.COMPLETED);
  });

  test('abort stops the plan', async () => {
    const { result } = renderHook(() => useZedPlanRunner());

    await act(async () => {
      // Start running, then abort from an event handler mid-flight is hard to
      // time in tests; pause before run and abort instead.
      result.current.pause();
      result.current.abort();
      await result.current.resume();
    });

    expect(result.current.planState).toBe(PLAN_STATES.ABORTED);
  });
});

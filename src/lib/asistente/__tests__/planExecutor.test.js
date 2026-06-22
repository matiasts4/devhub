/**
 * @jest-environment node
 */

import { createPlanExecutor, PLAN_STATES } from '../planExecutor';

describe('planExecutor', () => {
  test('executes a simple plan to completion', async () => {
    const events = [];
    const executor = createPlanExecutor({
      onEvent: (evt) => events.push(evt),
    });

    const executeTool = jest.fn(async (tool, input) => ({ ok: true, tool, input }));

    const result = await executor.run(
      [
        { step: 1, tool: 'list_terminals', input: {} },
        { step: 2, tool: 'list_terminals', input: {} },
      ],
      executeTool
    );

    expect(result.state).toBe(PLAN_STATES.COMPLETED);
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(events.filter((e) => e.type === 'step_done').length).toBe(2);
  });

  test('pauses before starting and resumes execution', async () => {
    const executor = createPlanExecutor();
    const executeTool = jest.fn(async () => ({ ok: true }));

    // Pause before starting.
    executor.pause();
    expect(executor.getState().state).toBe(PLAN_STATES.PAUSED);

    const runPromise = executor.run(
      [
        { step: 1, tool: 'list_terminals', input: {} },
        { step: 2, tool: 'list_terminals', input: {} },
        { step: 3, tool: 'list_terminals', input: {} },
      ],
      executeTool
    );

    // The loop should see PAUSED immediately and stop before executing.
    await runPromise;
    expect(executor.getState().state).toBe(PLAN_STATES.PAUSED);
    expect(executeTool).toHaveBeenCalledTimes(0);

    const resumeResult = await executor.resume(executeTool);
    expect(resumeResult.state).toBe(PLAN_STATES.COMPLETED);
    expect(executeTool).toHaveBeenCalledTimes(3);
  }, 10000);

  test('aborts execution between steps', async () => {
    const executor = createPlanExecutor();
    const executeTool = jest.fn(async () => ({ ok: true }));

    const runPromise = executor.run(
      [
        { step: 1, tool: 'list_terminals', input: {} },
        { step: 2, tool: 'list_terminals', input: {} },
      ],
      executeTool
    );

    while (executeTool.mock.calls.length < 1) {
      await new Promise((r) => setTimeout(r, 10));
    }
    executor.abort();

    const result = await runPromise;
    expect(result.state).toBe(PLAN_STATES.ABORTED);
    expect(executeTool).toHaveBeenCalledTimes(1);
  }, 10000);

  test('stops for critical step approval', async () => {
    const executor = createPlanExecutor();
    const executeTool = jest.fn(async () => ({ ok: true }));

    const result = await executor.run(
      [
        { step: 1, tool: 'list_terminals', input: {} },
        { step: 2, tool: 'close_terminal', input: { name: 'Panel-A' } },
      ],
      executeTool
    );

    expect(result.state).toBe(PLAN_STATES.AWAITING_HUMAN);
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  test('approving critical step continues execution', async () => {
    const executor = createPlanExecutor();
    const executeTool = jest.fn(async () => ({ ok: true }));

    await executor.run(
      [
        { step: 1, tool: 'close_terminal', input: { name: 'Panel-A' } },
        { step: 2, tool: 'list_terminals', input: {} },
      ],
      executeTool
    );

    const result = await executor.approveStep(executeTool);

    expect(result.state).toBe(PLAN_STATES.COMPLETED);
    expect(executeTool).toHaveBeenCalledTimes(2);
  });

  test('retries transient errors', async () => {
    const executor = createPlanExecutor();
    let calls = 0;
    const executeTool = jest.fn(async () => {
      calls += 1;
      if (calls < 3) return { error: 'transient' };
      return { ok: true };
    });

    const result = await executor.run(
      [{ step: 1, tool: 'list_terminals', input: {} }],
      executeTool
    );

    expect(result.state).toBe(PLAN_STATES.COMPLETED);
    expect(executeTool).toHaveBeenCalledTimes(3);
  });

  test('fails after max retries', async () => {
    const executor = createPlanExecutor();
    const executeTool = jest.fn(async () => ({ error: 'always fails' }));

    const result = await executor.run(
      [{ step: 1, tool: 'list_terminals', input: {} }],
      executeTool
    );

    expect(result.state).toBe(PLAN_STATES.FAILED);
    expect(executeTool).toHaveBeenCalledTimes(4); // initial + 3 retries
  });
});

/**
 * @jest-environment jsdom
 */

import { createZedPlanRunner, PLAN_STATES } from '../zedPlanRunner';

describe('createZedPlanRunner', () => {
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

  test('executes a simple plan', async () => {
    const runner = createZedPlanRunner();
    const result = await runner.run([
      { step: 1, tool: 'list_terminals', input: {} },
      { step: 2, tool: 'list_terminals', input: {} },
    ]);

    expect(result.state).toBe(PLAN_STATES.COMPLETED);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/assistant/execute-plan-step',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('list_terminals'),
      })
    );
  });

  test('pauses before running and resumes', async () => {
    const runner = createZedPlanRunner();
    runner.pause();
    const runResult = await runner.run([{ step: 1, tool: 'list_terminals', input: {} }]);
    expect(runResult.state).toBe(PLAN_STATES.PAUSED);
    expect(fetchSpy).not.toHaveBeenCalled();

    const resumeResult = await runner.resume();
    expect(resumeResult.state).toBe(PLAN_STATES.COMPLETED);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test('calls event handlers', async () => {
    const onStepStart = jest.fn();
    const onStepDone = jest.fn();
    const onStateChange = jest.fn();

    const runner = createZedPlanRunner({
      onStepStart,
      onStepDone,
      onStateChange,
    });

    await runner.run([{ step: 1, tool: 'list_terminals', input: {} }]);

    expect(onStepStart).toHaveBeenCalled();
    expect(onStepDone).toHaveBeenCalled();
    expect(onStateChange).toHaveBeenCalledWith(PLAN_STATES.COMPLETED, expect.any(Object));
  });

  test('handles server error', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    });

    const runner = createZedPlanRunner();
    const result = await runner.run([{ step: 1, tool: 'list_terminals', input: {} }]);

    expect(result.state).toBe(PLAN_STATES.FAILED);
  });

  test('updates workspace_terminals after open_terminal', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        tool: 'open_terminal',
        input: { command: 'ls' },
        result: { terminalId: 't1', displayName: 'Panel-1', cwd: '/home' },
      }),
    });

    const runner = createZedPlanRunner({
      context: { workspace_terminals: [] },
    });

    await runner.run([{ step: 1, tool: 'open_terminal', input: { command: 'ls' } }]);
    const state = runner.getState();
    expect(state.plan[0].result.terminalId).toBe('t1');
  });
});

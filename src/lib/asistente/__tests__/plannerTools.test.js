/**
 * @jest-environment node
 */

const { createPlanTool, executePlanTool } = require('../tools/planner');

describe('planner tools', () => {
  test('create_plan returns a plan for delegation objective', async () => {
    const result = await createPlanTool.execute({
      objective: 'delegar la tarea 14 a OpenCode',
    });
    expect(result.objective).toBe('delegar la tarea 14 a OpenCode');
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.requires_confirmation).toBe(true);
  });

  test('create_plan returns a plan for task creation', async () => {
    const result = await createPlanTool.execute({
      objective: 'crear una tarea para refactorizar el router',
    });
    expect(result.steps.some((s) => s.tool === 'create_task')).toBe(true);
  });

  test('create_plan requires objective', async () => {
    const result = await createPlanTool.execute({});
    expect(result.error).toBe('missing required parameter: objective');
  });

  test('execute_plan accepts a plan', async () => {
    const plan = [{ tool: 'create_task', input: { title: 'x' } }];
    const result = await executePlanTool.execute({ plan });
    expect(result.success).toBe(true);
    expect(result.steps).toBe(1);
  });

  test('execute_plan rejects empty plan', async () => {
    const result = await executePlanTool.execute({ plan: [] });
    expect(result.error).toBe('empty_plan');
  });
});

const { TASK_STATUSES, TASK_STATUS_LABELS } = require('../taskStatuses');

describe('taskStatuses', () => {
  test('includes qa_ready between execution and completion lanes', () => {
    expect(TASK_STATUSES).toEqual(['pending', 'in_progress', 'qa_ready', 'blocked', 'completed']);
    expect(TASK_STATUS_LABELS.qa_ready).toBe('Pendiente revisión');
  });
});

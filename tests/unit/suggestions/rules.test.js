/**
 * Unit tests for src/lib/suggestions/rules.js
 * Covers all 8 rules + priority ordering + max-5 cap + empty-tasks guard.
 */

const { buildLocalSuggestions } = require('../../../src/lib/suggestions/rules');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides = {}) {
  return {
    id: 'task-' + Math.random().toString(36).slice(2),
    title: 'Some task',
    status: 'pending',
    priority: 'medium',
    due_date: null,
    assigned_to: 'user-1',
    stale_alert: 0,
    ...overrides,
  };
}

function makeMilestone(overrides = {}) {
  return {
    id: 'ms-' + Math.random().toString(36).slice(2),
    title: 'Some milestone',
    status: 'planned',
    due_date: null,
    ...overrides,
  };
}

function makeProject(overrides = {}) {
  return { id: 'proj-1', name: 'Test Project', progress: 50, ...overrides };
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

// ── Guard ─────────────────────────────────────────────────────────────────────

describe('buildLocalSuggestions — guard', () => {
  test('returns empty array when no tasks', () => {
    const result = buildLocalSuggestions(makeProject(), [], []);
    expect(result).toEqual([]);
  });
});

// ── Rule 1 — blocked tasks → alert ───────────────────────────────────────────

describe('Rule 1 — blocked tasks', () => {
  test('blocked task produces alert suggestion', () => {
    const tasks = [makeTask({ status: 'blocked' }), makeTask()];
    const result = buildLocalSuggestions(makeProject(), tasks, []);
    const blocked = result.find(
      (s) => s.type === 'alert' && s.title.toLowerCase().includes('bloqu')
    );
    expect(blocked).toBeDefined();
    expect(blocked.id).toBeTruthy();
    expect(blocked.action_hint).toBeTruthy();
  });

  test('no blocked tasks does NOT produce blocked alert', () => {
    const tasks = [makeTask({ status: 'pending' }), makeTask({ status: 'in_progress' })];
    const result = buildLocalSuggestions(makeProject(), tasks, []);
    const blocked = result.find((s) => s.title.toLowerCase().includes('bloqu'));
    expect(blocked).toBeUndefined();
  });
});

// ── Rule 2 — overdue tasks → risk ────────────────────────────────────────────

describe('Rule 2 — overdue tasks', () => {
  test('overdue pending task produces risk suggestion', () => {
    const tasks = [makeTask({ due_date: daysFromNow(-3), status: 'pending' }), makeTask()];
    const result = buildLocalSuggestions(makeProject(), tasks, []);
    const overdue = result.find(
      (s) => s.type === 'risk' && s.title.toLowerCase().includes('vencid')
    );
    expect(overdue).toBeDefined();
  });

  test('completed overdue task does NOT trigger risk', () => {
    const tasks = [makeTask({ due_date: daysFromNow(-3), status: 'completed' })];
    const result = buildLocalSuggestions(makeProject(), tasks, []);
    const overdue = result.find((s) => s.title.toLowerCase().includes('vencid'));
    expect(overdue).toBeUndefined();
  });
});

// ── Rule 3 — milestone due < 7 days → alert ───────────────────────────────────

describe('Rule 3 — near milestones', () => {
  test('milestone due in 5 days produces alert', () => {
    const milestones = [makeMilestone({ due_date: daysFromNow(5), status: 'planned' })];
    const result = buildLocalSuggestions(makeProject(), [makeTask()], milestones);
    const near = result.find((s) => s.type === 'alert' && s.title.toLowerCase().includes('hito'));
    expect(near).toBeDefined();
  });

  test('completed milestone does NOT trigger near alert', () => {
    const milestones = [makeMilestone({ due_date: daysFromNow(5), status: 'completed' })];
    const result = buildLocalSuggestions(makeProject(), [makeTask()], milestones);
    const near = result.find((s) => s.title.toLowerCase().includes('hito') && s.type === 'alert');
    expect(near).toBeUndefined();
  });
});

// ── Rule 4 — milestone at_risk → risk ────────────────────────────────────────

describe('Rule 4 — at_risk milestones', () => {
  test('milestone with at_risk status produces risk', () => {
    const milestones = [makeMilestone({ status: 'at_risk' })];
    const result = buildLocalSuggestions(makeProject(), [makeTask()], milestones);
    const atRisk = result.find(
      (s) => s.type === 'risk' && s.title.toLowerCase().includes('riesgo')
    );
    expect(atRisk).toBeDefined();
  });
});

// ── Rule 5 — stale_alert → alert ─────────────────────────────────────────────

describe('Rule 5 — stale tasks', () => {
  test('stale_alert === 1 produces alert', () => {
    const tasks = [makeTask({ stale_alert: 1 }), makeTask()];
    const result = buildLocalSuggestions(makeProject(), tasks, []);
    const stale = result.find(
      (s) => s.type === 'alert' && s.title.toLowerCase().includes('estanc')
    );
    expect(stale).toBeDefined();
  });

  test('stale_alert === true also produces alert', () => {
    const tasks = [makeTask({ stale_alert: true }), makeTask()];
    const result = buildLocalSuggestions(makeProject(), tasks, []);
    const stale = result.find(
      (s) => s.type === 'alert' && s.title.toLowerCase().includes('estanc')
    );
    expect(stale).toBeDefined();
  });
});

// ── Rule 6 — unassigned tasks → tip ──────────────────────────────────────────

describe('Rule 6 — unassigned tasks', () => {
  test('unassigned pending task produces tip', () => {
    const tasks = [makeTask({ assigned_to: null, status: 'pending' }), makeTask()];
    const result = buildLocalSuggestions(makeProject(), tasks, []);
    const tip = result.find((s) => s.type === 'tip');
    expect(tip).toBeDefined();
  });

  test('unassigned completed task does NOT produce unassigned tip', () => {
    const tasks = [makeTask({ assigned_to: null, status: 'completed' }), makeTask()];
    const result = buildLocalSuggestions(makeProject(), tasks, []);
    const unassignedTip = result.find(
      (s) => s.type === 'tip' && s.description?.toLowerCase().includes('asign')
    );
    expect(unassignedTip).toBeUndefined();
  });
});

// ── Rule 7 — critical pending → opportunity ───────────────────────────────────

describe('Rule 7 — critical pending tasks', () => {
  test('critical pending task produces opportunity', () => {
    const tasks = [makeTask({ priority: 'critical', status: 'pending' }), makeTask()];
    const result = buildLocalSuggestions(makeProject(), tasks, []);
    const opp = result.find((s) => s.type === 'opportunity');
    expect(opp).toBeDefined();
  });

  test('critical completed task does NOT produce opportunity', () => {
    const tasks = [makeTask({ priority: 'critical', status: 'completed' }), makeTask()];
    const result = buildLocalSuggestions(makeProject(), tasks, []);
    const opp = result.find((s) => s.type === 'opportunity');
    expect(opp).toBeUndefined();
  });
});

// ── Rule 8 — stagnated progress → alert ──────────────────────────────────────

describe('Rule 8 — stagnated progress', () => {
  test('progress < 10 with tasks produces stagnation alert', () => {
    const project = makeProject({ progress: 5 });
    const result = buildLocalSuggestions(project, [makeTask(), makeTask()], []);
    const stagnated = result.find(
      (s) => s.type === 'alert' && s.title.toLowerCase().includes('progreso')
    );
    expect(stagnated).toBeDefined();
  });

  test('progress >= 10 does NOT produce stagnation alert', () => {
    const project = makeProject({ progress: 30 });
    const result = buildLocalSuggestions(project, [makeTask(), makeTask()], []);
    const stagnated = result.find(
      (s) => s.type === 'alert' && s.title.toLowerCase().includes('progreso')
    );
    expect(stagnated).toBeUndefined();
  });
});

// ── Priority ordering ─────────────────────────────────────────────────────────

describe('Priority ordering — risk > alert > opportunity > tip', () => {
  test('risks come before alerts, alerts before opportunities, opportunities before tips', () => {
    const project = makeProject({ progress: 5 });
    const tasks = [
      makeTask({ status: 'blocked' }),
      makeTask({ due_date: daysFromNow(-1), status: 'pending' }),
      makeTask({ priority: 'critical', status: 'pending' }),
      makeTask({ assigned_to: null, status: 'pending' }),
      makeTask(),
    ];
    const milestones = [makeMilestone({ status: 'at_risk' })];
    const result = buildLocalSuggestions(project, tasks, milestones);

    const ORDER = { risk: 0, alert: 1, opportunity: 2, tip: 3 };
    for (let i = 1; i < result.length; i++) {
      const prevOrder = ORDER[result[i - 1].type] ?? 99;
      const currOrder = ORDER[result[i].type] ?? 99;
      expect(prevOrder).toBeLessThanOrEqual(currOrder);
    }
  });
});

// ── Max 5 cap ─────────────────────────────────────────────────────────────────

describe('Max 5 suggestions cap', () => {
  test('returns at most 5 suggestions even with many triggers', () => {
    const project = makeProject({ progress: 5 });
    const tasks = [
      makeTask({ status: 'blocked' }),
      makeTask({ due_date: daysFromNow(-1), status: 'pending' }),
      makeTask({ priority: 'critical', status: 'pending' }),
      makeTask({ assigned_to: null, status: 'pending' }),
      makeTask({ stale_alert: 1 }),
      makeTask(),
    ];
    const milestones = [
      makeMilestone({ status: 'at_risk' }),
      makeMilestone({ due_date: daysFromNow(3), status: 'planned' }),
    ];
    const result = buildLocalSuggestions(project, tasks, milestones);
    expect(result.length).toBeLessThanOrEqual(5);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Schema validation ─────────────────────────────────────────────────────────

describe('Suggestion schema', () => {
  test('every suggestion has required fields with correct types', () => {
    const tasks = [makeTask({ status: 'blocked' })];
    const result = buildLocalSuggestions(makeProject(), tasks, []);
    expect(result.length).toBeGreaterThanOrEqual(1);
    for (const s of result) {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
      expect(typeof s.title).toBe('string');
      expect(s.title.length).toBeGreaterThan(0);
      expect(['risk', 'alert', 'opportunity', 'tip']).toContain(s.type);
      expect(typeof s.description).toBe('string');
      expect(typeof s.action_hint).toBe('string');
    }
  });
});

/**
 * Unit tests for SwarmQueuePanel pure logic functions.
 *
 * Per the Extract-Before-Mock rule: we extract pure logic functions
 * from SwarmQueuePanel and test them directly — no mocks needed.
 *
 * Functions under test (exported from SwarmQueuePanel.jsx):
 *   - formatWaitMs(ms)          → human-readable wait time
 *   - buildItemsFromResponse(data) → normalizes API response to panel items
 *   - removeItemFromList(items, id) → optimistic cancel helper
 */

// These will be exported from SwarmQueuePanel.jsx
const {
  formatWaitMs,
  buildItemsFromResponse,
  removeItemFromList,
  buildOperationalQueueBanner,
  buildSupervisorSnapshotSummary,
} = require('../SwarmQueuePanel.jsx');

describe('SwarmQueuePanel pure logic', () => {
  // ─── formatWaitMs ────────────────────────────────────────────────────────

  describe('formatWaitMs()', () => {
    test('returns "< 1s" for 0 ms', () => {
      expect(formatWaitMs(0)).toBe('< 1s');
    });

    test('returns seconds string for ms < 60000', () => {
      expect(formatWaitMs(30000)).toBe('30s');
    });

    test('returns minutes string for ms >= 60000', () => {
      expect(formatWaitMs(90000)).toBe('1m 30s');
    });

    test('returns minutes-only for exact minute boundaries', () => {
      expect(formatWaitMs(120000)).toBe('2m 0s');
    });
  });

  // ─── buildItemsFromResponse ──────────────────────────────────────────────

  describe('buildItemsFromResponse()', () => {
    test('returns empty array when response has no queue items', () => {
      const data = {
        queue: { length: 0, items: [] },
        process: { healthy: true },
        concurrency: { active: 0, max: 5 },
      };
      const result = buildItemsFromResponse(data);
      expect(result).toEqual([]);
    });

    test('maps items with id, position, agent, title, estimatedWaitMs', () => {
      const data = {
        queue: {
          length: 2,
          items: [
            { id: 'abc', position: 1, agent: 'claude', title: 'Fix bug', estimatedWaitMs: 30000 },
            { id: 'def', position: 2, agent: 'gpt-4', title: 'Write docs', estimatedWaitMs: 60000 },
          ],
        },
        process: { healthy: true },
        concurrency: { active: 1, max: 5 },
      };

      const result = buildItemsFromResponse(data);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('abc');
      expect(result[0].position).toBe(1);
      expect(result[0].agent).toBe('claude');
      expect(result[0].title).toBe('Fix bug');
      expect(result[1].id).toBe('def');
      expect(result[1].estimatedWaitMs).toBe(60000);
    });

    test('returns empty array when data is null', () => {
      expect(buildItemsFromResponse(null)).toEqual([]);
    });

    test('returns empty array when queue.items is missing', () => {
      const data = { queue: { length: 0 } };
      expect(buildItemsFromResponse(data)).toEqual([]);
    });

    test('normalizes supervisor snapshots from MCP queue payloads', () => {
      const data = {
        queue: [
          {
            id: 'task-1',
            title: 'Supervisor contract',
            agent: 'worker-1',
            supervisor_snapshot: {
              supervisor_state: 'awaiting_approval',
              outcome: 'request_approval',
              reason_class: 'approval_required',
              task_retry_count: 1,
              attempt_count: 2,
              unchanged_failure_count: 0,
              approval_request_count: 3,
              orphan_recovery_count: 0,
              evidence_ref: 'evidence://supervisor/task-1',
              updated_at: '2026-05-19T06:45:00.000Z',
            },
          },
        ],
      };

      const result = buildItemsFromResponse(data);

      expect(result).toHaveLength(1);
      expect(result[0].position).toBe(1);
      expect(result[0].supervisor).toEqual({
        supervisor_state: 'awaiting_approval',
        outcome: 'request_approval',
        reason_class: 'approval_required',
        task_retry_count: 1,
        attempt_count: 2,
        unchanged_failure_count: 0,
        approval_request_count: 3,
        orphan_recovery_count: 0,
        workspace_id: null,
        run_id: null,
        evidence_ref: 'evidence://supervisor/task-1',
        updated_at: '2026-05-19T06:45:00.000Z',
      });
    });

    test('strips non-snapshot approval internals from queue supervisor payloads', () => {
      const data = {
        queue: {
          items: [
            {
              id: 'task-2',
              position: 2,
              agent: 'worker-2',
              title: 'Recover orphan',
              supervisor: {
                supervisorState: 'recovering_orphan',
                outcome: 'recover_orphan',
                reasonClass: 'stale_lease',
                taskRetryCount: 0,
                attemptCount: 4,
                unchangedFailureCount: 1,
                approvalRequestCount: 0,
                orphanRecoveryCount: 2,
                workspaceId: 'ws-2',
                runId: 'run-2',
                evidenceRef: 'evidence://supervisor/task-2',
                updatedAt: '2026-05-19T06:46:00.000Z',
                approval_checkpoint: { status: 'pending' },
              },
            },
          ],
        },
      };

      const result = buildItemsFromResponse(data);

      expect(result[0].supervisor).toEqual({
        supervisor_state: 'recovering_orphan',
        outcome: 'recover_orphan',
        reason_class: 'stale_lease',
        task_retry_count: 0,
        attempt_count: 4,
        unchanged_failure_count: 1,
        approval_request_count: 0,
        orphan_recovery_count: 2,
        workspace_id: 'ws-2',
        run_id: 'run-2',
        evidence_ref: 'evidence://supervisor/task-2',
        updated_at: '2026-05-19T06:46:00.000Z',
      });
    });

    test('normalizes blocked supervisor snapshots used for unchanged-failure rendering', () => {
      const data = {
        queue: [
          {
            id: 'task-3',
            title: 'Repeated failure',
            supervisor_snapshot: {
              supervisor_state: 'blocked',
              outcome: 'block',
              reason_class: 'unchanged_failure',
              task_retry_count: 2,
              attempt_count: 3,
              unchanged_failure_count: 1,
              approval_request_count: 0,
              orphan_recovery_count: 0,
              workspace_id: 'ws-3',
              run_id: 'run-3',
              evidence_ref: 'evidence://supervisor/task-3/repeat',
              updated_at: '2026-05-19T06:47:00.000Z',
            },
          },
        ],
      };

      const result = buildItemsFromResponse(data);

      expect(result[0].supervisor).toEqual({
        supervisor_state: 'blocked',
        outcome: 'block',
        reason_class: 'unchanged_failure',
        task_retry_count: 2,
        attempt_count: 3,
        unchanged_failure_count: 1,
        approval_request_count: 0,
        orphan_recovery_count: 0,
        workspace_id: 'ws-3',
        run_id: 'run-3',
        evidence_ref: 'evidence://supervisor/task-3/repeat',
        updated_at: '2026-05-19T06:47:00.000Z',
      });
    });
  });

  // ─── removeItemFromList ──────────────────────────────────────────────────

  describe('removeItemFromList()', () => {
    const items = [
      { id: 'a', position: 1, title: 'Task A' },
      { id: 'b', position: 2, title: 'Task B' },
      { id: 'c', position: 3, title: 'Task C' },
    ];

    test('removes item by id and returns new array', () => {
      const result = removeItemFromList(items, 'b');
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.id)).toEqual(['a', 'c']);
    });

    test('returns original array unchanged when id not found', () => {
      const result = removeItemFromList(items, 'z');
      expect(result).toHaveLength(3);
      expect(result).toEqual(items);
    });

    test('does not mutate the original array', () => {
      const original = [...items];
      removeItemFromList(items, 'a');
      expect(items).toHaveLength(3);
      expect(items).toEqual(original);
    });
  });

  describe('buildOperationalQueueBanner()', () => {
    test('builds a canonical warning banner for in-memory queue state', () => {
      const result = buildOperationalQueueBanner({
        status: 'healthy',
        authority: 'authoritative',
        length: 2,
        estimated_wait_ms: 5000,
      });

      expect(result.tone).toBe('warning');
      expect(result.title).toBe('Cola en memoria');
      expect(result.body).toContain('2 tarea');
    });

    test('degrades copy when canonical queue health is unavailable', () => {
      const result = buildOperationalQueueBanner(null);

      expect(result.tone).toBe('muted');
      expect(result.title).toBe('Cola sin telemetría');
      expect(result.body).toContain('snapshot canónico');
    });
  });

  describe('buildSupervisorSnapshotSummary()', () => {
    test('formats state, reason, counters, and evidence ref for downstream consumers', () => {
      const result = buildSupervisorSnapshotSummary({
        supervisor_state: 'awaiting_approval',
        reason_class: 'approval_required',
        task_retry_count: 1,
        attempt_count: 2,
        approval_request_count: 3,
        evidence_ref: 'evidence://supervisor/task-1',
      });

      expect(result.stateLabel).toBe('AWAITING APPROVAL');
      expect(result.reasonLabel).toBe('approval_required');
      expect(result.counters).toEqual(['Intentos 2', 'Retries 1', 'Aprobaciones 3']);
      expect(result.evidenceRef).toBe('evidence://supervisor/task-1');
    });

    test('returns null when no supervisor snapshot is present', () => {
      expect(buildSupervisorSnapshotSummary(null)).toBeNull();
    });

    test('formats blocked unchanged-failure counters for queue rendering', () => {
      const result = buildSupervisorSnapshotSummary({
        supervisor_state: 'blocked',
        reason_class: 'unchanged_failure',
        task_retry_count: 2,
        attempt_count: 3,
        evidence_ref: 'evidence://supervisor/task-3/repeat',
      });

      expect(result.stateLabel).toBe('BLOCKED');
      expect(result.reasonLabel).toBe('unchanged_failure');
      expect(result.counters).toEqual(['Intentos 3', 'Retries 2']);
      expect(result.evidenceRef).toBe('evidence://supervisor/task-3/repeat');
    });

    test('formats orphan recovery counters for queue rendering', () => {
      const result = buildSupervisorSnapshotSummary({
        supervisor_state: 'recovering_orphan',
        reason_class: 'orphaned_workspace',
        attempt_count: 1,
        orphan_recovery_count: 2,
        evidence_ref: 'evidence://supervisor/task-4/orphan',
      });

      expect(result.stateLabel).toBe('RECOVERING ORPHAN');
      expect(result.reasonLabel).toBe('orphaned_workspace');
      expect(result.counters).toEqual(['Intentos 1', 'Recuperaciones 2']);
      expect(result.evidenceRef).toBe('evidence://supervisor/task-4/orphan');
    });
  });
});

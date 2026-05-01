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
});

/**
 * @jest-environment node
 */

const Database = require('better-sqlite3');
const { ensureAllSchema } = require('../../db/schema');
const {
  recordZedTelemetryEvent,
  getZedTelemetrySummary,
  pruneZedTelemetry,
} = require('../zedTelemetry');

describe('zedTelemetry', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    ensureAllSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  test('records and retrieves events', () => {
    recordZedTelemetryEvent(db, {
      eventType: 'zed.llm_call',
      userId: 'user-1',
      messageId: 'msg-1',
      payload: { durationMs: 120, model: 'MiniMax-M3' },
    });

    const summary = getZedTelemetrySummary(db);
    expect(summary.total).toBe(1);
    expect(summary.byType['zed.llm_call']).toBe(1);
    expect(summary.recent[0].event_type).toBe('zed.llm_call');
    expect(summary.recent[0].payload.durationMs).toBe(120);
  });

  test('filters by userId', () => {
    recordZedTelemetryEvent(db, { eventType: 'zed.fast_path_hit', userId: 'user-a' });
    recordZedTelemetryEvent(db, { eventType: 'zed.fast_path_hit', userId: 'user-b' });

    const summary = getZedTelemetrySummary(db, { userId: 'user-a' });
    expect(summary.total).toBe(1);
  });

  test('throws when eventType is missing', () => {
    expect(() => recordZedTelemetryEvent(db, { userId: 'u' })).toThrow('eventType is required');
  });

  test('prunes old events', () => {
    recordZedTelemetryEvent(db, { eventType: 'zed.llm_call', userId: 'u' });
    const summaryBefore = getZedTelemetrySummary(db);
    expect(summaryBefore.total).toBe(1);

    const future = new Date(Date.now() + 86400000).toISOString();
    const result = pruneZedTelemetry(db, future);
    expect(result.deleted).toBe(1);

    const summaryAfter = getZedTelemetrySummary(db);
    expect(summaryAfter.total).toBe(0);
  });
});

/**
 * @jest-environment jsdom
 */

const {
  recordIntentResolution,
  recordFastPath,
  recordChatRoundTrip,
  getMetricsSummary,
  clearMetrics,
  ZED_METRICS_STORAGE_KEY,
} = require('../zedMetrics');

describe('zedMetrics', () => {
  beforeEach(() => {
    clearMetrics();
  });

  afterEach(() => {
    clearMetrics();
  });

  test('records intent resolutions', () => {
    recordIntentResolution({
      message: 'abre una terminal',
      tier: 'local-high',
      confidence: 0.92,
      matched: 'open_terminal_new',
      source: 'voice',
    });

    const summary = getMetricsSummary();
    expect(summary.intents.total).toBe(1);
    expect(summary.intents.localHigh).toBe(1);
    expect(summary.intents.hitRate).toBe(100);
  });

  test('records fast path events', () => {
    recordFastPath({
      intent: 'list_terminals',
      durationMs: 45,
      steps: 1,
      hit: true,
      needsConfirmation: false,
    });

    recordFastPath({
      intent: 'unknown',
      durationMs: 5,
      steps: 0,
      hit: false,
      needsConfirmation: false,
    });

    const summary = getMetricsSummary();
    expect(summary.fastPath.total).toBe(2);
    expect(summary.fastPath.hits).toBe(1);
    expect(summary.fastPath.misses).toBe(1);
    expect(summary.fastPath.hitRate).toBe(50);
    expect(summary.fastPath.avgMs).toBe(25);
    expect(summary.fastPath.p50Ms).toBeGreaterThan(0);
  });

  test('records chat round trips', () => {
    recordChatRoundTrip({ durationMs: 120, model: 'zed-fast-path', fastPath: true });
    recordChatRoundTrip({ durationMs: 2500, model: 'minimax-m3', fastPath: false });
    recordChatRoundTrip({ durationMs: 800, error: true });

    const summary = getMetricsSummary();
    expect(summary.roundTrip.total).toBe(3);
    expect(summary.roundTrip.fastPathCount).toBe(1);
    expect(summary.roundTrip.llmCount).toBe(1);
    expect(summary.roundTrip.errorCount).toBe(1);
    expect(summary.roundTrip.fastPathAvgMs).toBe(120);
    expect(summary.roundTrip.llmAvgMs).toBe(2500);
  });

  test('caps entries to MAX_ENTRIES', () => {
    for (let i = 0; i < 520; i += 1) {
      recordIntentResolution({
        message: `msg-${i}`,
        tier: 'local-high',
        confidence: 0.9,
        matched: 'test',
      });
    }

    const summary = getMetricsSummary();
    expect(summary.intents.total).toBe(500);
  });

  test('clearMetrics removes stored data', () => {
    recordIntentResolution({ message: 'x', tier: 'llm', confidence: 0, matched: '' });
    clearMetrics();
    expect(getMetricsSummary().intents.total).toBe(0);
    expect(window.localStorage.getItem(ZED_METRICS_STORAGE_KEY)).toBeNull();
  });

  test('sanitizeMessage truncates long messages', () => {
    const long = 'a'.repeat(300);
    recordIntentResolution({ message: long, tier: 'llm', confidence: 0, matched: '' });
    const raw = JSON.parse(window.localStorage.getItem(ZED_METRICS_STORAGE_KEY));
    expect(raw.intents[0].message.length).toBe(240);
  });
});

const {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  getContextUsageTone,
  mergeSessionUsage,
  resolveContextUsage,
  resolveContextWindowSize,
} = require('../../src/lib/agenthub/contextUsage');

describe('context usage helpers', () => {
  test('resolveContextUsage falls back to the default context window and computes percent', () => {
    const resolved = resolveContextUsage({
      prompt_tokens: 1200,
      completion_tokens: 3800,
      total_tokens: 5000,
      context_window_size: null,
    });

    expect(resolved.context_window_size).toBe(DEFAULT_CONTEXT_WINDOW_TOKENS);
    expect(resolved.context_utilization).toBe(2.5);
    expect(resolved.current_context_tokens).toBe(5000);
  });

  test('resolveContextUsage normalizes ratio-based utilization values from storage', () => {
    const resolved = resolveContextUsage({
      total_tokens: 170000,
      context_window_size: 200000,
      context_utilization: 0.85,
    });

    expect(resolved.context_utilization).toBe(85);
  });

  test('resolveContextWindowSize prefers the display model when transport model differs', () => {
    expect(
      resolveContextWindowSize(
        {
          display_model: 'GPT-5.4 mini',
          transport_model: 'gpt-4o-mini',
        },
        {
          displayModel: 'GPT-5.4 mini',
          transportModel: 'gpt-4o-mini',
          provider: 'copilot',
        }
      )
    ).toBe(128000);
  });

  test('resolveContextUsage preserves display model identity while resolving its context window', () => {
    const resolved = resolveContextUsage(
      {
        total_tokens: 32000,
        model: 'gpt-4o-mini',
      },
      {
        displayModel: 'GPT-5.4 mini',
        transportModel: 'gpt-4o-mini',
        provider: 'copilot',
      }
    );

    expect(resolved.model).toBe('GPT-5.4 mini');
    expect(resolved.display_model).toBe('GPT-5.4 mini');
    expect(resolved.transport_model).toBe('gpt-4o-mini');
    expect(resolved.context_window_size).toBe(128000);
    expect(resolved.context_utilization).toBe(25);
  });

  test('mergeSessionUsage recomputes utilization from live totals instead of reusing stale persisted percent', () => {
    const resolved = mergeSessionUsage(
      {
        total_tokens: 200000,
        context_window_size: 200000,
        context_utilization: 100,
      },
      {
        prompt_tokens: 1400,
        completion_tokens: 600,
        total_tokens: 2000,
      },
      {
        displayModel: 'gpt-4o',
      }
    );

    expect(resolved.total_tokens).toBe(2000);
    expect(resolved.context_window_size).toBe(128000);
    expect(resolved.context_utilization).toBe(1.6);
  });

  test('getContextUsageTone returns safe, warn, and danger thresholds', () => {
    expect(getContextUsageTone(49.9)).toBe('safe');
    expect(getContextUsageTone(50)).toBe('warn');
    expect(getContextUsageTone(81)).toBe('danger');
  });
});

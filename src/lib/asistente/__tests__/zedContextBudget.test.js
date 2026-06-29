/**
 * @jest-environment node
 */

const { estimateTokens, resolveMaxTokens, fitHistoryWithinBudget } = require('../zedContextBudget');

describe('estimateTokens', () => {
  test('returns ceil(length / 4)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('resolveMaxTokens', () => {
  test('uses simple max for explanation questions', () => {
    expect(resolveMaxTokens('explicame useEffect')).toBe(512);
    expect(resolveMaxTokens('Qué es un closure?')).toBe(512);
  });

  test('uses default max for execution/planning intents', () => {
    expect(resolveMaxTokens('ejecuta npm test')).toBe(2048);
    expect(resolveMaxTokens('crea un plan para refactorizar')).toBe(2048);
  });

  test('defaultMax overrides are respected', () => {
    expect(resolveMaxTokens('qué tal', 1024, 256)).toBe(256);
    expect(resolveMaxTokens('ejecuta ls', 1024, 256)).toBe(1024);
  });
});

describe('fitHistoryWithinBudget', () => {
  test('keeps all history when under budget', () => {
    const history = [
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'hola' },
    ];
    const result = fitHistoryWithinBudget('system', history, 10000);
    expect(result.history).toHaveLength(2);
    expect(result.droppedCount).toBe(0);
  });

  test('drops oldest messages to fit budget', () => {
    const longMessage = 'a'.repeat(8000); // 2000 tokens
    const history = [
      { role: 'user', content: 'old' },
      { role: 'assistant', content: longMessage },
      { role: 'user', content: 'recent' },
    ];
    const result = fitHistoryWithinBudget('system', history, 2000);
    expect(result.history.map((m) => m.content)).toContain('recent');
    expect(result.history.map((m) => m.content)).not.toContain('old');
    expect(result.estimatedInputTokens).toBeLessThanOrEqual(2000);
  });

  test('caps history at 20 messages', () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'x',
    }));
    const result = fitHistoryWithinBudget('system', history, 10000);
    expect(result.history).toHaveLength(20);
  });

  test('filters malformed entries', () => {
    const history = [
      { role: 'user', content: 'ok' },
      { role: 'system', content: 'ignored' },
      null,
      { role: 'assistant' },
    ];
    const result = fitHistoryWithinBudget('system', history, 10000);
    expect(result.history).toHaveLength(1);
  });
});

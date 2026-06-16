'use strict';

const { resolveZedIntent } = require('../zedIntentRouter');

const CTX = {
  workspace_terminals: [
    { terminalId: 'p1', displayName: 'Chase' },
    { terminalId: 'p2', displayName: 'Cesar' },
  ],
  terminal_panel_count: 2,
};

/** Common voice/text phrases grouped by expected routing tier. */
const PHRASE_MATRIX = [
  { phrase: '¿Qué terminales hay?', category: 'list_terminals' },
  { phrase: 'cuantas terminales abiertas hay', category: 'list_terminals' },
  { phrase: 'abrí github.com en pizarra', category: 'open_url' },
  { phrase: 'open https://example.com', category: 'open_url' },
  { phrase: 'Cierra Chase', category: 'close_chase' },
  { phrase: 'cierra la terminal Chase', category: 'close_chase' },
  { phrase: 'run npm test', category: 'run_npm_test' },
  { phrase: 'execute npm test', category: 'run_npm_test' },
  { phrase: 'ejecuta npm test', category: 'run_npm_test' },
  { phrase: 'cierra la terminal', category: 'close_implicit' },
  { phrase: 'explicame como funciona useEffect', category: 'ambiguous' },
  { phrase: 'cual es la capital de Francia', category: 'ambiguous' },
];

function isLocalTier(tier) {
  return tier === 'local-high' || tier === 'local-medium';
}

describe('zedFastPath hit rate benchmark', () => {
  const results = PHRASE_MATRIX.map(({ phrase, category }) => {
    const hit = resolveZedIntent(phrase, CTX);
    return { phrase, category, tier: hit.tier, matched: hit.matched };
  });

  test('resolves >= 60% of common phrases to local-high or local-medium', () => {
    const localHits = results.filter((r) => isLocalTier(r.tier));
    const hitRate = localHits.length / results.length;

    // ponytail: benchmark guard — fails if router regressions drop local coverage below 60%
    expect(hitRate).toBeGreaterThanOrEqual(0.6);

    if (process.env.JEST_VERBOSE_HIT_RATE === '1') {
      console.table(results);

      console.log(
        `local hit rate: ${(hitRate * 100).toFixed(1)}% (${localHits.length}/${results.length})`
      );
    }
  });

  test('expected categories resolve locally (not llm)', () => {
    const byCategory = Object.groupBy(results, (r) => r.category);

    for (const category of ['list_terminals', 'open_url', 'close_chase', 'run_npm_test']) {
      const rows = byCategory[category] || [];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.tier).not.toBe('llm');
      }
    }

    for (const row of byCategory.close_implicit || []) {
      expect(row.tier).toBe('local-medium');
    }

    for (const row of byCategory.ambiguous || []) {
      expect(row.tier).toBe('llm');
    }
  });
});

const {
  evaluateVisualThrashSla,
  VISUAL_THRASH_SLA,
} = require('../visualThrashSla');

describe('visualThrashSla', () => {
  test('exports finite thresholds', () => {
    expect(VISUAL_THRASH_SLA.longTaskWarnMs).toBeGreaterThan(0);
    expect(VISUAL_THRASH_SLA.maxShellFlexLostPerSession).toBe(0);
  });

  test('evaluateVisualThrashSla passes clean session', () => {
    expect(evaluateVisualThrashSla({})).toEqual({ ok: true, violations: [] });
  });

  test('evaluateVisualThrashSla fails on FOUC signals', () => {
    const result = evaluateVisualThrashSla({
      shellFlexLost: 1,
      cssVarMissing: 2,
      timesNewRoman: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining(['shell-flex-lost', 'css-var-missing', 'times-new-roman'])
    );
  });
});

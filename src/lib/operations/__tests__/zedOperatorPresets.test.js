const {
  DEFAULT_ZED_OPERATOR_PRESETS,
  formatOperatorPresetsForWorkerDirective,
  formatZedOperatorPresetsForPrompt,
} = require('../zedOperatorPresets.cjs');

describe('zedOperatorPresets', () => {
  test('DEFAULT presets match operator workflow (B3 V3 C1 D2)', () => {
    expect(DEFAULT_ZED_OPERATOR_PRESETS.gentleOrchestratorMenu).toEqual({
      acting: 'B3',
      version: 'V3',
      gitPr: 'C1',
      revision: 'D2',
    });
  });

  test('formatZedOperatorPresetsForPrompt includes tmux injection hints', () => {
    const text = formatZedOperatorPresetsForPrompt();
    expect(text).toContain('B3');
    expect(text).toContain('V3');
    expect(text).toContain('C1');
    expect(text).toContain('D2');
    expect(text).toContain('tmux send-keys');
  });

  test('formatOperatorPresetsForWorkerDirective is appended to worker directives', () => {
    const text = formatOperatorPresetsForWorkerDirective();
    expect(text).toContain('B3, V3, C1, D2');
    expect(text).toContain('/sdd-continue');
  });
});

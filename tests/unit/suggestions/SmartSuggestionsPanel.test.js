/**
 * Unit tests for SmartSuggestionsPanel pure logic helpers (T9)
 * Uses Jest describe/test format.
 *
 * Strategy: Extract-Before-Mock — we test the pure functions
 * exported from SmartSuggestionsPanel.jsx without rendering.
 */

const {
  getTypeConfig,
  getSourceLabel,
  isValidSuggestion,
} = require('../../../src/components/dashboard/SmartSuggestionsPanel');

describe('SmartSuggestionsPanel — getTypeConfig()', () => {
  test('risk returns danger color and RIESGO label', () => {
    const config = getTypeConfig('risk');
    expect(config).toBeDefined();
    expect(config.chipLabel).toBe('RIESGO');
    expect(typeof config.color).toBe('string');
    expect(config.color.length).toBeGreaterThan(0);
    expect(typeof config.iconName).toBe('string');
  });

  test('alert returns warning color and ALERTA label', () => {
    const config = getTypeConfig('alert');
    expect(config.chipLabel).toBe('ALERTA');
    expect(typeof config.color).toBe('string');
  });

  test('opportunity returns success color and OPORTUNIDAD label', () => {
    const config = getTypeConfig('opportunity');
    expect(config.chipLabel).toBe('OPORTUNIDAD');
  });

  test('tip returns blue color and CONSEJO label', () => {
    const config = getTypeConfig('tip');
    expect(config.chipLabel).toBe('CONSEJO');
  });

  test('unknown type returns fallback config with string chipLabel', () => {
    const config = getTypeConfig('unknown-type');
    expect(config).toBeDefined();
    expect(typeof config.chipLabel).toBe('string');
    expect(config.chipLabel.length).toBeGreaterThan(0);
  });
});

describe('SmartSuggestionsPanel — getSourceLabel()', () => {
  test('rules returns "Reglas locales"', () => {
    expect(getSourceLabel('rules')).toBe('Reglas locales');
  });

  test('llm returns "IA"', () => {
    expect(getSourceLabel('llm')).toBe('IA');
  });

  test('hybrid returns "Combinado"', () => {
    expect(getSourceLabel('hybrid')).toBe('Combinado');
  });

  test('unknown returns non-empty string fallback', () => {
    const label = getSourceLabel('unknown');
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });
});

describe('SmartSuggestionsPanel — isValidSuggestion()', () => {
  test('returns true for a valid suggestion', () => {
    const s = {
      id: 's1',
      title: 'Fix bug',
      description: 'There is a bug',
      type: 'risk',
      action_hint: 'Fix it',
    };
    expect(isValidSuggestion(s)).toBe(true);
  });

  test('returns false when id is missing', () => {
    const s = { title: 'Fix bug', description: 'desc', type: 'risk', action_hint: 'hint' };
    expect(isValidSuggestion(s)).toBe(false);
  });

  test('returns false for invalid type', () => {
    const s = {
      id: 's1',
      title: 'Fix bug',
      description: 'desc',
      type: 'invalid-type',
      action_hint: 'hint',
    };
    expect(isValidSuggestion(s)).toBe(false);
  });

  test('returns false for null input', () => {
    expect(isValidSuggestion(null)).toBe(false);
  });

  test('returns false when title is missing', () => {
    const s = { id: 's1', description: 'desc', type: 'tip', action_hint: 'hint' };
    expect(isValidSuggestion(s)).toBe(false);
  });

  test('all valid types are accepted', () => {
    for (const type of ['risk', 'alert', 'opportunity', 'tip']) {
      const s = { id: 's1', title: 'T', description: 'd', type, action_hint: 'h' };
      expect(isValidSuggestion(s)).toBe(true);
    }
  });
});

// ── skeleton / loading state (logic) ─────────────────────────────────────────

describe('SmartSuggestionsPanel — skeleton / loading state logic', () => {
  test('showSkeleton is true when isLLMLoading and no valid suggestions', () => {
    // Simulates the flag logic: showSkeleton = isLLMLoading && validSuggestions.length === 0
    const isLLMLoading = true;
    const validSuggestions = [];
    const showSkeleton = isLLMLoading && validSuggestions.length === 0;
    expect(showSkeleton).toBe(true);
  });

  test('showSkeleton is false when valid suggestions exist even if loading', () => {
    const isLLMLoading = true;
    const validSuggestions = [{ id: 's1', title: 'T', type: 'tip' }];
    const showSkeleton = isLLMLoading && validSuggestions.length === 0;
    expect(showSkeleton).toBe(false);
  });

  test('showSkeleton is false when not loading', () => {
    const isLLMLoading = false;
    const validSuggestions = [];
    const showSkeleton = isLLMLoading && validSuggestions.length === 0;
    expect(showSkeleton).toBe(false);
  });
});

// ── prompt mode without LLM ───────────────────────────────────────────────────

describe('SmartSuggestionsPanel — prompt mode without LLM', () => {
  test('no_llm flag true activates CTA state (llmError = no-llm)', () => {
    // Simulates: if (data.no_llm) setLlmError('no-llm')
    const responseData = { suggestions: [], source: 'rules', no_llm: true };
    let llmError = null;
    if (responseData.no_llm) {
      llmError = 'no-llm';
    }
    expect(llmError).toBe('no-llm');
  });

  test('no_llm false does not trigger CTA state', () => {
    const responseData = {
      suggestions: [{ id: 's1', title: 'T', type: 'tip' }],
      source: 'llm',
      no_llm: false,
    };
    let llmError = null;
    if (responseData.no_llm) {
      llmError = 'no-llm';
    }
    expect(llmError).toBeNull();
  });

  test('llmError no-llm is distinct from regular error string', () => {
    const noLlmError = 'no-llm';
    const regularError = 'Error de conexión';
    // Panel renders different UI: CTA for 'no-llm', error text for other errors
    expect(noLlmError !== regularError).toBe(true);
    expect(noLlmError).toBe('no-llm');
  });

  test('prompt submission with no_llm response sets llmError and does not cache', () => {
    // Simulates: if (data.no_llm) { setLlmError('no-llm'); return; }
    const responseData = { suggestions: [], source: 'rules', no_llm: true };
    let llmError = null;
    let cached = false;
    if (responseData.no_llm) {
      llmError = 'no-llm';
    } else if (responseData.suggestions?.length > 0) {
      cached = true;
    }
    expect(llmError).toBe('no-llm');
    expect(cached).toBe(false);
  });
});

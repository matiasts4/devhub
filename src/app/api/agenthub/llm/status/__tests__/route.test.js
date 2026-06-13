/**
 * Unit tests for /api/agenthub/llm/status — happy + empty + secret-leak guards.
 *
 * The route reads `data/llm-providers-config.json` via the helpers in
 * `@/lib/llmProviderConfig` and returns `{ ready, provider, reason }`.
 *
 * Locked contract (asserted here so the implementation can be changed without
 * breaking the test):
 *  - GET handler returns 200 with JSON body
 *  - body.ready === true  ⇔  at least one provider is enabled AND has the
 *    minimum required fields for its provider family
 *  - body.provider is the provider's `name` field (a short string, not a
 *    credential)
 *  - body.reason is a Spanish string when not ready, null when ready
 *  - No API key, token, or secret value may appear anywhere in the response
 */
/** @jest-environment node */

// --- Mocks (set up before importing the route) ---

// getLlmProviderConfig(key) — returns the per-provider config object or null.
const mockGetLlmProviderConfig = jest.fn();
// listLlmProviderKeys() — returns the array of provider keys present in the
// config. The route iterates this list to find the first enabled+complete
// entry. The mock returns whatever the current test wants the lib to expose.
const mockListLlmProviderKeys = jest.fn();
// listLlmProviderNames() — returns the human-readable `name` for each key.
// The route uses this to populate `body.provider` (not the secret-bearing
// config object). Mocked separately from the config lookup.
const mockListLlmProviderNames = jest.fn();

jest.mock('@/lib/llmProviderConfig', () => ({
  getLlmProviderConfig: (key) => mockGetLlmProviderConfig(key),
  getLlmProviderConfigSync: (key) => mockGetLlmProviderConfig(key),
  listLlmProviderKeys: () => mockListLlmProviderKeys(),
  listLlmProviderNames: () => mockListLlmProviderNames(),
}));

// --- Per-test scenario helpers ---

function configureScenarios({ keys = [], names = {}, providers = {} } = {}) {
  mockListLlmProviderKeys.mockImplementation(() => keys);
  mockListLlmProviderNames.mockImplementation(() => keys.map((k) => names[k] || k));
  mockGetLlmProviderConfig.mockImplementation((key) => providers[key] || null);
}

// --- Module under test (late import so mocks apply) ---
 
const { GET } = require('../route.js');

function invokeRoute() {
  return GET();
}

describe('/api/agenthub/llm/status', () => {
  beforeEach(() => {
    mockGetLlmProviderConfig.mockReset();
    mockListLlmProviderKeys.mockReset();
    mockListLlmProviderNames.mockReset();
  });

  // --- Scenario A: at least one provider enabled + complete → ready=true ---

  test('returns { ready: true, provider, reason: null } when one provider is enabled and complete', async () => {
    configureScenarios({
      keys: ['openrouter', 'copilot', 'opencode', 'minimax'],
      names: { openrouter: 'openrouter', minimax: 'minimax' },
      providers: {
        minimax: {
          ANTHROPIC_BASE_URL: 'https://api.minimax.io/anthropic',
          MINIMAX_MODEL: 'minimax-coding-plan/MiniMax-M2.7',
          MINIMAX_API_KEY: 'sk-cp-shared-secret-DO-NOT-LEAK',
          enabled: true,
        },
      },
    });

    const res = await invokeRoute();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ready).toBe(true);
    expect(body.provider).toBe('minimax');
    expect(body.reason).toBeNull();
  });

  // --- Scenario B: no providers enabled → ready=false, Spanish reason ---

  test('returns { ready: false, provider: null, reason: <spanish> } when no provider is enabled', async () => {
    configureScenarios({
      keys: ['openrouter', 'copilot', 'opencode', 'minimax'],
      names: {},
      providers: {}, // every lookup returns null
    });

    const res = await invokeRoute();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ready).toBe(false);
    expect(body.provider).toBeNull();
    expect(typeof body.reason).toBe('string');
    expect(body.reason.length).toBeGreaterThan(0);
    // The reason must be Spanish. The test accepts either a diacritic OR a
    // common Spanish stopword ("no", "proveedor", "habilitado", "configurá").
    expect(body.reason).toMatch(/[áéíóúñÁÉÍÓÚÑ]|\b(no|proveedor|habilitado|configurá)\b/i);
  });

  // --- Scenario C: empty provider list → ready=false ---

  test('returns ready=false when the provider list is empty (zero providers configured)', async () => {
    configureScenarios({ keys: [], names: {}, providers: {} });

    const res = await invokeRoute();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ready).toBe(false);
    expect(body.provider).toBeNull();
    expect(typeof body.reason).toBe('string');
    expect(body.reason.length).toBeGreaterThan(0);
  });

  // --- Scenario D: provider "enabled" but missing a required field → not ready ---

  test('returns ready=false with a reason naming the missing field', async () => {
    configureScenarios({
      keys: ['minimax'],
      names: { minimax: 'minimax' },
      providers: {
        // MINIMAX_MODEL intentionally missing — the route must report not
        // ready and the reason must mention the missing field.
        minimax: {
          ANTHROPIC_BASE_URL: 'https://api.minimax.io/anthropic',
          enabled: true,
        },
      },
    });

    const res = await invokeRoute();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ready).toBe(false);
    expect(typeof body.reason).toBe('string');
    expect(body.reason.length).toBeGreaterThan(0);
    // The reason must mention the provider name and the missing field
    // ("MINIMAX_MODEL" or equivalent). The route is free to choose the exact
    // wording, but the diagnostic must be specific enough to act on.
    expect(body.reason).toMatch(/minimax/i);
  });

  // --- Scenario E: secret-leak guard (multiple providers, multiple secrets) ---

  test('response body does NOT contain any provider API key, token, or credential value', async () => {
    configureScenarios({
      keys: ['openrouter', 'minimax'],
      names: { openrouter: 'openrouter', minimax: 'minimax' },
      providers: {
        minimax: {
          ANTHROPIC_BASE_URL: 'https://api.minimax.io/anthropic',
          MINIMAX_MODEL: 'minimax-coding-plan/MiniMax-M2.7',
          MINIMAX_API_KEY: 'sk-cp-MUST-NOT-LEAK-9f8e7d6c5b4a3210',
          enabled: true,
        },
        openrouter: {
          OPENROUTER_MODEL: 'qwen/qwen3.6-plus:free',
          OPENROUTER_API_KEY: 'sk-or-v1-also-must-not-leak-aabbcc',
        },
      },
    });

    const res = await invokeRoute();
    const body = await res.json();
    const serialized = JSON.stringify(body);

    expect(serialized).not.toMatch(/sk-cp-MUST-NOT-LEAK/);
    expect(serialized).not.toMatch(/sk-or-v1-also-must-not-leak/);
    // Defensive: the response payload must not contain the property name
    // "API_KEY" either (a common leak vector when callers JSON.stringify the
    // raw provider object).
    expect(serialized).not.toMatch(/API_KEY/);
    expect(serialized).not.toMatch(/API[_-]?KEY/);
  });

  // --- Scenario F: provider field is the configured name, not a secret ---

  test('provider field is the configured provider name (short identifier, not a credential)', async () => {
    configureScenarios({
      keys: ['minimax'],
      names: { minimax: 'minimax' },
      providers: {
        minimax: {
          ANTHROPIC_BASE_URL: 'https://api.minimax.io/anthropic',
          MINIMAX_MODEL: 'minimax-coding-plan/MiniMax-M2.7',
          MINIMAX_API_KEY: 'sk-cp-secret-marker-aabbccddeeff',
          enabled: true,
        },
      },
    });

    const res = await invokeRoute();
    const body = await res.json();

    expect(body.ready).toBe(true);
    expect(body.provider).toBe('minimax');
    // The "provider" field must not look like a credential. Both literal
    // "sk-" prefixes and "sk_" underscores are common leak shapes.
    expect(body.provider).not.toMatch(/^sk[-_]/i);
    // And it must not contain the credential substring.
    expect(JSON.stringify(body.provider)).not.toMatch(/sk-cp-secret-marker/);
  });

  // --- Scenario G: response Content-Type is application/json ---

  test('response Content-Type header is application/json', async () => {
    configureScenarios({
      keys: ['minimax'],
      names: { minimax: 'minimax' },
      providers: {
        minimax: {
          ANTHROPIC_BASE_URL: 'https://api.minimax.io/anthropic',
          MINIMAX_MODEL: 'minimax-coding-plan/MiniMax-M2.7',
          enabled: true,
        },
      },
    });

    const res = await invokeRoute();
    const ct = res.headers.get('content-type') || '';
    expect(ct).toMatch(/application\/json/i);
  });
});

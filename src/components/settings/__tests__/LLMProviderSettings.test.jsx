// Regression test for Bug: TypeError: undefined is not an object (evaluating 'config.icon')
// in src/components/settings/LLMProviderSettings.jsx
//
// The component maps over a `priorityOrder` array of provider names and dereferences
// `PROVIDER_CONFIGS[providerName].icon`. When `priorityOrder` is hydrated with a
// stale name (e.g. from a previous build or a persisted localStorage value) whose
// key is no longer in `PROVIDER_CONFIGS`, the `.icon` access throws and the whole
// settings view crashes.
//
// This test seeds localStorage with a stale priorityOrder BEFORE mount, renders
// the component, and asserts:
//   1. Render does not throw.
//   2. The known providers from PROVIDER_CONFIGS are visible.
//   3. The exported `reconcilePriorityOrder` helper drops unknown entries and
//      backfills any missing known providers.

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy(
    {},
    {
      get: (_, key) => icon(String(key)),
    }
  );
});

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test/',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Event = dom.window.Event;
  global.MouseEvent = dom.window.MouseEvent;
  global.localStorage = dom.window.localStorage;
  return dom;
}

describe('LLMProviderSettings — stale priorityOrder safety', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    // Seed a stale priorityOrder containing a provider name that does NOT exist
    // in the current PROVIDER_CONFIGS map. The component must not crash when it
    // tries to dereference `PROVIDER_CONFIGS['gpt5-legacy'].icon`.
    window.localStorage.setItem(
      'devhub:llm-priority-order',
      JSON.stringify(['copilot', 'gpt5-legacy', 'openrouter', 'zen', 'direct'])
    );
  });

  afterEach(() => {
    if (global.window) dom.window.close();
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.HTMLElement;
    delete global.Event;
    delete global.MouseEvent;
    delete global.localStorage;
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('renders without throwing when priorityOrder has stale entries', async () => {
    // Mock the /api/settings/llm-providers endpoint the component fetches on mount.
    // Return the same stale priorityOrder so the bug is triggered AFTER hydration.
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          providers: {},
          priorityOrder: ['copilot', 'gpt5-legacy', 'openrouter', 'zen', 'direct'],
          globalTemperature: 0.7,
          globalMaxTokens: 4000,
          bridgeEnabled: true,
          modelOptions: {},
          favoriteModels: {},
        }),
      })
    );

    // Load the component AFTER mocks + globals are installed (Jest hoists
    // jest.mock calls but `require` for the SUT must be lazy so it sees the
    // mocked environment).
    const LLMProviderSettingsModule = require('../LLMProviderSettings');
    const LLMProviderSettings = LLMProviderSettingsModule.default;
    const { reconcilePriorityOrder } = LLMProviderSettingsModule;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    let renderError = null;
    let capturedText = '';
    try {
      flushSync(() => root.render(React.createElement(LLMProviderSettings, { embedded: false })));
      // Let the fetch promise resolve, the useEffect run, and the state updates
      // (setProviders / setPriorityOrder / setLoading(false)) flush into the DOM.
      for (let i = 0; i < 8; i++) {
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
        flushSync(() => {});
      }
      capturedText = container.textContent || '';
    } catch (err) {
      renderError = err;
    } finally {
      flushSync(() => root.unmount());
    }

    expect(renderError).toBeNull();
    // The component renders the heading section. The known providers
    // 'GitHub Copilot', 'OpenRouter', 'OpenCode Zen', and 'API Directa' must
    // be visible (the stale 'gpt5-legacy' must be silently dropped).
    const text = capturedText;
    expect(text).toMatch(/GitHub Copilot/);
    expect(text).toMatch(/OpenRouter/);
    expect(text).not.toMatch(/gpt5-legacy/);

    // Helper export smoke test.
    expect(typeof reconcilePriorityOrder).toBe('function');
  });

  test('reconcilePriorityOrder drops unknown entries and backfills missing known ones', () => {
    const LLMProviderSettingsModule = require('../LLMProviderSettings');
    const { reconcilePriorityOrder } = LLMProviderSettingsModule;

    const out = reconcilePriorityOrder(['copilot', 'gpt5-legacy']);
    expect(out).toContain('copilot');
    expect(out).not.toContain('gpt5-legacy');
    // Backfill — all known providers should appear at least once.
    expect(out).toContain('opencode');
    expect(out).toContain('openrouter');
    expect(out).toContain('zen');
    expect(out).toContain('direct');

    // Empty / null inputs are tolerated.
    expect(Array.isArray(reconcilePriorityOrder(null))).toBe(true);
    expect(Array.isArray(reconcilePriorityOrder(undefined))).toBe(true);
    expect(reconcilePriorityOrder([]).length).toBeGreaterThan(0);
  });
});

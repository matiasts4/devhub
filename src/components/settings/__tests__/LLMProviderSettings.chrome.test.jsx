/**
 * @jest-environment jsdom
 *
 * Regression test for the LLM tab in Ajustes: prior to the chrome-token
 * refactor, both `LLMProviderSettings.jsx` and `ProviderCard.jsx` carried
 * hardcoded chrome that bypassed the morphology token layer — raw `#hex`
 * colors, raw `rgba()` shadows, `linear-gradient(180deg, ...)` panel
 * fills, and `4px 4px 0 0` brutalist shadows. After the refactor both
 * files must:
 *
 *   1. Import chrome factories from `@/chrome/morphology`.
 *   2. Apply them at every chrome surface (panels, pills, inputs, buttons).
 *   3. NOT leak the legacy hardcoded patterns back in.
 *
 * The source-level guard mirrors `src/views/__tests__/Ajustes.projectType.test.jsx`.
 * A behavioral render-smoke test guards against runtime regressions.
 *
 * Note: JSDOM's `cssstyle` implementation silently drops `var(--token)` values
 * for a handful of CSS properties (background, border-color, border-width, …),
 * so DOM-level chrome-token assertions are not reliable. The source-level
 * guard is the load-bearing test; the behavioral test only verifies that the
 * components still render after the refactor.
 */

const fs = require('fs');
const path = require('path');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

const LLM_PATH = path.resolve(__dirname, '../LLMProviderSettings.jsx');
const CARD_PATH = path.resolve(__dirname, '../ProviderCard.jsx');

function readSource(file) {
  return fs.readFileSync(file, 'utf8');
}

function stripProviderMeta(src) {
  // PROVIDER_META contains legitimate data (option strings, model names)
  // that may include hex-like tokens. We strip the block before scanning
  // for raw-hex-in-color-mix violations so we don't get false positives.
  return src.replace(/const PROVIDER_META = \{[\s\S]*?\n\};\n/m, '');
}

describe('LLM tab — chrome-token alignment (source-level guard)', () => {
  describe('LLMProviderSettings.jsx', () => {
    let src;
    beforeAll(() => {
      src = readSource(LLM_PATH);
    });

    test('imports chrome factories from @/chrome/morphology', () => {
      expect(src).toMatch(/from\s+['"]@\/chrome\/morphology['"]/);
    });

    test('does not hardcode the brutalist `4px 4px 0 0` shadow', () => {
      // The literal `4px 4px 0 0` is brutalist-stage only and was removed
      // from the rest of Ajustes; it must not reappear on the LLM tab.
      expect(src).not.toMatch(/['"]4px 4px 0 0['"]/);
    });

    test('does not hardcode `borderRadius: 0` overrides', () => {
      // Default morphology already sets `--chrome-radius-panel: 0`; an
      // explicit override on a chrome surface is dead and suspicious.
      expect(src).not.toMatch(/borderRadius:\s*0/);
    });

    test('does not call `rgba(` directly in inline chrome styles', () => {
      const cleaned = stripProviderMeta(src);
      expect(cleaned).not.toMatch(/\brgba\(/);
    });

    test('does not embed raw `#hex` colors inside `color-mix()` on chrome', () => {
      const cleaned = stripProviderMeta(src);
      // `color-mix(in srgb, #22c55e ..., ...)` is the legacy pattern that
      // pre-dates the `tone: 'success' | 'danger' | 'warning'` API.
      expect(cleaned).not.toMatch(/color-mix\(in srgb,\s*#[0-9a-fA-F]{3,8}/);
    });

    test('does not embed the legacy `linear-gradient` panel fill', () => {
      const cleaned = stripProviderMeta(src);
      expect(cleaned).not.toMatch(/linear-gradient\(/);
    });
  });

  describe('ProviderCard.jsx', () => {
    let src;
    beforeAll(() => {
      src = readSource(CARD_PATH);
    });

    test('imports chrome factories from @/chrome/morphology', () => {
      expect(src).toMatch(/from\s+['"]@\/chrome\/morphology['"]/);
    });

    test('does not hardcode the brutalist `4px 4px 0 0` shadow', () => {
      expect(src).not.toMatch(/['"]4px 4px 0 0['"]/);
    });

    test('does not hardcode `borderRadius: 0` overrides', () => {
      expect(src).not.toMatch(/borderRadius:\s*0/);
    });

    test('does not call `rgba(` directly in inline chrome styles', () => {
      expect(src).not.toMatch(/\brgba\(/);
    });

    test('does not embed raw `#hex` colors inside `color-mix()` on chrome', () => {
      // The `var(--accent-warning, #f59e0b)` fallback is a CSS variable
      // fallback, not a chrome inline color. The test only blocks
      // `color-mix(in srgb, #hex ...)` — the legacy pattern.
      expect(src).not.toMatch(/color-mix\(in srgb,\s*#[0-9a-fA-F]{3,8}/);
    });

    test('does not embed the legacy `linear-gradient` panel fill', () => {
      expect(src).not.toMatch(/linear-gradient\(/);
    });

    test('does not redefine `deriveSchemaForUnknown` (lives in @/lib/llmProviderConfig.shared)', () => {
      // Deduplication check: the function is exported by llmProviderConfig.shared
      // and ProviderCard.jsx must import it from there, not redeclare it.
      // The .shared file is client-safe (no Node fs/path imports) so it can
      // be bundled into Client Components.
      expect(src).not.toMatch(/function\s+deriveSchemaForUnknown\s*\(/);
      expect(src).toMatch(
        /import\s+\{[^}]*deriveSchemaForUnknown[^}]*\}\s+from\s+['"]@\/lib\/llmProviderConfig\.shared['"]/
      );
    });
  });
});

describe('LLM tab — chrome-token alignment (render smoke)', () => {
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

  function teardownDom(dom) {
    if (global.window) dom.window.close();
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.HTMLElement;
    delete global.Event;
    delete global.MouseEvent;
    delete global.localStorage;
    delete global.fetch;
  }

  test('ProviderCard renders without throwing after chrome refactor', () => {
    const dom = installDom();
    try {
      const ProviderCard = require('../ProviderCard').default;
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      let renderError = null;
      try {
        flushSync(() =>
          root.render(
            React.createElement(ProviderCard, {
              providerKey: 'openrouter',
              meta: { name: 'OpenRouter', description: 'desc' },
              providerData: { OPENROUTER_API_KEY: 'sk-test' },
              index: 0,
              isFirst: true,
              isLast: false,
              onToggle: () => {},
              onMoveUp: () => {},
              onMoveDown: () => {},
            })
          )
        );
      } catch (err) {
        renderError = err;
      }

      expect(renderError).toBeNull();
      const text = container.textContent || '';
      expect(text).toMatch(/OpenRouter/);
      expect(text).toMatch(/PRIORIDAD: 1/);

      flushSync(() => root.unmount());
    } finally {
      teardownDom(dom);
    }
  });

  test('LLMProviderSettings renders without throwing after chrome refactor', async () => {
    const dom = installDom();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          providers: {
            openrouter: { enabled: true, OPENROUTER_API_KEY: 'sk-test' },
          },
          priorityOrder: ['openrouter'],
          globalTemperature: 0.7,
          globalMaxTokens: 4000,
          bridgeEnabled: true,
          modelOptions: {},
          favoriteModels: {},
        }),
      })
    );
    try {
      const LLMProviderSettings = require('../LLMProviderSettings').default;
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      let renderError = null;
      let capturedText = '';
      try {
        flushSync(() => root.render(React.createElement(LLMProviderSettings, { embedded: false })));
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
      // Master toggle, ProviderCard, and Save button should all render.
      expect(capturedText).toMatch(/LLM Bridge Activo/);
      expect(capturedText).toMatch(/OpenRouter/);
      expect(capturedText).toMatch(/Guardar Todos los Cambios/);
    } finally {
      teardownDom(dom);
    }
  });
});

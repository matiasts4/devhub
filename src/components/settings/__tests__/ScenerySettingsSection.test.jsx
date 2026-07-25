const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const domHarness = require('@/test-support/domHarness');

jest.mock('sileo', () => ({
  sileo: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    promise: jest.fn((promise) => promise),
  },
}));

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

const ScenerySettingsSection = require('../ScenerySettingsSection').default;
const { readSceneryPrefs, SCENERY_SCOPES } = require('@/lib/sceneries/sceneryPreferences');
const { SCENERY_CATALOG } = require('@/lib/sceneries/sceneryCatalog');

let dom;
const mountedRoots = [];

function renderIntoDom(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  flushSync(() => {
    root.render(element);
  });
  return { container, root };
}

describe('ScenerySettingsSection', () => {
  beforeEach(() => {
    dom = domHarness.installDom();
  });

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const { root, container } = mountedRoots.pop();
      flushSync(() => root.unmount());
      container.remove();
    }
    if (dom?.window?.close) dom.window.close();
  });

  test('renders the settings shell, preview, and a thumbnail per catalog entry', () => {
    const view = renderIntoDom(React.createElement(ScenerySettingsSection));

    expect(view.container.querySelector('[data-testid="scenery-settings-section"]')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="scenery-active-preview"]')).toBeTruthy();

    // One thumbnail for every catalog scenery.
    for (const scenery of SCENERY_CATALOG) {
      expect(
        view.container.querySelector(`[data-testid="scenery-thumb-${scenery.id}"]`)
      ).toBeTruthy();
    }
  });

  test('selecting a thumbnail activates that scenery', () => {
    const view = renderIntoDom(React.createElement(ScenerySettingsSection));

    const meadowThumb = view.container.querySelector('[data-testid="scenery-thumb-meadow"]');
    expect(meadowThumb).toBeTruthy();

    flushSync(() => {
      meadowThumb.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });

    expect(readSceneryPrefs().sceneryId).toBe('meadow');
  });

  test('the none option disables the scenery', () => {
    // Pre-activate one.
    const view = renderIntoDom(React.createElement(ScenerySettingsSection));
    flushSync(() => {
      view.container
        .querySelector('[data-testid="scenery-thumb-aurora"]')
        .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(readSceneryPrefs().sceneryId).toBe('aurora');

    const noneOption = view.container.querySelector('[data-testid="scenery-none-option"]');
    flushSync(() => {
      noneOption.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(readSceneryPrefs().sceneryId).toBeNull();
  });

  test('scope buttons persist the selected scope', () => {
    const view = renderIntoDom(React.createElement(ScenerySettingsSection));

    const terminalScope = view.container.querySelector(
      `[data-testid="scenery-scope-${SCENERY_SCOPES.TERMINAL}"]`
    );
    expect(terminalScope).toBeTruthy();

    flushSync(() => {
      terminalScope.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });

    expect(readSceneryPrefs().scope).toBe(SCENERY_SCOPES.TERMINAL);
  });

  test('renders the file picker input and upload button', () => {
    const view = renderIntoDom(React.createElement(ScenerySettingsSection));

    const fileInput = view.container.querySelector('[data-testid="scenery-file-input"]');
    const uploadButton = view.container.querySelector('[data-testid="scenery-upload-button"]');
    expect(fileInput).toBeTruthy();
    expect(uploadButton).toBeTruthy();
    expect(fileInput.getAttribute('type')).toBe('file');
    expect(fileInput.getAttribute('accept')).toBe('image/*');
  });

  test('selecting a bundled image scenery persists it', () => {
    const view = renderIntoDom(React.createElement(ScenerySettingsSection));

    const photoThumb = view.container.querySelector('[data-testid="scenery-thumb-photo-aurora"]');
    expect(photoThumb).toBeTruthy();

    flushSync(() => {
      photoThumb.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });

    expect(readSceneryPrefs().sceneryId).toBe('photo-aurora');
  });

  test('picking a file applies it as the custom wallpaper data-URL', async () => {
    const domHarnessLocal = require('@/test-support/domHarness');

    // No Image decoder in the node env -> downscale is a passthrough.
    const originalImage = global.Image;
    const originalFileReader = global.FileReader;
    global.Image = undefined;
    global.FileReader = class MockFileReader {
      readAsDataURL() {
        setTimeout(() => {
          this.result = 'data:image/jpeg;base64,UPLOADED';
          if (this.onload) this.onload();
        }, 0);
      }
    };

    try {
      const view = renderIntoDom(React.createElement(ScenerySettingsSection));
      const fileInput = view.container.querySelector('[data-testid="scenery-file-input"]');
      expect(fileInput).toBeTruthy();

      Object.defineProperty(fileInput, 'files', {
        value: [{ type: 'image/jpeg', size: 1024 }],
        configurable: true,
      });

      flushSync(() => {
        fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
      });
      await domHarnessLocal.flushEffects();

      expect(readSceneryPrefs().customImageUrl).toBe('data:image/jpeg;base64,UPLOADED');
    } finally {
      global.Image = originalImage;
      global.FileReader = originalFileReader;
    }
  });
});

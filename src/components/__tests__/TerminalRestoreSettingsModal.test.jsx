const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

jest.mock('@/lib/terminal/restorePreferences', () => ({
  RESTORE_POLICY: { AUTO: 'auto', MANUAL: 'manual', OFF: 'off' },
  readTerminalRestorePreferences: jest.fn(() => ({
    opencode: 'auto',
    generic: 'auto',
    swarm: 'auto',
  })),
  writeTerminalRestorePreferences: jest.fn(),
}));

jest.mock('@/components/settings/TerminalSettingsSection', () => () => {
  const React = require('react');
  return React.createElement(
    'div',
    { 'data-testid': 'terminal-settings-section-mock' },
    'Terminal'
  );
});

jest.mock('@/components/settings/PizarraSettings', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'pizarra-settings-mock' }, 'Pizarra');
});

jest.mock('@/components/settings/ZedVoiceSettings', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'voice-settings-mock' }, 'Voice');
});

jest.mock('@/components/settings/TerminalShortcutsSettings', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'shortcuts-settings-mock' }, 'Shortcuts');
});

jest.mock('@/components/settings/TerminalAgentsSettings', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'agents-settings-mock' }, 'Agents');
});

jest.mock('lucide-react', () => {
  const React = require('react');
  const icon = (name) => (props) => React.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy(
    {},
    {
      get(_, key) {
        if (key === 'createPortal') return (children) => children;
        return icon(String(key));
      },
    }
  );
});

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test/project/1/terminales',
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;
  global.Event = dom.window.Event;
  global.MouseEvent = dom.window.MouseEvent;
  global.DocumentFragment = dom.window.DocumentFragment;
  global.localStorage = dom.window.localStorage;

  // Polyfill missing DOM APIs for Radix UI Select in jsdom
  if (!global.Element.prototype.setPointerCapture) {
    global.Element.prototype.setPointerCapture = () => {};
  }
  if (!global.Element.prototype.releasePointerCapture) {
    global.Element.prototype.releasePointerCapture = () => {};
  }
  if (!global.Element.prototype.hasPointerCapture) {
    global.Element.prototype.hasPointerCapture = () => false;
  }
  if (!global.navigator.mediaDevices) {
    global.navigator.mediaDevices = {
      enumerateDevices: jest.fn(() => Promise.resolve([])),
      getUserMedia: jest.fn(() => Promise.resolve({})),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
  }
  if (!global.navigator.permissions) {
    global.navigator.permissions = { query: jest.fn(() => Promise.resolve({ state: 'granted' })) };
  }

  return dom;
}

async function flushEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderIntoDom(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(element));
  await flushEffects();
  return { container, root };
}

describe('TerminalRestoreSettingsModal', () => {
  let dom;
  let rendered;

  beforeEach(() => {
    dom = installDom();
    rendered = null;
  });

  afterEach(() => {
    if (rendered?.root) {
      flushSync(() => rendered.root.unmount());
    }
    dom.window.close();
    delete global.localStorage;
    jest.clearAllMocks();
  });

  test('renders modal with sidebar sections when open', async () => {
    const TerminalRestoreSettingsModal = require('../TerminalRestoreSettingsModal').default;
    rendered = await renderIntoDom(
      React.createElement(TerminalRestoreSettingsModal, { open: true, onClose: jest.fn() })
    );

    const bodyText = document.body.textContent;
    expect(bodyText).toContain('Restauración');
    expect(bodyText).toContain('Terminal');
    expect(bodyText).toContain('Pizarra');
    expect(bodyText).toContain('Voz');
    expect(bodyText).toContain('Atajos');
    expect(bodyText).toContain('Agentes');
  });

  test('restore section shows selectors and save hint', async () => {
    const TerminalRestoreSettingsModal = require('../TerminalRestoreSettingsModal').default;
    rendered = await renderIntoDom(
      React.createElement(TerminalRestoreSettingsModal, { open: true, onClose: jest.fn() })
    );

    expect(document.body.querySelector('[data-testid="restore-prefs-save-hint"]')).toBeTruthy();
    expect(
      document.body.querySelector('[data-testid="restore-policy-modal-opencode"]')
    ).toBeTruthy();
    expect(
      document.body.querySelector('[data-testid="restore-policy-modal-generic"]')
    ).toBeTruthy();
    expect(document.body.querySelector('[data-testid="restore-policy-modal-swarm"]')).toBeTruthy();
  });

  test('switches to Terminal section when clicked', async () => {
    const TerminalRestoreSettingsModal = require('../TerminalRestoreSettingsModal').default;
    rendered = await renderIntoDom(
      React.createElement(TerminalRestoreSettingsModal, { open: true, onClose: jest.fn() })
    );

    const terminalButton = Array.from(document.body.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Terminal')
    );
    expect(terminalButton).toBeTruthy();

    flushSync(() => {
      terminalButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(
      document.body.querySelector('[data-testid="terminal-settings-section-mock"]')
    ).toBeTruthy();
  });

  test('calls onClose when clicking the close button', async () => {
    const TerminalRestoreSettingsModal = require('../TerminalRestoreSettingsModal').default;
    const onClose = jest.fn();
    rendered = await renderIntoDom(
      React.createElement(TerminalRestoreSettingsModal, { open: true, onClose })
    );

    const closeButton = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.getAttribute('aria-label') === 'Cerrar'
    );
    expect(closeButton).toBeTruthy();

    flushSync(() => {
      closeButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalled();
  });
});

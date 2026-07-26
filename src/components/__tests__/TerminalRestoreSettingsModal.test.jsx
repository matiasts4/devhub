const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

jest.mock('@/lib/terminal/restorePreferences', () => ({
  RESTORE_POLICY: { AUTO: 'auto', MANUAL: 'manual', OFF: 'off' },
  TERMINAL_RESTORE_KINDS: ['opencode', 'kimi', 'grok', 'codex', 'qoder', 'swarm', 'generic'],
  readTerminalRestorePreferences: jest.fn(() => ({
    opencode: 'auto',
    kimi: 'auto',
    grok: 'auto',
    codex: 'auto',
    qoder: 'auto',
    swarm: 'auto',
    generic: 'auto',
    restoreOnReboot: true,
  })),
  writeTerminalRestorePreferences: jest.fn(),
}));

// Radix Select needs pointer-capture/floating-ui APIs that jsdom lacks; swap it
// for plain buttons so the suite exercises RestoreSection state + persistence.
jest.mock('@/components/ui/select', () => {
  const React = require('react');
  const SelectContext = React.createContext(null);
  const Select = ({ value, onValueChange, disabled, children }) =>
    React.createElement(
      SelectContext.Provider,
      { value: { value, onValueChange, disabled } },
      children
    );
  const SelectTrigger = React.forwardRef(({ children, ...props }, ref) => {
    const ctx = React.useContext(SelectContext);
    return React.createElement(
      'button',
      { ...props, ref, type: 'button', disabled: Boolean(ctx?.disabled) },
      children
    );
  });
  const SelectValue = ({ placeholder }) => React.createElement('span', null, placeholder);
  const SelectContent = ({ children }) => React.createElement(React.Fragment, null, children);
  const SelectItem = ({ value, children }) => {
    const ctx = React.useContext(SelectContext);
    return React.createElement(
      'button',
      {
        type: 'button',
        role: 'option',
        'data-value': value,
        disabled: Boolean(ctx?.disabled),
        onClick: () => ctx?.onValueChange?.(value),
      },
      children
    );
  };
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

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

jest.mock('@/components/settings/ZedOverlaySettings', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'zed-overlay-settings-mock' }, 'Zed Overlay');
});

jest.mock('@/components/settings/ZedModelSettings', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'zed-model-settings-mock' }, 'Zed Model');
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
    expect(bodyText).toContain('Zed');
    expect(bodyText).toContain('Voz');
    expect(bodyText).toContain('Atajos');
    expect(bodyText).toContain('Agentes');
  });

  test('switches to Zed section when clicked', async () => {
    const TerminalRestoreSettingsModal = require('../TerminalRestoreSettingsModal').default;
    rendered = await renderIntoDom(
      React.createElement(TerminalRestoreSettingsModal, { open: true, onClose: jest.fn() })
    );

    const zedButton = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Zed'
    );
    expect(zedButton).toBeTruthy();

    flushSync(() => {
      zedButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(document.body.querySelector('[data-testid="zed-overlay-settings-mock"]')).toBeTruthy();
  });

  test('restore section shows selectors for all 7 provider kinds and the save hint', async () => {
    const TerminalRestoreSettingsModal = require('../TerminalRestoreSettingsModal').default;
    rendered = await renderIntoDom(
      React.createElement(TerminalRestoreSettingsModal, { open: true, onClose: jest.fn() })
    );

    expect(document.body.querySelector('[data-testid="restore-prefs-save-hint"]')).toBeTruthy();

    const expectedLabels = {
      opencode: 'OpenCode',
      kimi: 'Kimi Code',
      grok: 'Grok',
      codex: 'Codex',
      qoder: 'Qoder',
      swarm: 'Swarm',
      generic: 'Shell genérico',
    };
    for (const [kind, label] of Object.entries(expectedLabels)) {
      expect(
        document.body.querySelector(`[data-testid="restore-policy-modal-${kind}"]`)
      ).toBeTruthy();
      expect(document.body.textContent).toContain(label);
    }
  });

  test('master toggle renders checked by default and dims the selects when switched off', async () => {
    const TerminalRestoreSettingsModal = require('../TerminalRestoreSettingsModal').default;
    const { writeTerminalRestorePreferences } = require('@/lib/terminal/restorePreferences');
    rendered = await renderIntoDom(
      React.createElement(TerminalRestoreSettingsModal, { open: true, onClose: jest.fn() })
    );

    const toggle = document.body.querySelector('[data-testid="restore-on-reboot-toggle"]');
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(document.body.querySelector('[data-testid="restore-on-reboot-off-hint"]')).toBeFalsy();
    expect(
      document.body
        .querySelector('[data-testid="restore-policy-list"]')
        .getAttribute('data-disabled')
    ).toBe('false');

    flushSync(() => {
      toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(writeTerminalRestorePreferences).toHaveBeenCalledWith(expect.anything(), {
      restoreOnReboot: false,
    });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(document.body.querySelector('[data-testid="restore-on-reboot-off-hint"]')).toBeTruthy();
    const list = document.body.querySelector('[data-testid="restore-policy-list"]');
    expect(list.getAttribute('data-disabled')).toBe('true');
    expect(list.style.opacity).toBe('0.5');
    expect(document.body.querySelector('[data-testid="restore-policy-modal-grok"]').disabled).toBe(
      true
    );
  });

  test('selecting a policy for a provider kind persists only that kind', async () => {
    const TerminalRestoreSettingsModal = require('../TerminalRestoreSettingsModal').default;
    const { writeTerminalRestorePreferences } = require('@/lib/terminal/restorePreferences');
    rendered = await renderIntoDom(
      React.createElement(TerminalRestoreSettingsModal, { open: true, onClose: jest.fn() })
    );

    const manualOption = Array.from(document.body.querySelectorAll('[role="option"]')).find(
      (opt) => opt.textContent.trim() === 'Manual' && !opt.disabled
    );
    expect(manualOption).toBeTruthy();

    flushSync(() => {
      manualOption.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(writeTerminalRestorePreferences).toHaveBeenCalledWith(expect.anything(), {
      opencode: 'manual',
    });
    expect(
      document.body.querySelector('[data-testid="restore-prefs-save-hint"]').textContent
    ).toContain('Guardado: OpenCode → Manual.');
  });

  test('legacy 3-key prefs still render all kinds with defaults and the master switch on', async () => {
    const { readTerminalRestorePreferences } = require('@/lib/terminal/restorePreferences');
    readTerminalRestorePreferences.mockImplementationOnce(() => ({
      opencode: 'manual',
      generic: 'off',
      swarm: 'auto',
    }));

    const TerminalRestoreSettingsModal = require('../TerminalRestoreSettingsModal').default;
    rendered = await renderIntoDom(
      React.createElement(TerminalRestoreSettingsModal, { open: true, onClose: jest.fn() })
    );

    ['opencode', 'kimi', 'grok', 'codex', 'qoder', 'swarm', 'generic'].forEach((kind) => {
      expect(
        document.body.querySelector(`[data-testid="restore-policy-modal-${kind}"]`)
      ).toBeTruthy();
    });
    const toggle = document.body.querySelector('[data-testid="restore-on-reboot-toggle"]');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(document.body.querySelector('[data-testid="restore-on-reboot-off-hint"]')).toBeFalsy();
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

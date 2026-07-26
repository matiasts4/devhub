const React = require('react');
const { flushSync } = require('react-dom');
const {
  cleanupMountedRoots,
  flushEffects,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');

jest.mock('lucide-react', () => {
  const React = require('react');
  const icon = (name) => (props) => React.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

const WorkspaceTerminalSetupModal = require('../WorkspaceTerminalSetupModal').default;

const mountedRoots = [];

async function dispatchKey(target, init) {
  const event = new window.KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  flushSync(() => {
    (target || document).dispatchEvent(event);
  });
  await flushEffects();
  return event;
}

describe('WorkspaceTerminalSetupModal keyboard flow', () => {
  let dom;

  beforeEach(() => {
    dom = installDom('https://devhub.test/terminales');
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    jest.clearAllMocks();
  });

  test('uses left and right arrows to adjust terminal count in the terminals section', async () => {
    const onConfirm = jest.fn();
    await renderIntoDom(
      React.createElement(WorkspaceTerminalSetupModal, {
        open: true,
        onClose: jest.fn(),
        onConfirm,
      }),
      mountedRoots
    );
    await flushEffects();

    const countValue = document.querySelector('[data-testid="workspace-terminal-count-value"]');
    expect(countValue.textContent).toBe('1');

    await dispatchKey(document, { key: 'ArrowRight' });
    expect(countValue.textContent).toBe('2');

    await dispatchKey(document, { key: 'ArrowUp' });
    expect(countValue.textContent).toBe('2');
  });

  test('uses up and down arrows to move across modal sections', async () => {
    const onConfirm = jest.fn();
    await renderIntoDom(
      React.createElement(WorkspaceTerminalSetupModal, {
        open: true,
        onClose: jest.fn(),
        onConfirm,
      }),
      mountedRoots
    );
    await flushEffects();

    const countFocus = document.querySelector('[data-testid="workspace-terminal-count-focus"]');
    const opencodePreset = document.querySelector(
      '[data-testid="workspace-terminal-command-preset-opencode"]'
    );
    const customInput = document.querySelector(
      '[data-testid="workspace-terminal-initial-command-input"]'
    );

    expect(document.activeElement).toBe(countFocus);

    await dispatchKey(document, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(opencodePreset);

    await dispatchKey(document, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(customInput);

    await dispatchKey(document, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(opencodePreset);
  });

  test('Enter confirms workspace creation from any section', async () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    await renderIntoDom(
      React.createElement(WorkspaceTerminalSetupModal, {
        open: true,
        onClose,
        onConfirm,
      }),
      mountedRoots
    );
    await flushEffects();

    await dispatchKey(document, { key: 'Enter' });

    expect(onConfirm).toHaveBeenCalledWith({
      terminalCount: 1,
      initialCommand: 'opencode',
    });
    expect(onClose).toHaveBeenCalled();
  });

  test('grok preset pre-assigns a per-panel session id placeholder', async () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    await renderIntoDom(
      React.createElement(WorkspaceTerminalSetupModal, {
        open: true,
        onClose,
        onConfirm,
      }),
      mountedRoots
    );
    await flushEffects();

    const grokPreset = document.querySelector(
      '[data-testid="workspace-terminal-command-preset-grok"]'
    );
    flushSync(() => {
      grokPreset.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await flushEffects();

    const customInput = document.querySelector(
      '[data-testid="workspace-terminal-initial-command-input"]'
    );
    // Not a static uuid: the placeholder is resolved per panel at creation time.
    expect(customInput.value).toBe('grok --session-id __DEVHUB_AGENT_SESSION_ID__');

    const confirmButton = document.querySelector(
      '[data-testid="workspace-terminal-setup-confirm"]'
    );
    flushSync(() => {
      confirmButton.dispatchEvent(
        new window.MouseEvent('click', { bubbles: true, cancelable: true })
      );
    });
    await flushEffects();

    expect(onConfirm).toHaveBeenCalledWith({
      terminalCount: 1,
      initialCommand: 'grok --session-id __DEVHUB_AGENT_SESSION_ID__',
    });
    expect(onClose).toHaveBeenCalled();
  });

  test('Enter confirms from the custom command section without focusing the create button', async () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    await renderIntoDom(
      React.createElement(WorkspaceTerminalSetupModal, {
        open: true,
        onClose,
        onConfirm,
      }),
      mountedRoots
    );
    await flushEffects();

    await dispatchKey(document, { key: 'ArrowDown' });
    await dispatchKey(document, { key: 'ArrowDown' });
    await dispatchKey(document, { key: 'Enter' });

    expect(onConfirm).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test('typing in the custom command input keeps focus on the input', async () => {
    const onConfirm = jest.fn();
    await renderIntoDom(
      React.createElement(WorkspaceTerminalSetupModal, {
        open: true,
        onClose: jest.fn(),
        onConfirm,
      }),
      mountedRoots
    );
    await flushEffects();

    const customInput = document.querySelector(
      '[data-testid="workspace-terminal-initial-command-input"]'
    );
    customInput.focus();
    await flushEffects();
    expect(document.activeElement).toBe(customInput);

    flushSync(() => {
      customInput.value = 'kimi';
      customInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await flushEffects();

    expect(document.activeElement).toBe(customInput);
    expect(customInput.value).toBe('kimi');
  });
});

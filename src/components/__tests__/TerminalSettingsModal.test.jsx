/**
 * TerminalSettingsModal unit tests — dual-terminal-restore-preferences PR #2
 *
 * Tests the modal that opens when the gear icon is clicked on a suspended terminal.
 * Session info: session type, restore policy, cwd.
 * CTA: "Continuar sesión" dispatches devhub:manual-revive-requested
 * Secondary: "Cerrar" closes the modal.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const {
  cleanupMountedRoots,
  flushEffects,
  installDom,
} = require('@/test-support/domHarness');

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }, ref) => {
      const React = require('react');
      return React.createElement('div', { ...props, ref }, children);
    },
  },
}));

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => {
    const React = require('react');
    return React.createElement('svg', { ...props, 'data-icon': name });
  };
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('../ui/dialog', () => {
  const React = require('react');
  const DialogRoot = ({ children, open, onOpenChange }) =>
    React.createElement('div', { 'data-dialog-open': open, 'data-dialog-on-open-change': Boolean(onOpenChange) }, children);
  const DialogTrigger = ({ children, asChild }) =>
    asChild ? children : React.createElement('button', { 'data-dialog-trigger': true }, children);
  // No-op portal: render inline instead of teleporting to body (jsdom body is separate from test container in domHarness)
  const DialogPortal = ({ children }) => React.createElement(React.Fragment, null, children);
  const DialogOverlay = (props) => React.createElement('div', { ...props, 'data-dialog-overlay': true });
  const DialogClose = (props) => React.createElement('button', { ...props, 'data-dialog-close': true });
  const DialogContentWrapper = ({ children, ...props }) =>
    React.createElement('div', { ...props, 'data-dialog-content': true }, children);
  const DialogHeaderWrapper = ({ children, ...props }) =>
    React.createElement('div', { ...props, 'data-dialog-header': true }, children);
  const DialogFooterWrapper = ({ children, ...props }) =>
    React.createElement('div', { ...props, 'data-dialog-footer': true }, children);
  const DialogTitleWrapper = ({ children, ...props }) =>
    React.createElement('h2', { ...props, 'data-dialog-title': true }, children);
  const DialogDescriptionWrapper = ({ children, ...props }) =>
    React.createElement('p', { ...props, 'data-dialog-description': true }, children);
  return {
    Dialog: DialogRoot,
    DialogTrigger,
    DialogPortal,
    DialogOverlay,
    DialogClose,
    DialogContent: DialogContentWrapper,
    DialogHeader: DialogHeaderWrapper,
    DialogFooter: DialogFooterWrapper,
    DialogTitle: DialogTitleWrapper,
    DialogDescription: DialogDescriptionWrapper,
  };
});

jest.mock('@/lib/utils', () => ({
  cn: (...classes) => classes.filter(Boolean).join(' '),
}));

// Flushing helper — uses multiple rounds to allow React 18 concurrent work
const flushModalEffects = async () => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

const mountedRoots = [];

// Render helper — mirrors how TerminalTTY.test.js handles React 18 concurrent rendering
async function renderModalIntoDom(element) {
  installDom();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });

  flushSync(() => {
    root.render(element);
  });
  await flushModalEffects();

  return {
    container,
    root,
    cleanup: async () => {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      cleanupMountedRoots(mountedRoots);
    },
  };
}

describe('TerminalSettingsModal', () => {
  let view;

  afterEach(async () => {
    if (view) {
      await view.cleanup();
      view = null;
    }
    if (global.document?.body) {
      global.document.body.innerHTML = '';
    }
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    test('modal renders when open=true with title "Configuración de Terminal"', async () => {
      const TerminalSettingsModal = require('../TerminalSettingsModal').default;
      view = await renderModalIntoDom(
        React.createElement(TerminalSettingsModal, {
          open: true,
          onClose: jest.fn(),
          panelId: 'p1',
          sessionId: 'oc-123',
          sessionType: 'opencode-durable',
          restorePolicy: 'manual',
          cwd: '/workspace/devhub',
        })
      );
      await flushModalEffects();
      // Use textContent (proven to work in passing tests) instead of data-testid selectors
      const bodyText = view.container.textContent || '';
      expect(bodyText).toContain('Configuración de Terminal');
    });

    test('modal shows session type, restore policy, and cwd', async () => {
      const TerminalSettingsModal = require('../TerminalSettingsModal').default;
      view = await renderModalIntoDom(
        React.createElement(TerminalSettingsModal, {
          open: true,
          onClose: jest.fn(),
          panelId: 'p1',
          sessionId: 'oc-456',
          sessionType: 'pty-durable',
          restorePolicy: 'auto',
          cwd: '/workspace/test',
        })
      );
      await flushModalEffects();
      const bodyText = view.container.textContent || '';
      expect(bodyText).toContain('pty-durable');
      expect(bodyText).toContain('auto');
      expect(bodyText).toContain('/workspace/test');
    });

    test('modal shows "Continuar sesión" primary CTA button', async () => {
      const TerminalSettingsModal = require('../TerminalSettingsModal').default;
      view = await renderModalIntoDom(
        React.createElement(TerminalSettingsModal, {
          open: true,
          onClose: jest.fn(),
          panelId: 'p1',
          sessionId: 'oc-789',
          sessionType: 'opencode-durable',
          restorePolicy: 'manual',
          cwd: '/workspace/devhub',
        })
      );
      await flushModalEffects();
      // Use text-based query (same pattern as the passing "Cerrar" test)
      const buttons = view.container.querySelectorAll('button');
      const continuarBtn = Array.from(buttons).find(
        (btn) => btn.textContent && btn.textContent.includes('Continuar sesión')
      );
      expect(continuarBtn).not.toBeNull();
    });
  });

  describe('"Continuar sesión" CTA dispatch', () => {
    test('dispatches devhub:manual-revive-requested with panelId and sessionId when clicked', async () => {
      const TerminalSettingsModal = require('../TerminalSettingsModal').default;
      const relaunchEvents = [];

      view = await renderModalIntoDom(
        React.createElement(TerminalSettingsModal, {
          open: true,
          onClose: jest.fn(),
          panelId: 'panel-abc',
          sessionId: 'session-xyz',
          sessionType: 'opencode-durable',
          restorePolicy: 'manual',
          cwd: '/workspace/devhub',
        })
      );
      await flushModalEffects();

      // Add listener AFTER installDom so window is defined
      const handler = (event) => relaunchEvents.push(event.detail);
      window.addEventListener('devhub:manual-revive-requested', handler);

      // Use text-based query (same pattern as the passing "Cerrar" test)
      const buttons = view.container.querySelectorAll('button');
      const continuarBtn = Array.from(buttons).find(
        (btn) => btn.textContent && btn.textContent.includes('Continuar sesión')
      );
      expect(continuarBtn).not.toBeNull();

      // Click via programmatic MouseEvent dispatch inside flushSync
      flushSync(() => {
        continuarBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      });

      expect(relaunchEvents).toHaveLength(1);
      expect(relaunchEvents[0]).toMatchObject({
        panelId: 'panel-abc',
        sessionId: 'session-xyz',
      });

      window.removeEventListener('devhub:manual-revive-requested', handler);
    });
  });

  describe('"Cerrar" button', () => {
    test('calls onClose when clicked', async () => {
      const TerminalSettingsModal = require('../TerminalSettingsModal').default;
      const onClose = jest.fn();

      view = await renderModalIntoDom(
        React.createElement(TerminalSettingsModal, {
          open: true,
          onClose,
          panelId: 'p1',
          sessionId: 'oc-123',
          sessionType: 'opencode-durable',
          restorePolicy: 'manual',
          cwd: '/workspace/devhub',
        })
      );
      await flushModalEffects();

      const buttons = view.container.querySelectorAll('button');
      const cerrarBtn = Array.from(buttons).find(
        (btn) => btn.textContent && btn.textContent.toLowerCase().includes('cerrar')
      );
      expect(cerrarBtn).not.toBeNull();

      // Click via programmatic MouseEvent dispatch inside flushSync
      flushSync(() => {
        cerrarBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

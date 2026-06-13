const React = require('react');
const {
  cleanupMountedRoots,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');
const TerminalStartupRestoreBanner = require('../TerminalStartupRestoreBanner').default;
const { STARTUP_RESTORE_PHASE } = require('@/lib/terminal/startupRestoreProgress');

jest.mock('framer-motion', () => {
  const React = require('react');
  const mockEl =
    (tag) =>
    ({ children, ...props }) =>
      React.createElement(tag, props, children);
  return {
    motion: {
      div: mockEl('div'),
    },
    AnimatePresence: ({ children }) => children,
  };
});

const mountedRoots = [];

describe('TerminalStartupRestoreBanner', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
  });

  test('renders running restore message and progress bar', () => {
    renderIntoDom(
      React.createElement(TerminalStartupRestoreBanner, {
        progress: {
          status: 'running',
          phase: STARTUP_RESTORE_PHASE.RELAUNCHING,
          completed: 2,
          total: 5,
          panelCount: 5,
        },
      }),
      mountedRoots
    );

    const banner = document.querySelector('[data-testid="terminal-startup-restore-banner"]');
    expect(banner).toBeTruthy();
    expect(
      document.querySelector('[data-testid="terminal-startup-restore-banner-message"]')?.textContent
    ).toContain('Restaurando 2/5 terminales');
    expect(
      document.querySelector('[data-testid="terminal-startup-restore-banner-progress"]')
    ).toBeTruthy();
  });

  test('renders completion message without progress bar', () => {
    renderIntoDom(
      React.createElement(TerminalStartupRestoreBanner, {
        progress: {
          status: 'done',
          phase: STARTUP_RESTORE_PHASE.DONE,
          completed: 3,
          total: 3,
        },
      }),
      mountedRoots
    );

    const banner = document.querySelector('[data-testid="terminal-startup-restore-banner"]');
    expect(banner?.getAttribute('data-status')).toBe('done');
    expect(
      document.querySelector('[data-testid="terminal-startup-restore-banner-message"]')?.textContent
    ).toContain('Restauradas 3 de 3 terminales');
    expect(
      document.querySelector('[data-testid="terminal-startup-restore-banner-progress"]')
    ).toBeNull();
  });
});
/**
 * Guard tests for useTerminalWorkspaceShortcuts.
 */

const React = require('react');
const { installDom } = require('@/test-support/domHarness');
const { renderHook } = require('@testing-library/react');

const useTerminalWorkspaceShortcuts = require('../useTerminalWorkspaceShortcuts').default;

describe('useTerminalWorkspaceShortcuts', () => {
  beforeAll(() => {
    installDom();
  });

  it('registers keydown listener on document', () => {
    const addSpy = jest.spyOn(document, 'addEventListener');
    const removeSpy = jest.spyOn(document, 'removeEventListener');

    const { unmount } = renderHook(() =>
      useTerminalWorkspaceShortcuts({
        isVisible: true,
        workspaceTerminalSetupOpen: false,
        managerRootRef: { current: document.createElement('div') },
        activeWsIdRef: { current: 'ws-1' },
        focusedPanelByWorkspaceRef: { current: {} },
        clearPanelFocusMode: jest.fn(),
        applyTerminalNavigationAction: jest.fn(() => false),
        applyTerminalWorkspaceAction: jest.fn(() => false),
        handleSplit: jest.fn(),
      })
    );

    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

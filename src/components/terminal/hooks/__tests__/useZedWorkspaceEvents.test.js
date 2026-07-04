/**
 * Guard tests for useZedWorkspaceEvents.
 */

const React = require('react');
const { installDom } = require('@/test-support/domHarness');
const { renderHook } = require('@testing-library/react');

const useZedWorkspaceEvents = require('../useZedWorkspaceEvents').default;

describe('useZedWorkspaceEvents', () => {
  beforeAll(() => {
    installDom();
  });

  it('registers and cleans up Zed window listeners', () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    const removeSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() =>
      useZedWorkspaceEvents({
        projectId: 'proj-1',
        activeWsId: 'ws-1',
        activePanelId: 'p1',
        rightDockState: {},
        workspacesRef: { current: [{ id: 'ws-1', columns: [] }] },
        activeWsIdRef: { current: 'ws-1' },
        activePanelIdsRef: { current: { 'ws-1': 'p1' } },
        handleSplit: jest.fn(),
        handleClosePanel: jest.fn(),
        getAllPanelIds: () => ['p1'],
        activateWorkspacePanel: jest.fn(),
        setFocusedPanelByWorkspace: jest.fn(),
        updateRightDockState: jest.fn(),
        updateBrowserWindowState: jest.fn(),
        setWorkspaces: jest.fn(),
        setRestoreSettingsModal: jest.fn(),
      })
    );

    expect(addSpy).toHaveBeenCalledWith('devhub:zed-open-terminal', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('devhub:zed-open-url', expect.any(Function));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('devhub:zed-open-terminal', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('devhub:zed-open-url', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

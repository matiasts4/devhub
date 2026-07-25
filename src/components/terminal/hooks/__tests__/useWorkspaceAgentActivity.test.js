/**
 * Guard tests for useWorkspaceAgentActivity — per-workspace aggregate agent
 * activity that powers the top tab strip indicator.
 */

const { installDom } = require('@/test-support/domHarness');
const { renderHook, act } = require('@testing-library/react');

const { default: useWorkspaceAgentActivity } = require('../useWorkspaceAgentActivity');
const { setPanelActivity, clearPanelActivity } = require('../../utils/panelActivityStore');
const {
  setPanelSemanticState,
  clearPanelSemanticState,
} = require('../../utils/panelSemanticStateStore');

beforeAll(() => {
  installDom();
});

afterEach(() => {
  // Reset the module-level stores between tests.
  for (const pid of ['p1', 'p2', 'p3', 'p4']) {
    clearPanelActivity(pid);
    clearPanelSemanticState(pid);
  }
});

function makeWorkspaces() {
  return [
    { id: 'ws-a', columns: [{ panels: [{ id: 'p1' }, { id: 'p2' }] }] },
    { id: 'ws-b', columns: [{ panels: [{ id: 'p3' }] }] },
  ];
}

describe('useWorkspaceAgentActivity', () => {
  it('returns null for workspaces with no agent signal', () => {
    const { result } = renderHook(() => useWorkspaceAgentActivity(makeWorkspaces(), {}));
    expect(result.current['ws-a']).toBeNull();
    expect(result.current['ws-b']).toBeNull();
  });

  it('marks a workspace running when any panel reports running', () => {
    const { result } = renderHook(() => useWorkspaceAgentActivity(makeWorkspaces(), {}));
    act(() => {
      setPanelSemanticState('p2', { agentTuiState: 'running' });
    });
    expect(result.current['ws-a']).toBe('running');
    expect(result.current['ws-b']).toBeNull();
  });

  it('does NOT light up for raw PTY activity from a non-agent process', () => {
    // A dev server (or any plain command) produces PTY output but no
    // `agent-state` frames, so it must never trigger the indicator.
    const { result } = renderHook(() => useWorkspaceAgentActivity(makeWorkspaces(), {}));
    act(() => {
      setPanelActivity('p3', 'running');
    });
    expect(result.current['ws-b']).toBeNull();
  });

  it('reports blocked when semantic state is blocked and nothing is running', () => {
    const { result } = renderHook(() => useWorkspaceAgentActivity(makeWorkspaces(), {}));
    act(() => {
      setPanelSemanticState('p1', { agentTuiState: 'blocked' });
    });
    expect(result.current['ws-a']).toBe('blocked');
  });

  it('running wins over blocked within the same workspace', () => {
    const { result } = renderHook(() => useWorkspaceAgentActivity(makeWorkspaces(), {}));
    act(() => {
      setPanelSemanticState('p1', { agentTuiState: 'blocked' });
      setPanelSemanticState('p2', { agentTuiState: 'running' });
    });
    expect(result.current['ws-a']).toBe('running');
  });

  it('clears the indicator when the agent goes idle', () => {
    const { result } = renderHook(() => useWorkspaceAgentActivity(makeWorkspaces(), {}));
    act(() => {
      setPanelSemanticState('p1', { agentTuiState: 'running' });
    });
    expect(result.current['ws-a']).toBe('running');
    act(() => {
      setPanelSemanticState('p1', { agentTuiState: 'idle' });
    });
    expect(result.current['ws-a']).toBeNull();
  });

  it('reads panels from dedicated workspace windows when present', () => {
    const workspaces = [{ id: 'ws-a', columns: [{ panels: [{ id: 'p1' }] }] }];
    const windows = { 'ws-a': [{ id: 'win-1', columns: [{ panels: [{ id: 'p4' }] }] }] };
    const { result } = renderHook(() => useWorkspaceAgentActivity(workspaces, windows));
    act(() => {
      setPanelSemanticState('p4', { agentTuiState: 'running' });
    });
    expect(result.current['ws-a']).toBe('running');
  });

  it('keeps the same aggregate across workspace reorders (no re-subscribe churn)', () => {
    const workspaces = makeWorkspaces();
    const { result, rerender } = renderHook(({ ws }) => useWorkspaceAgentActivity(ws, {}), {
      initialProps: { ws: workspaces },
    });
    act(() => {
      setPanelSemanticState('p1', { agentTuiState: 'running' });
    });
    expect(result.current['ws-a']).toBe('running');

    // Reorder the workspaces array — the aggregate must be preserved.
    rerender({ ws: [workspaces[1], workspaces[0]] });
    expect(result.current['ws-a']).toBe('running');
    expect(result.current['ws-b']).toBeNull();
  });
});

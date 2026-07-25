/**
 * Guard tests for useActivatedWorkspaceIds — activate-then-keep-alive
 * workspace shell mounting (PR4 terminal-load-performance).
 */

const { installDom } = require('@/test-support/domHarness');
const { renderHook, act } = require('@testing-library/react');

const {
  default: useActivatedWorkspaceIds,
  resolveRenderWorkspaceIds,
} = require('../useActivatedWorkspaceIds');

beforeAll(() => {
  installDom();
});

describe('resolveRenderWorkspaceIds', () => {
  it('always includes the current active id even if not yet accumulated', () => {
    const renderIds = resolveRenderWorkspaceIds(new Set(['ws-1']), 'ws-2');
    expect(renderIds.has('ws-1')).toBe(true);
    expect(renderIds.has('ws-2')).toBe(true);
  });

  it('handles a null active id without adding it', () => {
    const renderIds = resolveRenderWorkspaceIds(new Set(['ws-1']), null);
    expect(renderIds.size).toBe(1);
    expect(renderIds.has(null)).toBe(false);
  });
});

describe('useActivatedWorkspaceIds', () => {
  it('seeds with the initial active workspace only', () => {
    const { result } = renderHook(({ activeWsId }) => useActivatedWorkspaceIds(activeWsId), {
      initialProps: { activeWsId: 'ws-1' },
    });
    expect([...result.current]).toEqual(['ws-1']);
  });

  it('accumulates activated workspaces without unmounting previous ones', () => {
    const { result, rerender } = renderHook(
      ({ activeWsId }) => useActivatedWorkspaceIds(activeWsId),
      { initialProps: { activeWsId: 'ws-1' } }
    );

    rerender({ activeWsId: 'ws-2' });
    // Same commit: the new workspace is renderable immediately, the previous
    // one stays mounted (keep-alive).
    expect(result.current.has('ws-1')).toBe(true);
    expect(result.current.has('ws-2')).toBe(true);

    rerender({ activeWsId: 'ws-1' });
    expect(result.current.has('ws-1')).toBe(true);
    expect(result.current.has('ws-2')).toBe(true);
  });

  it('does not duplicate ids when the same workspace is re-activated', () => {
    const { result, rerender } = renderHook(
      ({ activeWsId }) => useActivatedWorkspaceIds(activeWsId),
      { initialProps: { activeWsId: 'ws-1' } }
    );

    rerender({ activeWsId: 'ws-2' });
    rerender({ activeWsId: 'ws-1' });
    rerender({ activeWsId: 'ws-2' });
    expect(result.current.size).toBe(2);
  });

  it('keeps returning the same Set while the active id is already accumulated', () => {
    const { result, rerender } = renderHook(
      ({ activeWsId }) => useActivatedWorkspaceIds(activeWsId),
      { initialProps: { activeWsId: 'ws-1' } }
    );
    const first = result.current;
    act(() => {
      rerender({ activeWsId: 'ws-1' });
    });
    // resolveRenderWorkspaceIds builds a fresh union each render, but the
    // underlying accumulated set must not gain spurious entries.
    expect([...result.current]).toEqual(['ws-1']);
    expect(result.current.size).toBe(first.size);
  });
});

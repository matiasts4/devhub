/**
 * T-WSR-zed-001 (slice 1, ASST-UI-002/003/004): pure-function tests for
 * `applyZedOpenTerminalFocus`.
 *
 * The helper is pure: no React, no `window`. It receives a snapshot of
 * the callables and the `maximizedView` value the consumer wants the
 * helper to consider, and returns a result shape. Tests stub the deps
 * with `vi.fn()` (or `jest.fn()` — same semantics) and assert which
 * callables were invoked with which args.
 *
 * Test plan (per tasks.md 1.1):
 *   (a) `focus: true` + `maximizedView: 'pizarra'` →
 *       activated:true, focused:true, demaximized:false (stay in pizarra)
 *   (b) `focus: true` + `maximizedView: 'browser'` →
 *       activated:true, focused:true, demaximized:false
 *   (c) `focus: undefined` →
 *       activated:true, focused:false, demaximized:false
 *   (d) empty `targetWsId` →
 *       returns `{ activated: false, … }` and does NOT call any dep
 */

const { applyZedOpenTerminalFocus } = require('../zedOpenTerminalFocus.js');

function makeDeps(overrides = {}) {
  return {
    activateWorkspacePanel: jest.fn(),
    setFocusedPanelByWorkspace: jest.fn(),
    updateRightDockState: jest.fn(),
    maximizedView: null,
    ...overrides,
  };
}

describe('applyZedOpenTerminalFocus (T-WSR-zed-001)', () => {
  test('case (a) focus:true + maximizedView:"pizarra" → activates, focuses, stays in pizarra', () => {
    const deps = makeDeps({ maximizedView: 'pizarra' });

    const result = applyZedOpenTerminalFocus('ws-1', 'p-new', { focus: true }, deps);

    expect(result).toEqual({ activated: true, focused: true, demaximized: false });

    expect(deps.activateWorkspacePanel).toHaveBeenCalledTimes(1);
    expect(deps.activateWorkspacePanel).toHaveBeenCalledWith('ws-1', 'p-new');

    expect(deps.setFocusedPanelByWorkspace).toHaveBeenCalledTimes(1);
    const updater = deps.setFocusedPanelByWorkspace.mock.calls[0][0];
    expect(typeof updater).toBe('function');
    expect(updater({ 'ws-0': 'p-0' })).toEqual({ 'ws-0': 'p-0', 'ws-1': 'p-new' });

    expect(deps.updateRightDockState).not.toHaveBeenCalled();
  });

  test('case (b) focus:true + maximizedView:"browser" → activates, focuses, NO de-max', () => {
    const deps = makeDeps({ maximizedView: 'browser' });

    const result = applyZedOpenTerminalFocus('ws-1', 'p-new', { focus: true }, deps);

    expect(result).toEqual({ activated: true, focused: true, demaximized: false });

    expect(deps.activateWorkspacePanel).toHaveBeenCalledTimes(1);
    expect(deps.activateWorkspacePanel).toHaveBeenCalledWith('ws-1', 'p-new');

    expect(deps.setFocusedPanelByWorkspace).toHaveBeenCalledTimes(1);

    // No de-max when pizarra is not the active maximized view.
    expect(deps.updateRightDockState).not.toHaveBeenCalled();
  });

  test('case (c) focus:undefined → activates, NO focus, NO de-max', () => {
    const deps = makeDeps({ maximizedView: 'pizarra' });

    const result = applyZedOpenTerminalFocus('ws-1', 'p-new', { focus: undefined }, deps);

    expect(result).toEqual({ activated: true, focused: false, demaximized: false });

    expect(deps.activateWorkspacePanel).toHaveBeenCalledTimes(1);
    expect(deps.setFocusedPanelByWorkspace).not.toHaveBeenCalled();
    expect(deps.updateRightDockState).not.toHaveBeenCalled();
  });

  test('case (d) empty targetWsId → returns { activated: false, … } and does NOT call any dep', () => {
    const deps = makeDeps({ maximizedView: 'pizarra' });

    const result = applyZedOpenTerminalFocus('', 'p-new', { focus: true }, deps);

    expect(result).toEqual({ activated: false, focused: false, demaximized: false });

    expect(deps.activateWorkspacePanel).not.toHaveBeenCalled();
    expect(deps.setFocusedPanelByWorkspace).not.toHaveBeenCalled();
    expect(deps.updateRightDockState).not.toHaveBeenCalled();
  });

  test('case (d.1) empty newPanelId → returns { activated: false, … } and does NOT call any dep', () => {
    // Defensive: handleSplit can return null when the source panel is
    // missing. The helper must bail.
    const deps = makeDeps({ maximizedView: 'pizarra' });

    const result = applyZedOpenTerminalFocus('ws-1', null, { focus: true }, deps);

    expect(result).toEqual({ activated: false, focused: false, demaximized: false });
    expect(deps.activateWorkspacePanel).not.toHaveBeenCalled();
    expect(deps.setFocusedPanelByWorkspace).not.toHaveBeenCalled();
    expect(deps.updateRightDockState).not.toHaveBeenCalled();
  });
});

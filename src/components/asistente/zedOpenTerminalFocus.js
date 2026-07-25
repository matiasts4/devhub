/**
 * T-WSR-zed-001: extract the post-handleSplit focus chain from
 * TerminalWorkspacesManager.handleZedOpenTerminal so it can be unit-tested
 * without mounting the 4 600-line TWM. Pure function — does NOT import
 * React, does NOT touch `window`, does NOT call any state setter.
 *
 * Contract (T-WSR-zed-001, design §3.1):
 *   - When `targetWsId && newPanelId`: always call `activateWorkspacePanel`.
 *   - When `detail.focus === true`: call `setFocusedPanelByWorkspace`
 *     (functional update). While pizarra canvas is active, stay in pizarra
 *     (do not de-maximize to the side-dock browser — surfaces render on
 *     the canvas via the shared registry).
 *   - Otherwise return the all-false shape.
 *
 * SSR-safety: this module never references `window` or any browser
 * global at module scope. It is safe to import from a Server Component
 * or a Node.js test runner.
 *
 * @param {string} targetWsId - active workspace id
 * @param {string} newPanelId - panel id returned by handleSplit
 * @param {object} detail     - event detail; reads `focus` (boolean)
 * @param {object} deps       - the four callables + a snapshot of
 *                              maximizedView (avoids reading React state)
 * @returns {{ activated: boolean, focused: boolean, demaximized: boolean }}
 */
export function applyZedOpenTerminalFocus(
  targetWsId,
  newPanelId,
  detail,
  {
    activateWorkspacePanel,
    setFocusedPanelByWorkspace,
    updateRightDockState: _updateRightDockState,
    maximizedView: _maximizedView,
  }
) {
  if (!targetWsId || !newPanelId) {
    return { activated: false, focused: false, demaximized: false };
  }

  // Always: activate the panel in the active workspace. Same pattern as
  // the existing TWM helper. The user opens a new panel; it becomes
  // active regardless of `focus` opt-in.
  activateWorkspacePanel(targetWsId, newPanelId);

  const wantFocus = detail && detail.focus === true;
  let focused = false;
  const demaximized = false;

  if (wantFocus) {
    // Clear or update the focused-panel so the new panel is the only one
    // visible in its workspace (the user is asking us to "focus on this").
    setFocusedPanelByWorkspace((prev) => ({ ...prev, [targetWsId]: newPanelId }));
    focused = true;
  }

  return { activated: true, focused, demaximized };
}

/**
 * Pure animation helpers for TerminalWorkspacesManager.
 * Extracted for testability — no React/DOM dependencies.
 *
 * Native VTE panels are positioned via screen-space bounds from the WebView.
 * Scaling the workspace shell desyncs GTK overlays from React chrome during
 * maximize/restore, so we only animate opacity here.
 */

/**
 * Returns Framer Motion props for the workspace container.
 * Opacity-only transition keeps native terminal bounds in sync with layout.
 *
 * @param {boolean} isMaximized
 * @returns {{ initial, animate, transition }} Framer Motion props
 */
export function getWorkspaceAnimProps(isMaximized) {
  return {
    initial: { opacity: isMaximized ? 1 : 0.94 },
    animate: { opacity: 1 },
    transition: { duration: 0.18, ease: 'easeOut' },
  };
}
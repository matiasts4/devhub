/**
 * Pure animation helpers for TerminalWorkspacesManager.
 * Extracted for testability — no React/DOM dependencies.
 *
 * Native VTE panels are positioned via screen-space bounds from the WebView.
 * Scaling the workspace shell desyncs GTK overlays from React chrome during
 * maximize/restore, so we only animate opacity here — never transform/scale.
 */

/**
 * Returns Framer Motion props for the workspace container.
 * Opacity-only transition keeps native terminal bounds in sync with layout.
 *
 * @param {boolean} isMaximized
 * @returns {{ initial, animate, transition }} Framer Motion props
 */
export function getWorkspaceAnimProps(isMaximized) {
  // When the workspace first mounts, fade in from opacity 0 so the initial
  // paint doesn't flash. When restoring from maximized, skip the initial
  // (it's already visible) and just let the transition complete naturally.
  return {
    initial: { opacity: isMaximized ? 1 : 0 },
    animate: { opacity: 1 },
    // Slightly longer enter duration (220ms) with a snappy ease-out curve
    // for a smooth, polished mount feel. Opacity-only stays on the GPU.
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  };
}

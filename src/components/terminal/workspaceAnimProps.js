/**
 * Pure animation helpers for TerminalWorkspacesManager.
 * Extracted for testability — no React/DOM dependencies.
 */

/**
 * Returns Framer Motion props for the workspace container.
 * On maximize/expand, animates from slightly scaled-down to full size.
 * Transition: 200ms ease.
 *
 * @param {boolean} isMaximized
 * @returns {{ initial, animate, transition }} Framer Motion props
 */
export function getWorkspaceAnimProps(isMaximized) {
  return {
    initial: { scale: 0.96, opacity: 0.92 },
    animate: { scale: 1, opacity: 1 },
    transition: { duration: 0.2, ease: 'easeOut' },
  };
}

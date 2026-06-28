import { TRANSITION } from '@/components/ui/system/motion-tokens';

/**
 * Pure animation helpers for TerminalWorkspacesManager.
 * Extracted for testability — no React/DOM dependencies.
 *
 * Native VTE panels are positioned via screen-space bounds from the WebView.
 * Scaling the workspace shell desyncs GTK overlays from React chrome during
 * maximize/restore, so we only animate opacity here — never transform/scale.
 */

/**
 * GPU slide for the shared right dock layer (browser, editor, swarm, etc.).
 * Position (left/width) is applied instantly; only transform + opacity animate
 * so the panel enters from the right without sweeping across the workspace.
 *
 * @param {{ isVisible: boolean, isDragging?: boolean }} options
 * @returns {{ initial, animate, transition }}
 */
export function getRightDockAnimProps({ isVisible, isDragging = false, isFullscreen = false }) {
  // Fullscreen takeover (pizarra / browser / swarm maximized): the dock fills
  // the whole workspace, so the default `x: '100%'` slide is a slow horizontal
  // sweep across the entire screen (280ms) that feels sluggish when entering
  // the pizarra. For takeovers we use an opacity-only fade timed to match
  // useModeTransition enter (220ms) so workspace↔pizarra cross-fades feel
  // synchronized. Opacity stays on the GPU and keeps native surface bounds
  // in sync (no transform on the shell).
  if (isFullscreen) {
    return {
      initial: { opacity: 0 },
      animate: isVisible ? { opacity: 1 } : { opacity: 0 },
      transition: isDragging ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
    };
  }
  return {
    initial: { opacity: 0, x: '100%' },
    animate: isVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: '100%' },
    transition: isDragging ? { duration: 0 } : TRANSITION.enter,
  };
}

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

/**
 * Workspace shell visibility — instant hide (no crossfade) so inactive
 * xterm-canvas panels cannot bleed corrupted glyphs while opacity animates.
 * Fullscreen browser/pizarra/swarm suppresses the terminal grid entirely.
 */
export function resolveWorkspaceShellVisibilityStyle({
  isActiveWorkspace,
  isManagerVisible,
  isFullscreenTakeover = false,
} = {}) {
  const shouldShow = Boolean(isManagerVisible && isActiveWorkspace && !isFullscreenTakeover);

  if (!shouldShow) {
    return {
      opacity: 0,
      visibility: 'hidden',
      pointerEvents: 'none',
      contain: 'strict',
      transition: 'none',
      willChange: 'auto',
    };
  }

  return {
    opacity: 1,
    visibility: 'visible',
    pointerEvents: 'auto',
    contain: 'layout paint',
    transition: 'none',
    willChange: 'auto',
  };
}

/**
 * Stacked V1/V2/V3 windows inside one workspace tab.
 * Uses the same visibility contract as workspace tab shells; split refit after
 * switch is driven by panel-group-layout bursts (same path as manual resize).
 */
export function resolveWorkspaceWindowVisibilityStyle({
  isActiveWindow,
  isFullscreenTakeover = false,
} = {}) {
  const base = resolveWorkspaceShellVisibilityStyle({
    isActiveWorkspace: isActiveWindow,
    isManagerVisible: true,
    isFullscreenTakeover,
  });

  if (!isActiveWindow || isFullscreenTakeover) return base;

  return { ...base, backgroundColor: 'var(--surface-app)' };
}

/** Opaque chrome for fullscreen dock takeover so terminals cannot show through. */
export function resolveRightDockTakeoverChromeStyle(isFullscreenTakeover = false) {
  if (!isFullscreenTakeover) return {};
  return {
    backgroundColor: 'var(--surface-app)',
    isolation: 'isolate',
  };
}

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
 * Opacity-only fade for the shared right dock layer (browser, editor, swarm).
 * Position (left/width) is applied instantly. No horizontal transform — a
 * slide would desync WebView2 child HWND bounds from getBoundingClientRect.
 *
 * @param {{ isVisible: boolean, isDragging?: boolean, isFullscreen?: boolean }} options
 * @returns {{ initial, animate, transition }}
 */
export function getRightDockAnimProps({ isVisible, isDragging = false, isFullscreen = false }) {
  // ponytail: WebView2 child HWND is screen-positioned. A horizontal slide
  // (x: 100% → 0) desyncs getBoundingClientRect from the native surface and
  // leaves a black dock on cold launch. Opacity-only keeps bounds stable —
  // same contract as VTE / fullscreen takeover.
  //
  // Blank-pizarra hardening: fullscreen takeovers (and any already-visible
  // dock) start at opacity 1. Starting at 0 left a black content area when
  // the enter animation was interrupted mid-toggle or mid-workspace-switch.
  const startVisible = Boolean(isVisible && isFullscreen);
  return {
    initial: { opacity: startVisible || isVisible ? (isFullscreen ? 1 : 0) : 0 },
    animate: isVisible ? { opacity: 1 } : { opacity: 0 },
    transition: isDragging
      ? { duration: 0 }
      : isFullscreen && isVisible
        ? { duration: 0 }
        : { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
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
 * Workspace shell visibility — Option B keep-alive: inactive shells stay
 * compositor-visible (opacity 0 only). Avoid visibility:hidden and contain:strict
 * toggles — they tear down GPU layers and cause a post-reveal blink on tab switch.
 * Fullscreen browser/pizarra/swarm still fully suppresses the terminal grid.
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
      pointerEvents: 'none',
      contain: 'layout paint',
      transition: 'none',
      willChange: 'auto',
    };
  }

  return {
    opacity: 1,
    pointerEvents: 'auto',
    contain: 'layout paint',
    transition: 'none',
    willChange: 'auto',
  };
}

/**
 * Stacked V1/V2/V3 windows inside one workspace tab.
 * Parked windows now use the same opacity-only keep-alive as workspace tabs.
 * With Option B the GPU addon stays attached, and visibility:hidden tears down
 * the WebGL compositor, producing a black frame on switch-back. Keeping the
 * surface compositor-alive (opacity:0, visibility:visible) lets the canvas keep
 * its bitmap so the window reappears instantly.
 */
export function resolveWorkspaceWindowVisibilityStyle({
  isActiveWindow,
  isFullscreenTakeover = false,
} = {}) {
  if (!isActiveWindow || isFullscreenTakeover) {
    return {
      opacity: 0,
      pointerEvents: 'none',
      contain: 'layout paint',
      transition: 'none',
      willChange: 'auto',
    };
  }

  return {
    opacity: 1,
    pointerEvents: 'auto',
    contain: 'layout paint',
    transition: 'none',
    willChange: 'auto',
    backgroundColor: 'var(--surface-app)',
  };
}

/** Opaque chrome for fullscreen dock takeover so terminals cannot show through. */
export function resolveRightDockTakeoverChromeStyle(isFullscreenTakeover = false) {
  if (!isFullscreenTakeover) return {};
  return {
    backgroundColor: 'var(--surface-app)',
    isolation: 'isolate',
  };
}

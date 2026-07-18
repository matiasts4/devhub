import { DUR, EASE, TRANSITION } from '@/components/ui/system/motion-tokens';

/**
 * Pure animation helpers for TerminalWorkspacesManager.
 * Extracted for testability — no React/DOM dependencies.
 *
 * Native VTE panels are positioned via screen-space bounds from the WebView.
 * Scaling the workspace shell desyncs GTK overlays from React chrome during
 * maximize/restore, so we only animate opacity here — never transform/scale
 * on the workspace shell itself.
 */

const EASE_OUT = EASE.out;

function resolveChromeDurationSeconds(motionMode = 'normal') {
  if (motionMode === 'reduced') return 0;
  // Cap structural chrome at 160ms (page enter uses TRANSITION.enter 320ms).
  return Math.min(DUR.fast, 160) / 1000;
}

/**
 * GPU slide for the shared right dock layer (browser, editor, swarm, etc.).
 * Position (left/width) is applied instantly; only transform + opacity animate.
 *
 * @param {{ isVisible: boolean, isDragging?: boolean, isFullscreen?: boolean, motionMode?: string }} options
 */
export function getRightDockAnimProps({
  isVisible,
  isDragging = false,
  isFullscreen = false,
  motionMode = 'normal',
} = {}) {
  const duration = isDragging ? 0 : resolveChromeDurationSeconds(motionMode);

  if (isFullscreen) {
    // Opacity-only for takeovers — no full-width slide sweep.
    return {
      initial: { opacity: 0 },
      animate: isVisible ? { opacity: 1 } : { opacity: 0 },
      transition: {
        duration: isDragging ? 0 : Math.min(duration, DUR.fast / 1000),
        ease: EASE_OUT,
      },
    };
  }

  return {
    initial: { opacity: 0, x: '100%' },
    animate: isVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: '100%' },
    transition: duration === 0 ? { duration: 0 } : { duration, ease: EASE_OUT },
  };
}

/**
 * Workspace shell mount — no fade (instant paint; terminals are already heavy).
 *
 * @param {boolean} _isMaximized
 * @param {'reduced'|'normal'|'amplified'} [_motionMode]
 */
export function getWorkspaceAnimProps(_isMaximized, _motionMode = 'normal') {
  return {
    initial: false,
    animate: { opacity: 1 },
    transition: { duration: 0 },
  };
}

/**
 * Workspace shell visibility — Option B keep-alive: inactive shells stay
 * compositor-visible (opacity 0 only). Avoid visibility:hidden and contain:strict
 * toggles — they tear down GPU layers and cause a post-reveal blink on tab switch.
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
 */
export function resolveWorkspaceWindowVisibilityStyle({
  isActiveWindow,
  isFullscreenTakeover = false,
  isManagerVisible = true,
} = {}) {
  if (!isActiveWindow || isFullscreenTakeover || !isManagerVisible) {
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

// Re-export for callers that want token defaults alongside helpers.
export { TRANSITION };

'use client';

// AgentStatusDot — shared status dot for agent activity, driven by the
// PANEL_STATUS vocabulary (panelStatusHelpers.js). Used by:
//   - PanelStatusBadge (terminal panel header)
//   - WorkspaceWindowTabBar (workspace tab strip, next to the workspace name)
// Colors come from getPanelStatusDotColor so both surfaces always agree.
//
// Pulse and halo share one 2.4s period (agent-dot-* keyframes in globals.css)
// with the phase anchored to wall-clock time via a negative animation-delay,
// so badge and tab dots always beat in sync regardless of mount time.

import { PANEL_STATUS, getPanelStatusDotColor } from '../utils/panelStatusHelpers';

export const AGENT_DOT_PERIOD_MS = 2400;

// Computed once at module load so every dot shares the same phase anchor and
// the animation is not restarted on each render / window switch.
const AGENT_DOT_SYNCED_DELAY = `-${Date.now() % AGENT_DOT_PERIOD_MS}ms`;

function hexToRgba(rgb, alpha) {
  const match = String(rgb).match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!match) return rgb;
  return `rgba(${match[1]},${match[2]},${match[3]},${alpha})`;
}

/**
 * @param {object} props
 * @param {string} props.status - one of PANEL_STATUS values
 * @param {number} [props.size=6] - dot diameter in px
 * @param {boolean} [props.pulse=false] - subtle opacity pulse (badge style)
 * @param {boolean} [props.halo=false] - expanding halo ring (workspace tab style)
 * @param {boolean} [props.glow=false] - colored box-shadow glow around the dot
 * @param {number|null} [props.boxSize=null] - outer box size in px (defaults
 *   to max(size*2, 12) so halos have room; pass `size` for a tight box)
 * @param {string} [props.className]
 * @param {object} [props.style]
 */
export default function AgentStatusDot({
  status,
  size = 6,
  pulse = false,
  halo = false,
  glow = false,
  boxSize = null,
  className = '',
  style,
}) {
  const color = getPanelStatusDotColor(status);
  const isRunning = status === PANEL_STATUS.RUNNING;
  const isBlocked = status === PANEL_STATUS.BLOCKED;
  const resolvedBoxSize = boxSize ?? Math.max(size * 2, 12);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: resolvedBoxSize, height: resolvedBoxSize, ...style }}
      aria-hidden="true"
    >
      {halo && isRunning ? (
        <span
          className="agent-dot-halo absolute inset-0 rounded-full"
          style={{ background: hexToRgba(color, 0.5), animationDelay: AGENT_DOT_SYNCED_DELAY }}
          suppressHydrationWarning
        />
      ) : null}
      {halo && isBlocked ? (
        <span
          className="agent-dot-halo-blocked absolute inset-0 rounded-full"
          style={{ background: hexToRgba(color, 0.45), animationDelay: AGENT_DOT_SYNCED_DELAY }}
          suppressHydrationWarning
        />
      ) : null}
      <span
        className={`relative rounded-full transition-all duration-150 ${pulse ? 'agent-dot-pulse' : ''}`}
        style={{
          width: size,
          height: size,
          background: color,
          boxShadow: glow && (isRunning || isBlocked) ? `0 0 8px ${hexToRgba(color, 0.75)}` : 'none',
          ...(pulse ? { animationDelay: AGENT_DOT_SYNCED_DELAY } : null),
        }}
        suppressHydrationWarning
      />
    </span>
  );
}

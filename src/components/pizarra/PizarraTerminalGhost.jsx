'use client';

/**
 * PizarraTerminalGhost — pizarra-instant-enter A5 ("aparecer ya").
 *
 * Renders the last captured text viewport of a terminal (see
 * `@/lib/terminal/terminalViewportSnapshot`) INSTANTLY when a pizarra
 * surface card mounts, while the real surface goes through its retarget →
 * remount → fit → repaint chain. Without this, the card body sits empty
 * (black) for the whole chain — the "no carga / muy lento" the user sees
 * on workspace→pizarra.
 *
 * Hide policy (deliberately simple and event-driven):
 *   - The first `devhub:terminal-layout-settled` naming this panel starts
 *     a GHOST_LIVE_GRACE_MS grace window (A2's bounded repaint lands in
 *     that window), then the ghost crossfades out over GHOST_FADE_MS and
 *     the snapshot is cleared.
 *   - GHOST_SAFETY_MS is the absolute cap: the ghost ALWAYS goes away,
 *     even if the live surface never settles (it shows its own reconnect
 *     chrome in that case).
 *
 * pointerEvents is 'none' at all times: the ghost is a painting, never an
 * input target — clicks/keys fall through to the live surface underneath.
 */

import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  getTerminalViewportSnapshot,
  clearTerminalViewportSnapshot,
} from '@/lib/terminal/terminalViewportSnapshot';

export const GHOST_LIVE_GRACE_MS = 250;
export const GHOST_FADE_MS = 150;
export const GHOST_SAFETY_MS = 4000;
export const GHOST_TESTID = 'pizarra-terminal-ghost';

export default function PizarraTerminalGhost({ terminalId }) {
  // Mount-time peek: the ghost exists only when a fresh snapshot was
  // captured at the previous teardown. Never re-read afterwards — the
  // overlay is a one-shot painting, not a live mirror.
  const [snapshot] = useState(() => getTerminalViewportSnapshot(terminalId));
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);
  const timersRef = useRef([]);

  useEffect(() => {
    if (!snapshot) return undefined;
    let hideStarted = false;

    const beginHide = () => {
      if (hideStarted) return;
      hideStarted = true;
      setFading(true);
      timersRef.current.push(
        window.setTimeout(() => {
          clearTerminalViewportSnapshot(terminalId);
          setGone(true);
        }, GHOST_FADE_MS)
      );
    };

    const handleSettled = (event) => {
      const panelIds = event?.detail?.panelIds;
      if (!Array.isArray(panelIds) || !panelIds.includes(terminalId)) return;
      // Grace window: the settled dispatch precedes the verified repaint
      // (A2's scheduleBoundedForceRepaint); fading immediately would still
      // flash an empty card on slow GPU reattaches.
      timersRef.current.push(window.setTimeout(beginHide, GHOST_LIVE_GRACE_MS));
    };

    window.addEventListener('devhub:terminal-layout-settled', handleSettled);
    // Absolute cap: never trap the card under a stale painting.
    timersRef.current.push(window.setTimeout(beginHide, GHOST_SAFETY_MS));

    return () => {
      window.removeEventListener('devhub:terminal-layout-settled', handleSettled);
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    };
  }, [snapshot, terminalId]);

  if (!snapshot || gone) return null;

  return (
    <div
      data-testid={GHOST_TESTID}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        overflow: 'hidden',
        pointerEvents: 'none',
        background: 'var(--terminal-bg, var(--surface-app, #0D1117))',
        color: 'var(--terminal-fg, #F0F6FC)',
        fontFamily:
          "'Noto Sans Mono', 'DejaVu Sans Mono', 'Liberation Mono', ui-monospace, Menlo, Consolas, monospace",
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.5,
        whiteSpace: 'pre',
        padding: '4px 8px',
        textAlign: 'left',
        opacity: fading ? 0 : 0.92,
        transition: `opacity ${GHOST_FADE_MS}ms ease-out`,
      }}
    >
      {snapshot.rows.join('\n')}
    </div>
  );
}

PizarraTerminalGhost.propTypes = {
  terminalId: PropTypes.string.isRequired,
};

'use client';

/**
 * SceneryBackground — full-space wallpaper layer.
 *
 * Renders the active scenery (gradient stack or custom image) as an
 * absolutely-positioned background that fills its nearest positioned
 * ancestor. Listens for live `devhub:scenery-changed` events so the
 * wallpaper updates instantly when the user changes it in settings.
 *
 * Usage: place inside any `relative` container:
 *   <div className="relative h-full">
 *     <SceneryBackground scope="pizarra" />
 *     ...content on top...
 *   </div>
 *
 * Props:
 *  - scope: 'pizarra' | 'terminal' — which surface this instance serves
 *  - className: extra classes for the container (default: inset-0 absolute)
 *  - zIndex: stacking order (default: 0)
 *  - withOverlay: render the dim/blur readability overlay (default: true)
 */

import { useState, useEffect, useLayoutEffect } from 'react';
import {
  readSceneryPrefs,
  resolveSceneryStyle,
  resolveSceneryOverlayStyle,
  resolveTerminalTintColor,
  SCENERY_CHANGED_EVENT,
} from '@/lib/sceneries/sceneryPreferences';
import { syncSceneryThemeToLiveTerminals } from '@/components/terminal/TerminalThemeSync';

// SSR-safe layout effect: the body flag must be set before the first paint so
// the glass CSS rules (and the xterm transparency they enable) apply from the
// very first frame instead of one frame (or several seconds, if a re-theme
// never comes) late.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function SceneryBackground({
  scope = 'pizarra',
  className = '',
  zIndex = 0,
  withOverlay = true,
}) {
  const [prefs, setPrefs] = useState(() => readSceneryPrefs());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    setPrefs(readSceneryPrefs());
    const handleChange = (event) => {
      setPrefs(event.detail || readSceneryPrefs());
    };
    window.addEventListener(SCENERY_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(SCENERY_CHANGED_EVENT, handleChange);
  }, []);

  // scenery-wallpapers: reflect "a wallpaper is active" on <body> so the global
  // stylesheet can turn every xterm layer transparent (glass effect) regardless
  // of which surface hosts the terminal — workspace grid, pizarra canvas, or the
  // workspace dock all render their xterm containers in separate subtrees, so a
  // single body-level flag is the only ancestor guaranteed to be common to all.
  // Idempotent across the pizarra + terminal instances of this component.
  // Also publishes the terminal glass tint as a CSS variable so globals.css can
  // dim the xterm layers without re-painting the wallpaper behind them.
  useIsomorphicLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.setAttribute('data-scenery-active', prefs.sceneryId ? 'true' : 'false');
    document.body.style.setProperty('--scenery-terminal-tint', resolveTerminalTintColor(prefs));
    // Terminals constructed before the flag flipped still paint an opaque
    // background into the WebGL/Canvas layer; push the scenery-aware theme so
    // the wallpaper shows through immediately instead of seconds later.
    syncSceneryThemeToLiveTerminals();
  }, [prefs.sceneryId, prefs.terminalTint]);

  const sceneryStyle = resolveSceneryStyle(prefs, scope);

  // When scenery is not active for this scope, render nothing.
  if (!sceneryStyle) return null;

  const overlayStyle = withOverlay ? resolveSceneryOverlayStyle(prefs) : null;

  return (
    <div
      data-testid={`scenery-background-${scope}`}
      data-scenery-id={prefs.customImageUrl ? 'custom' : prefs.sceneryId}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{
        zIndex,
        ...sceneryStyle,
        transition: 'background-color 0.6s ease, opacity 0.6s ease',
      }}
    >
      {overlayStyle && (
        <div data-testid="scenery-overlay" className="absolute inset-0" style={overlayStyle} />
      )}
    </div>
  );
}

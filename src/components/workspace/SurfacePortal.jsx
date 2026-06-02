/**
 * SurfacePortal — host stub for a `surfaceId`.
 *
 * Phase 4 of pizarra-shared-view-state. The provider owns a
 * hidden mount tree where the actual `TerminalTTY` (or
 * browser surface) lives. `SurfacePortal` is the host-side
 * stub: it registers its DOM ref as a portal target for the
 * surface, and the provider's `<SurfaceMount>` projects the
 * live surface into that target via `createPortal`.
 *
 * Two `SurfacePortal` instances (one in workspace-dock, one
 * in pizarra-canvas) can both target the same `surfaceId`.
 * The provider tracks the most-recently-registered target as
 * "active" — only ONE target renders the surface at a time.
 * This guarantees the surface's React subtree is mounted
 * exactly once, even though it is *visible* in either
 * workspace or pizarra chrome at a given moment.
 *
 * Mode toggle = host switch = the activeTargetBySurface
 * pointer moves. The hidden mount stays; the projection
 * just changes where it is rendered.
 *
 * The portal renders a placeholder div (a DOM target for the
 * portal to project into) when:
 *   - The surface is registered (the target exists)
 *
 * The portal renders nothing in the host (a 0-sized stub)
 * when the surface is NOT yet registered. This keeps the
 * host's layout stable.
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSurfaceRegistry } from './SharedSurfacesProvider';

/**
 * SurfacePortal — host stub. Use one per surface per mode.
 *
 * Props:
 *   surfaceId: the stable id of the surface to mirror
 *   hostId:    identifier for this host (e.g. 'workspace-dock',
 *              'pizarra-canvas'). Disambiguates multiple hosts.
 *   className/style: forwarded to the host's wrapping div.
 */
function SurfacePortal({ surfaceId, hostId, className, style, children }) {
  const registry = useSurfaceRegistry();
  const hostRef = useRef(null);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (!surfaceId || !hostId || !hostRef.current) return undefined;
    const unregister = registry.registerSurfaceTarget(surfaceId, hostId, hostRef.current);
    setRegistered(true);
    // Re-pull target on every notify tick so the active pointer
    // is reflected in our local state.
    const unsubscribe = registry.subscribe(() => {
      // Force re-render so the wrapper's data-active attribute
      // reflects the current state.
      setRegistered((prev) => prev);
    });
    return () => {
      unsubscribe();
      unregister();
    };
  }, [registry, surfaceId, hostId]);

  if (!surfaceId || !hostId) return null;
  return (
    <div
      ref={hostRef}
      data-testid={`surface-portal-host-${hostId}-${surfaceId}`}
      data-surface-id={surfaceId}
      data-host-id={hostId}
      data-registered={registered ? 'true' : 'false'}
      className={className}
      style={style}
    >
      {children}
    </div>
  );
}

export default SurfacePortal;

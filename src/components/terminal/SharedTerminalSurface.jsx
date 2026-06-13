'use client';

import React, { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import TerminalTTY from '@/components/TerminalTTY';
import SurfacePortal from '@/components/workspace/SurfacePortal';
import {
  useSurfaceContent,
  useSurfaceRegistry,
} from '@/components/workspace/SharedSurfacesProvider';
import { dispatchTerminalLayoutSettled } from '@/components/terminal/nativeLayoutSync';
import { isPizarraSharedViewEnabled } from '@/lib/pizarra/featureFlag';

/** Host id that owns live projection when pizarra mode is active. */
export const PIZARRA_SHARED_SURFACE_HOST = 'pizarra';

/** Host id that owns live projection when workspace mode is active. */
export const WORKSPACE_SHARED_SURFACE_HOST = 'workspace';

/**
 * Resolve effective layout visibility for a singleton TerminalTTY (A.2 prep).
 *
 * Portal-hidden surfaces (inactive host or no registered projection target) must
 * report isVisibleInLayout=false so TerminalTTY's shouldReleaseWebglRendererOnLayoutHide
 * path releases GPU atlases while the PTY keeps running.
 */
export function resolveSharedTerminalVisibility({
  pizarraOwnsLiveSurfaces = false,
  hostSurface,
  isVisibleInLayout = true,
  hasActiveProjection = true,
  preferredHostId = null,
} = {}) {
  if (!isVisibleInLayout) return false;
  if (!hasActiveProjection) return false;

  // Registry arbitration wins over stale surfaceHost / pizarraOwnsLiveSurfaces props.
  if (preferredHostId === 'workspace-dock' || preferredHostId === 'pizarra-canvas') {
    return true;
  }

  const activeHost = pizarraOwnsLiveSurfaces
    ? PIZARRA_SHARED_SURFACE_HOST
    : WORKSPACE_SHARED_SURFACE_HOST;

  if (hostSurface && hostSurface !== activeHost) {
    return false;
  }

  return true;
}

const propsBySurfaceId = new Map();
const propsListeners = new Set();
let propsVersion = 0;

function notifyPropsChanged() {
  propsVersion += 1;
  for (const listener of propsListeners) {
    listener();
  }
}

export function setSharedTerminalSurfaceProps(surfaceId, terminalProps) {
  if (!surfaceId || !terminalProps) return;
  propsBySurfaceId.set(surfaceId, terminalProps);
  notifyPropsChanged();
}

export function clearSharedTerminalSurfaceProps(surfaceId) {
  if (!surfaceId) return;
  if (propsBySurfaceId.delete(surfaceId)) {
    notifyPropsChanged();
  }
}

export function mergeSharedTerminalSurfaceProps(surfaceId, partial) {
  if (!surfaceId || !partial) return;
  const existing = propsBySurfaceId.get(surfaceId);
  if (!existing) return;
  propsBySurfaceId.set(surfaceId, { ...existing, ...partial });
  notifyPropsChanged();
}

function subscribeTerminalSurfaceProps(listener) {
  propsListeners.add(listener);
  return () => propsListeners.delete(listener);
}

function getTerminalSurfacePropsSnapshot(surfaceId) {
  return propsBySurfaceId.get(surfaceId) || null;
}

export function useSharedTerminalSurfacesEnabled() {
  const registry = useSurfaceRegistry();
  return isPizarraSharedViewEnabled() && Boolean(registry);
}

function TerminalSurfaceContent({ surfaceId }) {
  const registry = useSurfaceRegistry();
  const terminalProps = useSyncExternalStore(
    subscribeTerminalSurfaceProps,
    () => getTerminalSurfacePropsSnapshot(surfaceId),
    () => getTerminalSurfacePropsSnapshot(surfaceId)
  );
  // Re-render when portal targets change so projection visibility stays in sync.
  useSyncExternalStore(
    (listener) => registry?.subscribe(listener) ?? (() => {}),
    () => registry?.getVersion() ?? 0,
    () => registry?.getVersion() ?? 0
  );

  if (!terminalProps) return null;

  const hasActiveProjection = Boolean(registry?.getActiveTarget(surfaceId));
  const preferredHostId = registry?.getPreferredHostForSurface(surfaceId) ?? null;
  const isVisibleInLayout = resolveSharedTerminalVisibility({
    pizarraOwnsLiveSurfaces: terminalProps.pizarraOwnsLiveSurfaces,
    hostSurface: terminalProps.surfaceHost,
    isVisibleInLayout: terminalProps.isVisibleInLayout,
    hasActiveProjection,
    preferredHostId,
  });

  return (
    <TerminalTTY
      {...terminalProps}
      surfaceHost={terminalProps.surfaceHost}
      isVisibleInLayout={isVisibleInLayout}
    />
  );
}

function SharedTerminalSurfaceRegistrarInner({ surfaceId, terminalProps }) {
  // Push props to the external store AFTER commit (not during render) so React
  // never schedules a re-render of TerminalSurfaceContent while this component
  // is still rendering. useLayoutEffect keeps the sync synchronous relative to
  // the same paint tick, preserving the original "workspace props win before
  // pizarra merge effects run" guarantee without the setState-in-render warning.
  useLayoutEffect(() => {
    setSharedTerminalSurfaceProps(surfaceId, terminalProps);
  }, [surfaceId, terminalProps]);

  useEffect(() => {
    return () => clearSharedTerminalSurfaceProps(surfaceId);
  }, [surfaceId]);

  useSurfaceContent(surfaceId, () => <TerminalSurfaceContent surfaceId={surfaceId} />);
  return null;
}

/**
 * Registers a singleton TerminalTTY for `surfaceId` in SharedSurfacesProvider.
 * Props are refreshed every render via the props store.
 */
export function SharedTerminalSurfaceRegistrar({ surfaceId, terminalProps }) {
  const enabled = useSharedTerminalSurfacesEnabled();
  if (!enabled || !surfaceId || !terminalProps) return null;
  return (
    <SharedTerminalSurfaceRegistrarInner surfaceId={surfaceId} terminalProps={terminalProps} />
  );
}

/**
 * Host-side portal target. Workspace uses hostId `workspace-dock`; pizarra uses `pizarra-canvas`.
 * When `isActiveHost` is true, this host is registered as the preferred projection target.
 */
export function SharedTerminalSurfacePortal({
  surfaceId,
  hostId,
  className,
  style,
  children,
  isActiveHost = false,
}) {
  const enabled = useSharedTerminalSurfacesEnabled();
  const registry = useSurfaceRegistry();

  useLayoutEffect(() => {
    if (!enabled || !isActiveHost || !surfaceId || !hostId || !registry) return undefined;
    registry.setPreferredHostForSurface(surfaceId, hostId);
    dispatchTerminalLayoutSettled({
      reason: hostId === 'pizarra-canvas' ? 'pizarra-mode-enter' : 'pizarra-mode-exit',
      panelIds: [surfaceId],
    });
    const raf = requestAnimationFrame(() => {
      dispatchTerminalLayoutSettled({
        reason: hostId === 'pizarra-canvas' ? 'pizarra-mode-enter' : 'pizarra-mode-exit',
        panelIds: [surfaceId],
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      if (registry.getPreferredHostForSurface(surfaceId) === hostId) {
        registry.clearPreferredHostForSurface(surfaceId);
      }
    };
  }, [enabled, isActiveHost, surfaceId, hostId, registry]);

  if (!enabled || !surfaceId || !hostId) return null;
  return (
    <SurfacePortal surfaceId={surfaceId} hostId={hostId} className={className} style={style}>
      {children}
    </SurfacePortal>
  );
}

/** Test-only */
export function _resetSharedTerminalSurfacePropsForTests() {
  propsBySurfaceId.clear();
  propsVersion = 0;
}

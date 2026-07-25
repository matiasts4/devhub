'use client';

import TerminalTTY from '@/components/TerminalTTY';
import SurfacePortal from '@/components/workspace/SurfacePortal';
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import {
  useSurfaceContent,
  useSurfaceRegistry,
} from '@/components/workspace/SharedSurfacesProvider';
import { dispatchTerminalLayoutSettled } from '@/components/terminal/nativeLayoutSync';
import { isPizarraSharedViewEnabled } from '@/lib/pizarra/featureFlag';
import { markPizarraExitEnd, markPizarraExitStart } from '@/lib/terminal/startupPerfMarks';

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

/** Data fields that affect TerminalTTY render; callback refs are refreshed silently. */
const TERMINAL_SURFACE_DATA_KEYS = [
  'id',
  'cwd',
  'swarmContext',
  'hideTitleBar',
  'showQuickCopyButton',
  'autoFocus',
  'isActivePanel',
  'isVisibleInLayout',
  'visibleTerminalPanelCount',
  'initialCommand',
  'connectionState',
  'requestedRendererMode',
  'suspendNativeSurface',
  'nativeSurfacePolicy',
  'surfaceHost',
  'pizarraOwnsLiveSurfaces',
];

export function sharedTerminalSurfacePropsDataEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  for (const key of TERMINAL_SURFACE_DATA_KEYS) {
    const left = a[key];
    const right = b[key];
    if (left === right) continue;
    // ponytail: swarmContext is a plain object — compare by value, not reference
    if (key === 'swarmContext' && left != null && right != null) {
      try {
        if (JSON.stringify(left) === JSON.stringify(right)) continue;
      } catch {
        // fall through to !==
      }
    }
    return false;
  }
  return true;
}

function refreshTerminalSurfacePropsInPlace(existing, terminalProps) {
  Object.assign(existing, terminalProps);
}

export function hasSharedTerminalSurfaceProps(surfaceId) {
  return Boolean(surfaceId && propsBySurfaceId.has(surfaceId));
}

function notifyPropsChanged() {
  propsVersion += 1;
  for (const listener of propsListeners) {
    listener();
  }
}

export function setSharedTerminalSurfaceProps(surfaceId, terminalProps) {
  if (!surfaceId || !terminalProps) return;
  const existing = propsBySurfaceId.get(surfaceId);
  // ponytail: skip store notify when only handler refs changed — breaks update-depth loops
  if (existing && sharedTerminalSurfacePropsDataEqual(existing, terminalProps)) {
    refreshTerminalSurfacePropsInPlace(existing, terminalProps);
    return;
  }
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
  const merged = { ...existing, ...partial };
  if (sharedTerminalSurfacePropsDataEqual(existing, merged)) {
    refreshTerminalSurfacePropsInPlace(existing, partial);
    return;
  }
  propsBySurfaceId.set(surfaceId, merged);
  notifyPropsChanged();
}

function subscribeTerminalSurfaceProps(listener) {
  propsListeners.add(listener);
  return () => propsListeners.delete(listener);
}

function getTerminalSurfacePropsSnapshot(surfaceId) {
  return propsBySurfaceId.get(surfaceId) || null;
}

function isNonZeroTarget(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
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

  const hasActiveProjection = terminalProps ? Boolean(registry?.getActiveTarget(surfaceId)) : false;
  const prevProjectionRef = useRef(false);

  useEffect(() => {
    if (!terminalProps) return;
    const becameReady = hasActiveProjection && !prevProjectionRef.current;
    prevProjectionRef.current = hasActiveProjection;
    if (!becameReady) return;

    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;
    let timer = 0;

    const dispatchIfLive = (reason) => {
      if (cancelled || !propsBySurfaceId.has(surfaceId)) return;
      dispatchTerminalLayoutSettled({
        reason,
        panelIds: [surfaceId],
      });
    };

    const scheduleProjectionReadyDelay = () => {
      timer = window.setTimeout(() => {
        dispatchIfLive('shared-surface-projection-ready-delay');
      }, 180);
    };

    const targetEl = registry?.getActiveTarget(surfaceId);
    const hasNonZeroTarget = isNonZeroTarget(targetEl);

    dispatchIfLive('shared-surface-projection-ready');

    if (hasNonZeroTarget) {
      raf1 = requestAnimationFrame(() => {
        if (cancelled) return;
        dispatchIfLive('shared-surface-projection-ready-raf');
        scheduleProjectionReadyDelay();
      });
    } else {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          if (cancelled) return;
          dispatchIfLive('shared-surface-projection-ready-raf');
          scheduleProjectionReadyDelay();
        });
      });
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
    };
  }, [hasActiveProjection, registry, surfaceId]);

  if (!terminalProps) return null;

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
  const pizarraOwnsLiveSurfaces = Boolean(terminalProps?.pizarraOwnsLiveSurfaces);
  // Push props to the external store AFTER commit (not during render) so React
  // never schedules a re-render of TerminalSurfaceContent while this component
  // is still rendering. useLayoutEffect keeps the sync synchronous relative to
  // the same paint tick, preserving the original "workspace props win before
  // pizarra merge effects run" guarantee without the setState-in-render warning.
  //
  // In pizarra mode CanvasTerminal owns ongoing merges (visibility, suspend,
  // drag). Re-setting full props here every frame fought CanvasTerminal and
  // caused maximum update depth loops.
  useLayoutEffect(() => {
    if (pizarraOwnsLiveSurfaces) {
      if (!hasSharedTerminalSurfaceProps(surfaceId)) {
        setSharedTerminalSurfaceProps(surfaceId, terminalProps);
      }
      return;
    }
    setSharedTerminalSurfaceProps(surfaceId, terminalProps);
  }, [pizarraOwnsLiveSurfaces, surfaceId, terminalProps]);

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

    let mounted = true;
    let resizeObserver = null;

    const dispatchIfLive = (reason) => {
      if (!mounted || !propsBySurfaceId.has(surfaceId)) return;
      dispatchTerminalLayoutSettled({
        reason,
        panelIds: [surfaceId],
      });
    };

    // Pizarra-exit telemetry: mark only a real re-target FROM the pizarra host
    // back to the workspace dock (initial workspace-dock mounts are not exits).
    // The end mark fires on the post-paint settled dispatch inside the rAF below.
    const isPizarraExitRetarget =
      hostId !== 'pizarra-canvas' &&
      registry.getPreferredHostForSurface(surfaceId) === 'pizarra-canvas';
    if (isPizarraExitRetarget) markPizarraExitStart();

    registry.setPreferredHostForSurface(surfaceId, hostId);
    dispatchIfLive(hostId === 'pizarra-canvas' ? 'pizarra-mode-enter' : 'pizarra-mode-exit');

    const raf = requestAnimationFrame(() => {
      if (!mounted) return;
      dispatchIfLive(hostId === 'pizarra-canvas' ? 'pizarra-mode-enter' : 'pizarra-mode-exit');
      if (isPizarraExitRetarget) markPizarraExitEnd();

      const hostEl = registry.getActiveTarget(surfaceId);
      if (!hostEl || typeof ResizeObserver !== 'function') return;

      resizeObserver = new ResizeObserver((entries) => {
        if (!mounted || !propsBySurfaceId.has(surfaceId)) return;
        const rect = entries?.[0]?.contentRect;
        if (!rect || rect.width <= 1 || rect.height <= 1) return;
        dispatchTerminalLayoutSettled({
          reason: 'shared-surface-host-resize',
          panelIds: [surfaceId],
        });
      });
      resizeObserver.observe(hostEl);
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
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

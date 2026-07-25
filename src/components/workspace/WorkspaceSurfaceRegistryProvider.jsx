'use client';

import { LiveSurfaceRegistryContext } from '@/lib/pizarra/useLiveSurfaceRegistry';
import { SharedSurfaceRegistryProvider } from '@/lib/pizarra/useSharedSurfaceRegistry';
import { isPizarraSharedViewEnabled } from '@/lib/pizarra/featureFlag';

/**
 * TWM root bridge: exposes the legacy LiveSurfaceRegistryContext API
 * and, when shared-view is enabled, mounts SharedSurfaceRegistryProvider
 * so PizarraPane can publish via useSharedSurfaceRegistry().
 */
export function WorkspaceSurfaceRegistryProvider({
  projectId,
  workspaceId,
  registryValue,
  registryInstance = null,
  children,
}) {
  const inner = (
    <LiveSurfaceRegistryContext.Provider value={registryValue}>
      {children}
    </LiveSurfaceRegistryContext.Provider>
  );

  if (!isPizarraSharedViewEnabled()) return inner;

  return (
    <SharedSurfaceRegistryProvider
      projectId={projectId}
      workspaceId={workspaceId}
      registryInstance={registryInstance}
    >
      {inner}
    </SharedSurfaceRegistryProvider>
  );
}

export default WorkspaceSurfaceRegistryProvider;

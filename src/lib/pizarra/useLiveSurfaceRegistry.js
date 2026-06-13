import { createContext, useContext } from 'react';

export const LiveSurfaceRegistryContext = createContext(null);

/**
 * @deprecated Prefer `useWorkspaceSurfaceRegistry` (Phase B.2).
 * Re-export preserves backward compatibility for callers not yet migrated.
 */
export { useWorkspaceSurfaceRegistry as useLiveSurfaceRegistry } from './useWorkspaceSurfaceRegistry';

export function useLiveSurfaceRegistryContext() {
  const context = useContext(LiveSurfaceRegistryContext);
  if (!context) {
    throw new Error(
      'useLiveSurfaceRegistryContext must be used within a LiveSurfaceRegistryContext.Provider'
    );
  }
  return context;
}

export {
  createSharedSurfaceRegistry,
  useSharedSurfaceRegistry,
  SharedSurfaceRegistryProvider,
  surfaceWriteRejected,
} from './useSharedSurfaceRegistry';

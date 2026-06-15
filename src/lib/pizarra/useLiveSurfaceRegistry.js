import { createContext } from 'react';

export const LiveSurfaceRegistryContext = createContext(null);

/**
 * @deprecated Prefer `useWorkspaceSurfaceRegistry` (Phase B.2).
 * Re-export preserves backward compatibility for callers not yet migrated.
 */
export { useWorkspaceSurfaceRegistry as useLiveSurfaceRegistry } from './useWorkspaceSurfaceRegistry';

export {
  createSharedSurfaceRegistry,
  useSharedSurfaceRegistry,
  SharedSurfaceRegistryProvider,
  surfaceWriteRejected,
} from './useSharedSurfaceRegistry';

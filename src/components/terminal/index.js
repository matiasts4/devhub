// Public API gate for terminal workspace components.
// Import direction: utils → hooks → components → orchestrator

// Hooks
export { default as useRightDockController } from './hooks/useRightDockController';
export { default as useWorkspaceWindowsController } from './hooks/useWorkspaceWindowsController';
export { default as useSwarmLaunchController } from './hooks/useSwarmLaunchController';

// Components
export { default as WorkspaceWindowTabBar } from './components/WorkspaceWindowTabBar';
export { default as WorkspaceTerminalSurface } from './components/WorkspaceTerminalSurface';
export { default as SwarmLaunchEntryPoint } from './components/SwarmLaunchEntryPoint';

// Utils (selected — only what external callers may need)
export * from './utils/swarmRoleMeta';
export * from './utils/panelHelpers';

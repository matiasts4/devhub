@echo off
cd /d D:\devhub
git add src/components/workspace/WorkspaceRestoreCoordinator.js src/components/workspace/__tests__/WorkspaceRestoreCoordinator.test.js src/components/TerminalWorkspacesManager.jsx
git commit -m "refactor(terminal-decompose): workspace-restore-coordinator"
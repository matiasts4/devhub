@echo off
cd /d D:\devhub
git add src/components/terminal/hooks/useTerminalClipboard.js
git commit -m "refactor(terminal-decompose): use-terminal-clipboard"
git add src/components/terminal/hooks/useTerminalWheelRouter.js src/components/terminal/hooks/__tests__/useTerminalWheelRouter.test.js
git commit -m "refactor(terminal-decompose): use-terminal-wheel-router"
git add src/components/workspace/WorkspaceRestoreCoordinator.js src/components/workspace/__tests__/WorkspaceRestoreCoordinator.test.js src/components/TerminalWorkspacesManager.jsx
git commit -m "refactor(terminal-decompose): workspace-restore-coordinator"
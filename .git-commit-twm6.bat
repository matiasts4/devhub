@echo off
cd /d D:\devhub
git add src/components/terminal/hooks/useWorkspaceLayoutState.js src/components/terminal/hooks/__tests__/useWorkspaceLayoutState.test.js src/components/TerminalWorkspacesManager.jsx
git commit -m "refactor(terminal-decompose): workspace-layout-state-reducer"
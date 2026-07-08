@echo off
cd /d D:\devhub
git add src/components/terminal/hooks/useZedWorkspaceEvents.js src/components/terminal/hooks/__tests__/useZedWorkspaceEvents.test.js src/components/TerminalWorkspacesManager.jsx
git commit -m "refactor(terminal-decompose): use-zed-workspace-events"
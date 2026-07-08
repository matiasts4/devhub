@echo off
cd /d D:\devhub
git add src/components/terminal/hooks/useTerminalWorkspaceShortcuts.js src/components/terminal/hooks/__tests__/useTerminalWorkspaceShortcuts.test.js
git commit -m "refactor(terminal-decompose): use-terminal-workspace-shortcuts"
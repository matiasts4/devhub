@echo off
cd /d D:\devhub
git add src/components/terminal/hooks/useTerminalRendererController.js src/components/terminal/hooks/__tests__/useTerminalRendererController.test.js src/components/TerminalTTY.jsx
git commit -m "refactor(terminal-decompose): use-terminal-renderer-controller"
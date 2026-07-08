@echo off
cd /d D:\devhub
git add src/components/terminal/hooks/useTerminalViewportSync.js src/components/terminal/hooks/__tests__/useTerminalViewportSync.test.js src/components/TerminalTTY.jsx
git commit -m "refactor(terminal-decompose): use-terminal-viewport-sync"
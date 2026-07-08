@echo off
cd /d D:\devhub
git add src/components/terminal/hooks/useTerminalOutputQueue.js src/components/terminal/hooks/__tests__/useTerminalOutputQueue.test.js src/components/TerminalTTY.jsx
git commit -m "refactor(terminal-decompose): use-terminal-output-queue"
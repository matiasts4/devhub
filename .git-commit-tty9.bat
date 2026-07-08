@echo off
cd /d D:\devhub
git add src/components/terminal/hooks/useTerminalEngine.js src/components/terminal/hooks/__tests__/useTerminalEngine.test.js src/components/TerminalTTY.jsx scripts/patch-tty-9.mjs scripts/rebuild-tty-engine.mjs scripts/build-tty-engine.mjs
git commit -m "refactor(terminal-decompose): use-terminal-engine"
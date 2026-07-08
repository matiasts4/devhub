@echo off
cd /d D:\devhub
git add src/components/terminal/hooks/useTerminalV2Session.js src/components/terminal/hooks/__tests__/useTerminalV2Session.test.js src/components/TerminalTTY.jsx
git commit -m "refactor(terminal-decompose): use-terminal-v2-session"
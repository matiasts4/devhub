@echo off
cd /d D:\devhub
git reset HEAD
git add src/components/terminal/hooks/useTerminalClipboard.js
git commit -m "refactor(terminal-decompose): use-terminal-clipboard"
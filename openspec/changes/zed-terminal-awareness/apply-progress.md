# zed-terminal-awareness — apply progress

**Branch:** `feature/terminal-renderer-xterm-webgl`
**Last update:** 2026-06-11 (verification pass)

## Status summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 — Foundation (WU-1) | **DONE** | resolver, errors, ansi strip, WELCOME_LINE export |
| Phase 2 — Core tools (WU-2/3) | **DONE** | list/exec/summarize/open/close + displayName |
| Phase 3 — Policy + UX (WU-4) | **DEFERRED** | multiline caps T-3, T-201, T-202, useZedChat partial |
| Phase 4 — Prompt (WU-4) | **DONE** | Terminales nombradas section in zed-system-prompt.md |
| Phase 5 — E2E (WU-4) | **DEFERRED** | T-501 Playwright extensions |

## Tail completed (verification pass)

| Task | Status | Notes |
|------|--------|-------|
| T-list-fix | DONE | Skip tmux discovery under Jest (`JEST_WORKER_ID`) |
| T-301 | DONE | `useZedChat` uses `formatToolErrorForUser` in catch |
| T-401 | DONE | Spanish section: displayName, Levenshtein, 2-frase summarize |
| T-1.6 | DONE | `WELCOME_LINE` exported from `zedAnsiStrip.js` |

## Deferred

- T-3.1/T-3.2 — 64-line / 16KB caps
- T-201/T-202 — multiline + redirect policy
- T-501 — E2E extensions
- ZCX-002 welcome line wire into `DEFAULT_ZED_GREETING` (optional)

## Test command

```bash
npm test -- --testPathPattern='zedTerminalResolver|terminal.summarize|terminal.list|terminal.exec|useZedChat|zedSystemPrompt|zedAnsiStrip'
```

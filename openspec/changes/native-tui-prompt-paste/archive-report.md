# Archive report: native-tui-prompt-paste

## Status

Archived as completed slice 1 implementation (2026-07-17).

## Summary

Zed assistant agent opens now use clean interactive launch commands. Task text is carried as `bootstrap_input`, reserved on panel open, and after TUI readiness is pasted via the human Ctrl+V path (`formatTerminalPastePayload` + bracketed paste) with a separate Enter keystroke.

## Artifacts

- openspec/changes/native-tui-prompt-paste/\* (exploration, proposal, design, tasks, specs, apply-progress, verify-report)
- Engram topics: sdd/native-tui-prompt-paste/{explore,proposal,design,tasks}

## Follow-ups

- Manual smoke: “open grok and tell it X”
- Slice 2: native paste for `execute_in_terminal` on live sessions

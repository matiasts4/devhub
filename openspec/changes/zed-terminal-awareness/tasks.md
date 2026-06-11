# Tasks: zed-terminal-awareness

> Branch `feature/terminal-renderer-xterm-webgl`. Strict TDD. ZTT-001..005, ZCP-001/002, ZCX-001/002/003.

## A) Forecast

| Field | Value |
|---|---|
| Lines | ~620 (impl ~380 + tests ~240) |
| Largest commit | ~110 |
| 400-line risk | High |
| Chained PRs | Yes |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

## B) Work Units (chained, stacked-to-main)

| Unit | Goal | Tests |
|---|---|---|
| WU-1 | Resolver + error formatter | unit |
| WU-2 | `summarizeTerminal` + 2s cache | unit+int |
| WU-3 | `name` param + `displayName` fallback | unit+int |
| WU-4 | Multiline + prompt + E2E | unit+e2e |

## C) Phased Tasks

### Phase 1 — Foundation (→ WU-1)

- [x] **T-1.1** RED `__tests__/zedTerminalResolver.test.js`: exact, ci, Lev≤1, ambig, not_found, empty (ZTT-001).
- [x] **T-1.2** GREEN `zedTerminalResolver.js`: pure `resolveTerminalByName` + `nameFromId`.
- [x] **T-1.3** REFACTOR: extract `_levenshtein`.
- [x] **T-2.1** RED `__tests__/zedChat/errors.test.js`: each kind→Spanish, no `Error:` prefix, no stack (ZCX-001).
- [x] **T-2.2** GREEN `zedChat/errors.js`: `formatToolErrorForUser`.
- [x] **T-1.4** RED `__tests__/zedAnsiStrip.test.js`: CSI/OSC/SGL/CRLF/Buffer/null (ZTT-005 helper).
- [x] **T-1.5** GREEN `zedAnsiStrip.js`: local regex stripper, no `strip-ansi` dep.
- [x] **T-1.6** REFACTOR: co-located `WELCOME_LINE` export for Phase 4 reuse.
- [ ] **T-3.1** RED extend `zedCommandPolicy.test.js`: 64-line + 16,384-byte cap (ZCP-002).
- [ ] **T-3.2** GREEN `tools/terminal.js` execute rejects with Spanish err.

### Phase 2 — Core tools (→ WU-2 + WU-3)

- [ ] **T-101.1** RED `tools/terminal.list.test.js`: `displayName` fallback to `nameFromId` (ZTT-002).
- [ ] **T-101.2** GREEN `listTerminalsTool.execute` augments each entry.
- [ ] **T-102.1** RED `tools/terminal.summarize.test.js`: ANSI, 8KB, footer, `status:'unknown'`, not_found (ZTT-005).
- [ ] **T-102.2** GREEN `tools/summarizeTerminal.js`: local `stripAnsi`, footer heur, `Map` TTL 2000ms.
- [ ] **T-102.3** REFACTOR: extract `_buildDigest`.
- [ ] **T-103.1** RED `terminal.list.test.js`: `open_terminal({name:'Chase'})` full shape (ZTT-003/010).
- [ ] **T-103.2** GREEN `openTerminalTool` accepts `name`, resolves from pool.
- [ ] **T-104.1** RED `terminal.exec.test.js`: `name` resolves; both→Spanish err, no HTTP (ZTT-004).
- [ ] **T-104.2** GREEN execute/review/close accept `name XOR session_id`; mutex guard.
- [ ] **T-105.1** RED `chat/__tests__/route.summarize.test.js`: registry exposes oneOf (ZTT-005).
- [ ] **T-105.2** GREEN `chat/route.js` registers `summarizeTerminalTool`.

### Phase 3 — Policy + UX (→ WU-4)

- [ ] **T-201.1** RED `zedCommandPolicy.test.js`: multiline blocked-wins, heredoc skip (ZCP-001).
- [ ] **T-201.2** GREEN iterate `.split('\n')`; blocked-wins; heredoc skip.
- [ ] **T-202.1** RED: `echo '{"x":">"}'` allowed, bare `> /etc/x` blocked (ZCP-002).
- [ ] **T-202.2** GREEN pattern `/^\s*>\s*\S+$/i` no quote no `--`.
- [ ] **T-301.1** RED `__tests__/useZedChat.errors.test.js`: tool err through formatter (ZCX-001).
- [ ] **T-301.2** GREEN `useZedChat.js` catch imports formatter; welcome on first mount (ZCX-002).

### Phase 4 — Prompt + snapshot (→ WU-4)

- [ ] **T-401.1** RED extend `zedSystemPrompt.test.js`: section L137-139 has `displayName`, `Levenshtein`, `2 frases` (ZCX-002).
- [ ] **T-401.2** GREEN insert ≤8-line Spanish section in `docs/prompts/asistente/zed-system-prompt.md`.

### Phase 5 — E2E + finalize (→ WU-4)

- [ ] **T-501.1** Extend `06_zed_open_terminal.spec.ts`: name-resolve; only Chase moves.
- [ ] **T-501.2** Extend `07_zed_open_url.spec.ts`: pizarra regression; no `demaximize` (ZCX-003).
- [ ] **T-501.3** Update `02-agent-zed.md` final shape note.
- [ ] **T-501.4** Close T-012/T-013 in `zed-hardening/tasks.md`.

## Defer if tight

1. T-105 route test (~25).
2. T-501.4 (~5).
3. T-401.1 collapse (~10).

## TDD Discipline

Per task: RED→GREEN→REFACTOR→commit. `feat(zed): T-N.N`. `git diff --stat` ≤130.

Test: `npm test -- --testPathPattern='zedTerminalResolver|terminal.summarize|zedCommandPolicy|zedSystemPrompt'`.

# Design: zed-terminal-awareness

## Technical Approach

Bottom-up layering. (1) Pure `src/lib/asistente/zedTerminalResolver.js` (ZTT-001). (2) `tools/terminal.js`: `listTerminalsTool` gains `displayName` fallback (ZTT-002); `openTerminalTool` accepts `name` (ZTT-003); execute/review/close accept `name XOR session_id` (ZTT-004). New `summarizeTerminalTool` reuses `GET /api/terminal/session/[id]/capture` (ZTT-005). (3) `zedCommandPolicy.js`: multiline iteration + `>` strict-mode guard (ZCP-001/ZCP-002). (4) New `zedChat/errors.js` + `useZedChat` wiring (ZCX-001). (5) `docs/prompts/asistente/zed-system-prompt.md` gains `### Terminales nombradas` between lines 137 and 139, plus one-time welcome line (ZCX-002). (6) E2E lock for pizarra regression (ZCX-003). ANSI strip is a local ~5 LOC regex — no `strip-ansi` dep.

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Resolver location | New `zedTerminalResolver.js` (pure) | Reusable across 4 tools + summarize; pure = isolated tests; `terminal.js` already 307 LOC. |
| summarize data path | Reuse `GET /api/terminal/session/[id]/capture` | Zero new HTTP; existing route covers tty + sidecar. |
| 2s cache storage | Module `Map<terminalId, {ts, summary}>` | Per-process; session-restart resets; invisible = no eviction. |
| Multiline policy | `.split('\n').map(classifyLine).reduce(tier)`, blocked-wins, heredoc skipped | Tier merge + heredoc skip only; reuses single-line classifier. |
| `>` strict-mode guard | `/^\s*>\s*\S+$/i` AND no `'`/`"` AND no `--`; `'{"x": ">"}'` ALLOWED | Regex covers all ZCP-002 scenarios; full tokenizer out of scope. |
| Spanish error formatter | New `zedChat/errors.js` → `formatToolErrorForUser`; consumed by `useZedChat` | Pure module, no React, single import site. |
| Welcome line | One-time assistant msg, gated by no persisted message | Orchestrator decision 6: no UI banner. |
| Cache key | `terminalId` (never `name`) | Names can rename; ids stable per session. |

## Data Flow

**`summarize_terminal(name='Chase')`** — fully local; only the Anthropic tool_use round-trip carries the result back to the model. Flow: `resolve('Chase')` → `terminalId:'p2'`; `GET /api/terminal/session/p2/capture` → raw output; `stripAnsi` (local regex) → plain text; cache hit (2s)? return cached; else `detectOpencodeFooter` → `buildDigest` with `status: waiting|idle|running|unknown`; `cache.set('p2', {ts, summary})`. Model renders a 2-sentence Spanish digest.

**Name resolution (`name='Chasee'`):** `if both session_id && name` → Spanish error (no HTTP). `GET /api/terminal/processes` → processes[]. `resolve('Chasee')` → exact case-insensitive miss; `Lev('Chasee','Chase')=1` → `{ok, terminalId:'p2'}`; or `not_found`/`ambiguous` → Spanish error, no PUT. `guardZedTerminalCommand('ls', confirm, ctx)`. `PUT /api/terminal/session/p2/input` + immediate capture → `{ session_id:'p2', sent:true, recent_output:'…' }`.

## File Changes

| Path | Action |
|---|---|
| `src/lib/asistente/zedTerminalResolver.js` | Create |
| `src/lib/asistente/tools/summarizeTerminal.js` | Create (local `stripAnsi` regex, no `strip-ansi` dep; `detectOpencodeFooter`; module `Map` cache) |
| `src/lib/asistente/zedChat/errors.js` | Create |
| `src/lib/asistente/tools/terminal.js` | Modify (`displayName` fallback; `open_terminal` accepts `name`; execute/review/close accept `name XOR session_id`) |
| `src/lib/asistente/zedCommandPolicy.js` | Modify (`.split('\n')` iterate, blocked-wins, heredoc skip, `>` strict-mode guard, 64-line/16,384-byte cap) |
| `src/lib/asistente/useZedChat.js` | Modify (catch → formatter; initial-mount welcome line) |
| `src/app/api/assistant/chat/route.js` | Modify (register `summarizeTerminalTool`) |
| `docs/prompts/asistente/zed-system-prompt.md` | Modify (insert `### Terminales nombradas` between line 137 and 139; contains `displayName`, `Levenshtein`, `2 frases`) |
| `src/lib/asistente/__tests__/zedTerminalResolver.test.js` | Create |
| `src/lib/asistente/__tests__/tools/terminal.summarize.test.js` | Create |
| `src/lib/asistente/__tests__/tools/terminal.list.test.js` | Modify |
| `src/lib/asistente/__tests__/zedCommandPolicy.test.js` | Modify (multiline) |
| `src/lib/asistente/__tests__/zedChat/errors.test.js` | Create |
| `src/lib/asistente/__tests__/zedSystemPrompt.test.js` | Modify (region) |
| `src/app/api/assistant/chat/__tests__/route.summarize.test.js` | Create |
| `tests/e2e/06_zed_open_terminal.spec.ts` | Modify |
| `tests/e2e/07_zed_open_url.spec.ts` | Modify (ZCX-003 regression) |

**Totals: 6 new, 7 modified, 0 deleted.**

## Interfaces / Contracts

```ts
// zedTerminalResolver.js
type ResolverResult =
  | { ok: true; terminalId: string; displayName: string }
  | { ok: false; code: 'not_found' }
  | { ok: false; code: 'ambiguous';
      candidates: Array<{ terminalId: string; displayName: string }> };
resolveTerminalByName(name: unknown, processes: Array<{terminalId: string; displayName?: string}>): ResolverResult;
nameFromId(terminalId: string): string;

// summarizeTerminal.js — input_schema
properties: { name: {type:'string'}, terminalId: {type:'string'} }  // oneOf
output: { terminalId, displayName, program?, status, waitingFor?, suggestedActions?, tuiReady?, capturedAt }
// status: 'waiting_user_input'|'idle'|'running'|'unknown'
// cache: Map<terminalId, {ts:number, summary}>, TTL=2000ms

// zedChat/errors.js
type ErrorKind = 'not_found'|'ambiguous'|'unsafe_url'|'policy_blocked'|'script_too_long'|'unknown';
formatToolErrorForUser(toolName: string, errorObj: unknown): { message: string; kind: ErrorKind };
```

## Testing Strategy

| Layer | What | File |
|---|---|---|
| Unit | Resolver (exact, Lev≤1, ambiguous, not_found, empty) | `__tests__/zedTerminalResolver.test.js` |
| Unit | ANSI strip, 2s cache (fake timers) | `__tests__/tools/terminal.summarize.test.js` |
| Unit | Multiline (blocked-on-any, heredoc, cap, `>` in JSON, bare `>`) | `__tests__/zedCommandPolicy.test.js` |
| Unit | Error formatter (each code, stack + prefix) | `__tests__/zedChat/errors.test.js` |
| Integration | list fallback, `open_terminal({name})`, `execute_in_terminal({name})` | `__tests__/tools/terminal.list.test.js` |
| Integration | `summarize_terminal` happy + cache hit | `__tests__/tools/terminal.summarize.test.js` |
| Integration | Chat route registers `summarize_terminal` with oneOf | `app/api/assistant/chat/__tests__/route.summarize.test.js` |
| E2E | pizarra regression (ZCX-003); `open_terminal` returns `displayName` | extend `06_`, `07_` |
| Snapshot | Prompt section + `displayName`, `Levenshtein`, `2 frases` | `__tests__/zedSystemPrompt.test.js` |

E2E: extend `06`/`07` rather than create a new spec.

## Migration / Rollout

No migration. `displayName` is additive; new tool is additive. Agente 1 stub `{terminalId:'p1', displayName:'Chase'}` works via ZTT-002 fallback. Rollback: revert work-unit commits.

## Open Questions

None. All 10 orchestrator decisions are reflected. Spec coverage complete: ZTT-001..ZTT-005, ZCP-001/ZCP-002, ZCX-001/ZCX-002/ZCX-003.

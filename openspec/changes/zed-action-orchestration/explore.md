# zed-action-orchestration — exploration / baseline

**Date:** 2026-06-13  
**Environment:** Tauri dev (sidecar PTYs for visible panels)

## Failure taxonomy (pre-fix baseline)

| # | Scenario | Expected | Known failure layer |
|---|----------|----------|---------------------|
| 1 | "Abre terminal y ejecuta ls" | `open_terminal({ command: "ls" })` → panel + output | Model omits `command`; client dispatch race |
| 2 | "Abre OpenCode" | `open_terminal({ program: "opencode" })` | Model uses prose instead of tool |
| 3 | "Chase, ejecuta npm test" (panel exists) | `execute_in_terminal({ name: "Chase" })` | **Sidecar input gap** (capture ✓, input ✗) |
| 4 | "Abre github.com en pizarra" | `open_url` → browser card | Model skips tool; only first dispatch if multi |
| 5 | Same turn: open + execute on new panel | Chain in server loop | Registry stale mid-request; PTY 404 |
| 6 | Tier-3 command without confirm | Approval card / dry-run | UX requires typed "sí" — no inline approve |
| 7 | Multi open_terminal in one turn | All panels open | `useZedChat` `.find()` dispatches only first |
| 8 | "¿Qué hace Chase?" | `summarize_terminal` ≤2 frases | Works if name resolves |
| 9 | Panel limit (6) | Spanish error | Double gate server + client |
| 10 | Long multi-line script | Policy rejects >64 lines | Policy was first-line-only (pre Phase 6) |

## Instrumentation

- Server: `zedLog.toolCall` / `toolResult` + new `orchestration()` JSON events
- Client: `zedClientDebug()` when `localStorage devhub:zed-debug=1`

## Fix mapping

| Layer | Phase |
|-------|-------|
| Sidecar HTTP input | 1 |
| Multi-dispatch + registry sync | 2 |
| LLM loop + history | 3 |
| SSE streaming | 4 |
| Activity drawer + cards | 5 |
| Multiline policy + prompt | 6 |
| open_terminal pizarra focus | 7 |
| E2E regression | 8 |

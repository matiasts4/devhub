# Change: zed-terminal-awareness

> Phase: `sdd-propose`. Generated 2026-06-11 on branch `feature/terminal-renderer-xterm-webgl`.
> Agente 2 of 4. Depends on Agente 1's `displayName` contract on `/api/terminal/processes` and panel state.
> Artifact store: hybrid (openspec files + engram topic_key `sdd/zed-terminal-awareness/proposal`).

## Why

Asistente Zed (the chat workspace, **not** the ZED Orchestrator Pod swarm) today cannot address a specific terminal. The user has to know a `terminalId` like `p2` to call `execute_in_terminal`, and `list_terminals` returns raw `processes` without a human-friendly label. The pool of names (Chase, Nate, Cesar…) exists in shared context (`docs/delegation/00-shared-context.md:31`) but is invisible to Zed.

Three concrete pains justify this change now:

1. **Name-addressable terminals.** Users naturally say "Chase, ejecuta npm test". Without `displayName` resolution, the LLM has to guess terminalId or refuse. FR-Z01/Z02/Z03 make names first-class.
2. **Readable session digests.** When the user asks "qué está haciendo Chase", Zed has no tool that returns a structured summary — it can only dump `review_terminal_output` capture, which leaks ANSI escapes and raw scrollback. FR-Z05/Z06 fix this with a server-side `summarize_terminal` and a 2-sentence Spanish reply rule.
3. **Reliable pizarra surface.** `open_url` already routes to pizarra via `dispatchZedOpenUrlFromToolResults` (`zedOpenUrlEvent.js:103`) and the right-dock consumer at `TerminalWorkspacesManager.jsx:5510-5551`, but the `+400ms` / `+720ms` `pizarra:arrange-fit` timeouts and `demaximize`/session-loss edge cases need hardening (FR-Z07). `open_terminal` is currently UI-only and does not touch pizarra state.

The shared-context decision "Resumen sesión Zed = tool devuelve digest estructurado; LLM redacta máx 2 frases" (`00-shared-context.md:32`) is the contract this proposal implements.

## What changes

- **New tool** `summarize_terminal(terminalId|name) → digest` at `src/lib/asistente/tools/summarizeTerminal.js`. Captures output via `GET /api/terminal/session/[id]/capture`, strips ANSI locally (~5 LOC, no `strip-ansi` dep), applies OpenCode heuristics (footer prompt, `y/n` / `confirm` / `waiting` keywords), returns the contract shape from `02-agent-zed.md:42-54`. Registered in `buildRegistry()` at `src/app/api/assistant/chat/route.js:105-117`.
- **New helper** `resolveTerminalByName(name, processes)` at `src/lib/asistente/resolveTerminalByName.js`. Case-insensitive, then Levenshtein ≤ 2 fallback. Returns `{ ok: true, terminalId, displayName }` or `{ ok: false, code: 'not_found' | 'ambiguous', candidates: [{terminalId, displayName}] }`. Pure, no I/O.
- **`open_terminal` extended** to accept optional `name: string`. When omitted, the tool still fires the `devhub:zed-open-terminal` event for the next-mint `terminalId` and resolves its `displayName` via a follow-up `list_terminals` call inside the tool body (FR-Z03). Returns `{ terminalId, displayName, workspace, cwd, hint }` directly (FR-Z10, P2).
- **`execute_in_terminal`, `review_terminal_output`, `close_terminal` extended** to accept either `session_id` (legacy) or `name`. Mutually exclusive — schema `oneOf` + validator throws Spanish error if both set.
- **`list_terminals` enriched** to return `{ terminalId, displayName, program?, cwd?, tuiReady?, opencodeSessionId? }` per FR-Z02. Reads `displayName` from `processes[]` once Agente 1's contract lands; before that, the tool augments server-side via a `displayName: nameFromId(terminalId)` fallback so the LLM never sees `undefined`.
- **System prompt** gains a `### Terminales nombradas` section between `### 9. get_swarm_status` and `## ZED Orchestrator Pod` (`zed-system-prompt.md:137-139`). Codifies: (a) name resolution rules, (b) 2-sentence digest rule for `summarize_terminal`, (c) explicit "Asistente Zed ≠ ZED Orchestrator Pod" disambiguation (NFR-Z05).
- **Multiline policy** in `src/lib/asistente/zedCommandPolicy.js`: `normalizeZedTerminalCommand` and `classifyZedTerminalCommand` iterate every line. Tier = `blocked` if any line is `blocked`; `allowed` if all lines are `allowed`; `approval_required` otherwise. The user-facing `command` echo keeps the first line only (FR-Z09). Strict-mode guard: `>` redirect pattern only matches outside single-quoted args.
- **Error UX** at `src/lib/asistente/useZedChat.js:96-99`: drop literal `Error:` prefix; add Spanish error formatter `formatToolErrorForUser(toolName, errorObj)` that maps known error codes (`not_found`, `ambiguous`, `unsafe_url`, `policy_blocked`) to Spanish strings. Stack traces are stripped before render (FR-Z08).
- **Tests** added in `src/lib/asistente/__tests__/tools/terminal.list.test.js` (displayName), `terminal.summarize.test.js` (new), `zedCommandPolicy.test.js` (multiline cases), `tools/resolveTerminalByName.test.js` (new). E2E: extend `tests/e2e/06_zed_open_terminal.spec.ts` with a name-resolve case; extend `07_zed_open_url.spec.ts` with pizarra no-demaximize assertion; new spec `08_zed_summarize.spec.ts` for the Chase digest flow.
- **Pizarra hardening** (light touch): the existing `+400ms` / `+720ms` `pizarra:arrange-fit` timeouts in `TerminalWorkspacesManager.jsx:5546-5547` stay (Agente 3 owns the timing refactor); this change adds a regression assertion in the E2E that `maximized` remains `true` and terminal session state is not lost after `open_url` (FR-Z07).

## Scope

### In scope
- `src/lib/asistente/tools/terminal.js` — extend 4 tools, add `summarizeTerminalTool`.
- `src/lib/asistente/tools/summarizeTerminal.js` — new file.
- `src/lib/asistente/resolveTerminalByName.js` — new helper.
- `src/lib/asistente/zedCommandPolicy.js` — multiline normalization.
- `src/lib/asistente/useZedChat.js` — error formatter, drop `Error:` prefix.
- `src/lib/asistente/tools/registry.js` — no schema change needed (registry iterates `input_schema`).
- `src/app/api/assistant/chat/route.js` — register `summarize_terminal`.
- `docs/prompts/asistente/zed-system-prompt.md` — add `### Terminales nombradas` + disambiguation note.
- `src/components/asistente/**` — error message UI if formatter needs JSX glue.
- `src/lib/commandBar/surface/pizarraSurfaceController.js` — touch only if spawn reliability is found broken during implementation (otherwise no edit).
- Tests: `src/lib/asistente/__tests__/tools/terminal.list.test.js`, `tools/terminal.summarize.test.js` (new), `tools/resolveTerminalByName.test.js` (new), `zedCommandPolicy.test.js`.
- E2E: `tests/e2e/06_zed_open_terminal.spec.ts`, `07_zed_open_url.spec.ts`, new `08_zed_summarize.spec.ts`.

### Out of scope
- `src/components/TerminalTTY.jsx` mouse/TUI logic (Agente 1) — only consume `displayName` if already exposed on the panel object.
- `src/lib/agentLaunchWrapper.js`, swarm launch, `src/app/api/health/route.js` `launchSwarmLocal`.
- `src/lib/asistente/tools/delegation.js` — no re-registration of `delegate_to_opencode`.
- `launch_swarm` tool — do not create.
- `src/components/ZedAmbientOverlay.jsx` visuals (Agente 3).
- `src/app/globals.css` (Agente 4).
- Renaming the `Asistente Zed` UI label or product surface (separate concern, not in this change).
- Migrating existing `session_id`-only call sites in tests outside the four tools' test files.

## Product decisions (need human sign-off in propose round)

1. **Naming resolution algorithm**: case-insensitive exact → Levenshtein ≤ 2 fallback, else error. *Tradeoff*: stricter (exact only) is safer but rejects "chase" → "Chase" when the user types lowercase; fuzzy is friendly but could match "Chase" to "Chanel". Recommendation: case-insensitive + Levenshtein ≤ 2.
2. **Ambiguity policy**: if two terminals have the same lowercased name (rare with the ~30-name pool but possible after rename), return `ambiguous` with the `candidates` list rather than picking the most-recent. *Tradeoff*: most-recent is faster for the common "I just renamed it" case; explicit list is safer. Recommendation: explicit list, ask the user.
3. **`summarize_terminal` caching**: capture cost is local but the model may call it 2-3× per turn when probing state. Options: (a) no cache, re-capture each call; (b) 2s in-memory cache keyed by `terminalId`; (c) ETag-style "capturedAt" returned so the LLM can decide. Recommendation: (b) — 2s cache, invisible to the model, eliminates the 3x probe case.
4. **OpenCode detection scope**: heuristics in `summarize_terminal` only fire when `program` (from `list_terminals`) matches `opencode` *or* the capture contains a "Choose:" / "y/n" / "confirm" footer. *Tradeoff*: aggressive detection (always run heuristics) leaks wrong signals for non-OpenCode terminals; strict (only when program=opencode) misses ad-hoc cases. Recommendation: hybrid — run heuristics always, but mark `status: 'unknown'` when neither `program` nor the footer matches.
5. **Multiline payload limit**: cap `execute_in_terminal` payload at 64 lines × 256 chars (≈ 16KB) before policy evaluation. *Tradeoff*: no cap lets a malicious or accidentally large heredoc pass through; a 16KB cap covers 99% of real scripts. Reject with Spanish error above the cap.
6. **System prompt "Zed ≠ Pod" disambiguation**: surface inline in the prompt's identity section, not as a separate UI banner. *Tradeoff*: prompt-internal is invisible to the user until they ask about swarm; UI banner is more discoverable. Recommendation: prompt + one inline note in `useZedChat.js` welcome line.

## Risks

- **Agente 1 displayName contract drift** (HIGH). The field is not yet on `processes[]`. If Agente 1 ships `name` or `alias` instead, this change needs a second pass. *Mitigation*: stub `{ terminalId: 'p1', displayName: 'Chase' }` in tests; write integration test that runs after Agente 1's branch merges; resolver reads `process.displayName ?? process.name ?? null`.
- **Hardcoded `+400ms` / `+720ms` pizarra timing** (MEDIUM). If Agente 3 changes the pizarra transition duration, the arrange-fit fire-twice pattern desyncs and the pizarra card may render at the wrong size. *Mitigation*: keep the existing values (Agente 3 owns the refactor); add E2E assertion that `maximized: true` survives the transition.
- **`>` redirect false-positive in multiline classifier** (MEDIUM). `zedCommandPolicy.js:36-40` matches `>` anywhere in input; multiline JSON args (e.g. `echo '{"x": ">"}'`) would now evaluate on every line. *Mitigation*: strict-mode guard — only match `>` outside single-quoted regions.
- **`summarize_terminal` p95 latency** (MEDIUM). `getSessionOutput` does not cap output today (`terminal.js:203`); NFR-Z01 requires the tool to slice to 8KB itself. *Mitigation*: client-side cap in the tool before heuristics; if p95 still > 3s, fall back to a 4KB cap and document.
- **`tmux execSync` blocking** in `list_terminals` enrichment (LOW). 1200ms timeout on `execSync('tmux list-sessions …')` blocks the tool call. Already exists; this change does not add tmux calls but inherits the risk.
- **T-012 / T-013 test gaps** in `zed-hardening/tasks.md` (LOW). Still `[ ]`. Out of scope for this change, but a follow-up note should close the boxes to avoid future confusion.
- **LLM over-reliance on `summarize_terminal`** (LOW). The 2-sentence rule in the prompt is advisory; the model may still emit longer replies under ambiguous captures. *Mitigation*: add a hard cap (`max_tokens` in the system prompt's "After tool execution" guidance) plus a one-shot post-processor in `useZedChat` that truncates to 2 sentences when the trigger tool is `summarize_terminal`.

## Acceptance

- **UC-2** (Given/When/Then):
  - **Given** two terminals are open: `p1` = "Chase" running `opencode`, `p2` = "Nate" running `npm test`.
  - **When** user says "Chase, cambia el puerto a 3001".
  - **Then** `execute_in_terminal` is called with `name: "Chase"` (not `session_id`); the resolver picks `p1`; only Chase receives `lsof -ti:3000 | xargs kill -9 && PORT=3001 npm run dev`; Nate's scrollback is unchanged.

- **UC-3** (Given/When/Then):
  - **Given** Chase is paused at the OpenCode footer "Choose: [3] three PRs [5] five PRs [c] cancel".
  - **When** user asks "Zed, ¿qué está haciendo Chase?".
  - **Then** the model calls `summarize_terminal(name: "Chase")`; the tool returns `{ status: "waiting_user_input", waitingFor: "confirmation 3 vs 5 PRs", lastPrompt: "Choose: [3]…[5]…[c]…" }`; the assistant replies in Spanish, ≤ 2 sentences, no ANSI, e.g. "OpenCode en Chase espera tu confirmación para crear 3 o 5 PRs. Decime cuál preferís."

- **UC-Pizarra** (Given/When/Then):
  - **Given** pizarra mode is off, a `devhub` terminal is in focus.
  - **When** user says "Abre github.com en pizarra".
  - **Then** `open_url` fires; right-dock enters pizarra via `applyZedOpenUrlDockUpdate`; `browserLayoutEpoch` increments; `pizarra:arrange-fit` fires at +400ms and +720ms; the original terminal session is not closed; `maximized: true` persists; no `demaximize` event is emitted.

- **Negative: missing name**
  - **When** user says "Chase, ejecuta npm test" and no terminal is named Chase.
  - **Then** the tool returns `{ error: "not_found", message: "No encontré terminal 'Chase'. Activas: Nate, Cesar." }`; the model surfaces that Spanish message verbatim.

- **Negative: ambiguous name**
  - **When** two terminals are named "Chase" (after rename).
  - **Then** the tool returns `{ error: "ambiguous", candidates: [{terminalId, displayName}, ...] }`; the model asks the user to disambiguate.

## Non-goals

- Re-registration of swarm / `delegate_to_opencode` / `launch_swarm` (paused per `00-shared-context.md:13`).
- Visual overhaul of `ZedAmbientOverlay.jsx` (Agente 3 owns motion/aura).
- Global CSS changes (Agente 4).
- Rewriting terminal mouse/TUI logic in `TerminalTTY.jsx` (Agente 1).
- Renaming "Asistente Zed" → "Zed chat" or any product-surface copy change.
- Backwards-compat shim for legacy `session_id`-only call paths: the new `name` is *additional*, not replacement; old `session_id` users keep working.
- Multilingual responses: Spanish only for now (the project is es-AR; English replies remain acceptable for code identifiers in tool results, but user-facing copy is Spanish).

## Open questions for human

1. **Fuzzy match threshold**: should `resolveTerminalByName` accept Levenshtein ≤ 2 (forgiving) or require exact match post case-folding (strict)? *Why it matters*: shapes the error UX — strict gives clearer "no encontré" messages; forgiving is friendlier when the user forgets capitalization. *Options*: (a) exact only, (b) Levenshtein ≤ 1, (c) Levenshtein ≤ 2.
2. **`summarize_terminal` privacy boundary**: should the digest include the literal last user prompt from the terminal capture (e.g. "rm -rf node_modules"), or only a sanitized status enum? *Why it matters*: a TUI prompt may contain secrets (paths, tokens). *Options*: (a) full last prompt in `lastPrompt`, (b) redacted (truncate to first 60 chars + mask long tokens), (c) omit `lastPrompt` and infer `waitingFor` only.
3. **Confirmation message style for OpenCode digests**: should the assistant always propose a default action ("¿confirmo 3?") or stay neutral ("decime qué preferís")? *Why it matters*: the 2-sentence rule is a ceiling, not a style. *Options*: (a) neutral, (b) propose default, (c) configurable per-tool.
4. **Multiline payload cap visibility**: when the 64-line / 16KB cap is hit, do we surface the cap to the user (Spanish: "el script es demasiado largo, partilo en dos") or silently fail with a generic `policy_blocked`? *Why it matters*: user can fix the script if told why. *Options*: (a) explicit cap message, (b) generic `policy_blocked`, (c) ask-on-cap (model can re-prompt).
5. **Name pool collisions with the user's terminals**: if the user already has a terminal literally called "Chase" and the pool mint would also produce "Chase" for a new terminal, do we (a) skip "Chase" in the pool, (b) suffix with a number, (c) error? *Why it matters*: this is mostly Agente 1's territory but the resolver needs to handle whatever Agente 1 ships. *Options*: (a) pool skips collisions (Agente 1 design), (b) resolver treats `p1` and `p2` both named "Chase" as ambiguous, (c) suffix `Chase-2`.

## Test plan (TDD anchors)

- **Unit**:
  - `tools/resolveTerminalByName.test.js` — case-insensitive, exact match, Levenshtein fallback, missing, ambiguous, empty input, non-string input.
  - `tools/terminal.summarize.test.js` — strip ANSI (color codes, cursor moves, OSC), 8KB truncation, OpenCode footer detection ("Choose:" / "y/n" / "confirm"), non-OpenCode terminal returns `status: 'unknown'`, `capturedAt` ISO8601, missing terminal returns Spanish error.
  - `zedCommandPolicy.test.js` (extend) — multiline `&&`, heredoc, `;`-chained, all-allowed, mixed-allowed-and-blocked, single-quoted `>` is safe, unquoted `>` is blocked, 64-line cap rejects with Spanish error.
  - `useZedChat` error formatter test — `not_found` / `ambiguous` / `policy_blocked` / `unsafe_url` all map to Spanish, stack traces stripped.
- **Integration** (in `src/lib/asistente/__tests__/tools/terminal.list.test.js` and `terminal.exec.test.js`):
  - `list_terminals` returns `displayName` on each entry (stubbed until Agente 1 merges).
  - `open_terminal` accepts `name`, returns `{ terminalId, displayName }`.
  - `execute_in_terminal(name: "Chase")` resolves to the right `terminalId` and PUTs the correct session.
- **E2E**:
  - `06_zed_open_terminal.spec.ts` — extended with a name-resolve case ("abre terminal Chase" + "Chase, ejecuta npm test" → only Chase's scrollback changes).
  - `07_zed_open_url.spec.ts` — extended with pizarra no-demaximize assertion (`maximized: true` survives, terminal session id stable).
  - `08_zed_summarize.spec.ts` (new) — seed an OpenCode-style footer in a fixture, ask "qué está haciendo Chase", assert 2-sentence Spanish reply with no `\u001b[` substrings.
  - Negative: missing name + ambiguous name E2E (asserts the Spanish error appears in the chat transcript).

## Dependencies

- **Agente 1 `displayName` contract**: `processes[]` entries on `GET /api/terminal/processes` must expose `displayName`; panel state must expose the same field for terminal tab display. Stub `{ terminalId: 'p1', displayName: 'Chase' }` in tests until Agente 1 merges. Re-run `terminal.list.test.js` + the new digest integration test after the Agente 1 branch lands.
- **Agente 3 motion**: the `+400ms` / `+720ms` `pizarra:arrange-fit` timeouts in `TerminalWorkspacesManager.jsx:5546-5547` are coupled to the current pizarra transition duration. Flag the coupling in the implementation PR; do not change the values.
- **No new npm deps**: the ANSI strip is local (~5 LOC); the policy regex tightening is local.

## References

- `openspec/changes/zed-terminal-awareness/exploration.md` — prior phase output (195 lines, dense).
- `docs/delegation/02-agent-zed.md` — Agente 2 mission brief (180 lines, includes FR-Z01..Z10 + NFR-Z01..Z05 + digest contract).
- `docs/delegation/00-shared-context.md` — decisions table (line 31: pool automático, line 32: digest ≤ 2 frases, line 35: swarm en pausa).
- `src/lib/asistente/tools/terminal.js` — 306 lines, 4 tools to extend.
- `src/lib/asistente/zedCommandPolicy.js` — 207 lines, multiline chokepoint at `normalizeZedTerminalCommand:118-124`.
- `docs/prompts/asistente/zed-system-prompt.md` — 160 lines, insert point at line 137-139.
- `src/components/zedOpenUrlEvent.js:103` — `dispatchZedOpenUrlFromToolResults`.
- `src/components/workspace/rightDockLayout.js:79-99,109` — `applyZedOpenUrlDockFocus` / `applyZedOpenUrlDockUpdate`.
- `src/components/TerminalWorkspacesManager.jsx:5510-5551` — pizarra consumer with hardcoded timeouts.
- Engram obs #6861 — `sdd/zed-terminal-awareness/explore` (prior phase memory).

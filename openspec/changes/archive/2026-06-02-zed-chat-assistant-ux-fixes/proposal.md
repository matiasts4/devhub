# Proposal: Zed Chat Assistant UX Fixes

> Branch: `feature/session-workspace-restore`. Strict TDD. Single PR, 4 chained commits.
> Source: `openspec/changes/zed-chat-assistant-ux-fixes/exploration.md` (650 lines, verified).
> Out of scope: `openspec/changes/native-command-executor-assistant/` (CommandBar) — verified orthogonal, separate change.

## Intent

The Zed chat assistant opens terminals that the user cannot see and forgets what was just said. The backend works (log: `session_id: term-1780430078056-v57np` returned, tool loop runs, system prompt covers all 10 tools), but three independent client-side bugs break the user-facing loop: (1) the `devhub:zed-open-terminal` listener creates a new panel in workspace state but never focuses it (pizarra-maximized, focused-panel, or window-mismatch scenarios leave the new panel hidden), and the dispatch `useEffect` re-fires on every `messages` change so a column of empty terminals piles up; (2) `ChatPanel.handleSend` builds the history from the **closure** value of `messages`, so the previous assistant turn and its `tool_results` (including the `session_id`) are dropped — the model literally forgets it just opened a terminal and re-opens a new one next turn; (3) `open_url` shells out to `xdg-open` with no in-app event, so the user gets alt-tabbed to the system browser instead of the right-dock browser pane. This change fixes the three breaks with a tight TDD-locked implementation in 4 slices within the 800-line review budget, leaving the model loop, prompt, and backend untouched.

## Scope

### In Scope

- **Visibility**: `handleZedOpenTerminal` calls `activateWorkspacePanel`, clears `focusedPanelByWorkspace`, and (opt-in via `detail.focus`) de-maximizes pizarra. New helper extracted as a pure function for testability.
- **Re-fire guard**: `ChatPanel` adds `dispatchedSessionIdsRef` (a `useRef` of dispatched `session_id`s) so the dispatch `useEffect` only fires once per `session_id`.
- **Memory**: `ChatPanel.handleSend` drops the closure-stale `.slice(0, -1)` and passes the full `messages` state to `buildZedHistory`. Server `safeHistory` filter already validates + caps at 20. A small system-prompt clause is added to make the model robust to seeing prior `tool_results` flattened as user-role messages.
- **`open_url` parity**: `browserTool.execute` dispatches `new CustomEvent('devhub:zed-open-url', { detail: { url, label, focus } })`. New listener in `WorkspaceBrowserPane` navigates the in-app browser pane + de-maximizes pizarra. Keeps `xdg-open` as a fallback. Listener is idempotent (same URL twice = no-op).
- **Tests**: unit (parser, history, browser tool, listener helper, event validators), component (ChatPanel 2-turn re-fire, ChatPanel 2-turn memory body, WorkspaceBrowserPane URL navigation), E2E-with-stubs (no Tauri runtime). No live Tauri required.

### Out of Scope

- Voice/TTS read-aloud for assistant replies.
- CommandBar (`openspec/changes/native-command-executor-assistant/`) — separate change.
- Re-architecting the model loop, tool loop, or `route.js` per-turn seed.
- Changing the LLM model id, provider, or `MINIMAX_API_KEY` plumbing.
- Director General mission system and `swarm-director` seams.
- In-app browser as the **default** for `open_url` (system browser remains the fallback; in-app is now also wired).
- Native VTE renderer for terminals.

## Capabilities

### Modified Capabilities

- `asistente-ui` (delta spec): the `devhub:zed-open-terminal` listener must (a) call `activateWorkspacePanel(targetWsId, newPanelId)` after `handleSplit`, (b) clear or update `focusedPanelByWorkspace` for the new panel, (c) opt-in de-maximize pizarra via `detail.focus === true`. The `ChatPanel` dispatch `useEffect` must guard on a `useRef` of dispatched `session_id`s so it fires once per `session_id`.
- `asistente-chat` (delta spec): `handleSend` MUST send the full `messages` state as `history` (no closure-stale slice). The system prompt MUST include a one-line clause telling the model that `tool_results` from previous turns appear in history as user-role lines and the model MUST use them instead of re-issuing the same tool call.
- `board-browser-pane` (delta spec): add a `useEffect` listener for `devhub:zed-open-url` that calls `commitBrowserNavigation(url)` (or equivalent `onBrowserWindowStateChange`) and updates the right-dock state. Listener MUST be idempotent on repeated identical `url + label` dispatches.

### New Capabilities

- `zed-event-bus` (new spec): the contract surface for `devhub:zed-*` CustomEvents on `window`. Each event has a typed detail object, a validator helper in `src/components/zedOpenXxxEvent.js`, and a named handler in TWM or the corresponding consumer. New event `devhub:zed-open-url` joins `devhub:zed-open-terminal` under this namespace. Mirrors the existing `zedOpenTerminalEvent.js` pattern.

## Approach

### Bug 1 — visibility (TWM listener + ChatPanel re-fire)

- **File / symbol**: `src/components/TerminalWorkspacesManager.jsx:3715` (`handleZedOpenTerminal`) and `src/components/asistente/ChatPanel.jsx:167` (dispatch `useEffect`).
- **Contract change**: event `detail` gains an optional `focus: boolean` (default `false`). Listener reads it; only de-maximizes pizarra when `detail.focus === true` AND `maximizedView === 'pizarra'`.
- **Listener change**: after `handleSplit(...)` returns `newPanelId`, call `activateWorkspacePanel(targetWsId, newPanelId)` and `setFocusedPanelByWorkspace(prev => ({ ...prev, [targetWsId]: newPanelId }))`. Both helpers already exist in TWM (lines 2002-2029, 1032).
- **Re-fire guard**: `ChatPanel` adds `const dispatchedSessionIdsRef = useRef(new Set())`. The dispatch `useEffect` checks `dispatchedSessionIdsRef.current.has(parsed.session_id)`; if so, return. After successful dispatch, `dispatchedSessionIdsRef.current.add(parsed.session_id)`.
- **Helper extraction**: extract the post-`handleSplit` actions into a pure `applyZedOpenTerminalFocus(targetWsId, newPanelId, detail, deps)` in a new `src/components/asistente/zedOpenTerminalFocus.js` (next to `zedOpenTerminalEvent.js`). Pure function — takes `(targetWsId, newPanelId, detail, { activateWorkspacePanel, setFocusedPanelByWorkspace, updateRightDockState, maximizedView })`, returns `{ activated: boolean, focused: boolean, demaximized: boolean }`. Unit-testable.
- **Behavior change**: when the user is in pizarra with `detail.focus = true`, pizarra de-maximizes and the new terminal is the visible focused panel. When `detail.focus = false` (default), only the active panel changes; pizarra is untouched.
- **Verification**: unit test on `applyZedOpenTerminalFocus` with stubbed deps covers all 3 modes (pizarra-maximized, focused-on-different, default). E2E seeds `localStorage.devhub_terminal_state:*` with a known `activePanelIds`, asserts the new panel id is in `activePanelIds` after the chat turn completes.

### Bug 2 — memory closure (ChatPanel.handleSend)

- **File / symbol**: `src/components/asistente/ChatPanel.jsx:78-82` (`buildZedHistory(messages.slice(0, -1))`).
- **Contract change**: the server-side `safeHistory` filter (`route.js:136-146`) and `[...safeHistory, {user, message}]` concatenation (`route.js:172`) are already correct. The client now passes the full `messages` state as `history`. The server tolerates a duplicate of the previous-turn user message (it's the prior turn, not the current one).
- **Client change**: drop `.slice(0, -1)`. The closure `messages` is the right reference; the `setMessages` call enqueues a new state but `messages` itself is the previous render's value, which is what we want to send as history (the new user message is sent as `message`, not as part of `history`).
- **System-prompt nudge**: append a 2-line clause to `docs/prompts/asistente/zed-system-prompt.md` under the "After tool execution" section: "When prior tool results appear in the conversation as user-role lines, treat them as authoritative state from the previous turn. Do not re-issue the same tool call if the previous turn already returned a successful result."
- **Behavior change**: on the 2nd turn, the model sees the previous assistant turn and its `Tool open_terminal result: {"session_id":"term-…",…}` line. It can `execute_in_terminal` against the same `session_id` instead of `open_terminal`-ing a fresh one.
- **Verification**: component test sends turn 1 (gets assistant with `open_terminal` tool_result), then turn 2; captures the 2nd `fetch` body; asserts it contains the string `Tool open_terminal result:` and does NOT contain the new user message twice.

### Bug 3 — open_url parity (browser tool + WorkspaceBrowserPane)

- **File / symbol**: `src/lib/asistente/tools/browser.js` (`execute`) and `src/components/workspace/WorkspaceBrowserPane.jsx` (new `useEffect`).
- **Contract change**: new event `new CustomEvent('devhub:zed-open-url', { detail: { url, label, focus } })`. Same `focus` semantics as Bug 1. New validator helper in `src/components/zedOpenUrlEvent.js` (mirrors `zedOpenTerminalEvent.js`): `isValidZedOpenUrlEvent(detail)`, `resolveZedOpenUrlDetail(detail)`.
- **Tool change**: after `isSafeHttpUrl` check, dispatch the event on `window` (if `typeof window !== 'undefined'` — SSR-safe). Keep the `execSync('xdg-open …')` call as a fallback. Return shape unchanged: `{ url, opened: true, message }`.
- **Consumer change**: `WorkspaceBrowserPane` adds a `useEffect` that subscribes to `devhub:zed-open-url` and calls `commitBrowserNavigation(detail.url)` (or the equivalent `onBrowserWindowStateChange` prop wired by TWM). When `detail.focus === true` AND `maximizedView === 'pizarra'`, also call `updateRightDockState(prev => ({ ...prev, maximized: false, maximizedView: 'browser', activeTab: 'browser' }))`. Idempotence: track last-applied `(url, label)` in a `useRef`; bail if same pair.
- **Behavior change**: when the user asks "open https://github.com/foo/bar", the in-app browser pane navigates to the URL and becomes visible. The system browser is also opened as a fallback (existing behavior preserved).
- **Verification**: unit test on `browserTool.execute` asserts `window.dispatchEvent` was called with a `devhub:zed-open-url` event whose `detail.url` matches input. Component test on `WorkspaceBrowserPane` dispatches the event, asserts `commitBrowserNavigation` was called once with the same URL and not re-called for a second identical dispatch.

## Affected Areas

| Area                                                               | Impact            | Description                                                                                                                                                         |
| ------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/TerminalWorkspacesManager.jsx`                     | Modified          | `handleZedOpenTerminal` (line 3715) calls `activateWorkspacePanel` + `setFocusedPanelByWorkspace` + opt-in de-maximize. New `applyZedOpenTerminalFocus` invocation. |
| `src/components/asistente/ChatPanel.jsx`                           | Modified          | `dispatchedSessionIdsRef` added; dispatch `useEffect` (line 167) guarded. `handleSend` (line 78) drops `.slice(0, -1)`.                                             |
| `src/components/asistente/zedOpenTerminalFocus.js`                 | New               | Pure helper extracted for testability (mirrors `zedOpenTerminalEvent.js` pattern).                                                                                  |
| `src/components/zedOpenUrlEvent.js`                                | New               | Validators + resolvers for `devhub:zed-open-url` (mirrors `zedOpenTerminalEvent.js`).                                                                               |
| `src/lib/asistente/tools/browser.js`                               | Modified          | Dispatches `devhub:zed-open-url` on `window` after URL safety check; keeps `xdg-open` fallback.                                                                     |
| `src/components/workspace/WorkspaceBrowserPane.jsx`                | Modified          | New `useEffect` listens for `devhub:zed-open-url`, calls `commitBrowserNavigation`, idempotent on `(url, label)`.                                                   |
| `docs/prompts/asistente/zed-system-prompt.md`                      | Modified          | Append 2-line clause on prior `tool_results` as user-role authoritative state.                                                                                      |
| `openspec/changes/zed-chat-assistant-ux-fixes/specs/`              | New               | Delta specs for `asistente-ui`, `asistente-chat`, `board-browser-pane`, full spec for `zed-event-bus`.                                                              |
| `src/components/asistente/__tests__/ChatPanel.test.jsx`            | Modified          | Adds 2-turn re-fire test and 2-turn memory body test.                                                                                                               |
| `src/components/asistente/__tests__/buildZedHistory.test.js`       | Modified          | Integration scenario: 2-turn input, assert previous assistant turn + `Tool open_terminal result:` line in output.                                                   |
| `src/lib/asistente/__tests__/tools/browser.test.js`                | Modified          | Asserts `devhub:zed-open-url` CustomEvent dispatched.                                                                                                               |
| `src/components/__tests__/zedOpenUrlEvent.test.js`                 | New               | Unit tests for new validators.                                                                                                                                      |
| `src/components/asistente/__tests__/zedOpenTerminalFocus.test.js`  | New               | Unit tests for the extracted pure helper.                                                                                                                           |
| `src/components/workspace/__tests__/WorkspaceBrowserPane.test.jsx` | New (or extended) | Component test for `devhub:zed-open-url` listener + idempotence.                                                                                                    |
| `tests/e2e/06_zed_open_terminal.spec.ts`                           | Modified          | Adds visibility assertion (`activePanelIds` after turn) and re-fire guard assertion (2 messages → 1 event).                                                         |
| `tests/e2e/07_zed_open_url.spec.ts`                                | New               | Mirrors `06_zed_open_terminal.spec.ts` for the new event.                                                                                                           |

## Risks / Open Questions

| #   | Risk / Question                                                                                                                                                                       | Likelihood | Mitigation                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | De-maximizing pizarra on every dispatch could surprise a user who is in pizarra deliberately.                                                                                         |     Medium | Opt-in via `detail.focus === true`. Default `false`; only the dispatch site that explicitly wants to steal focus sets it.                                                                                                         |
| 2   | Stealing focus mid-typing (user is typing a follow-up in the textarea when a previous-turn listener fires).                                                                           |     Medium | Re-fire guard (Bug 1 fix) ensures the listener fires once per `session_id`; the textarea focus is in `zed` right-dock and is unaffected by the workspace focus change.                                                            |
| 3   | `useEffect` re-fire guard must ship WITH the listener fix, not in a separate PR.                                                                                                      |       High | Slice 1 ships both atomically; chained-commit, single PR, single squash.                                                                                                                                                          |
| 4   | The closure fix surfaces `tool_results` flattened as user-role messages in conversation history. Pre-existing behavior; `route.js:280-285` already does this. Model may need a nudge. | Low-Medium | Add the 2-line system-prompt clause; smoke test live before merge.                                                                                                                                                                |
| 5   | `WorkspaceBrowserPane` listener must be idempotent — repeated URL dispatches must not re-create the browser or scroll.                                                                |     Medium | `useRef` of last-applied `(url, label)`; bail on identical pair. Component test covers repeated dispatches.                                                                                                                       |
| 6   | `handleSplit` returns `newPanelId` from a `useState` callback. Calling `activateWorkspacePanel` immediately afterward may batch into the same render.                                 |        Low | `activateWorkspacePanel` is the existing pattern (TWM:2002-2029) and works in the same tick for other call sites. No new state shape.                                                                                             |
| 7   | The 4-slice budget could be exceeded by tests (`+250 LOC` estimated).                                                                                                                 |        Low | Each test is small and focused. If slice 4 (E2E) is over budget, defer to follow-up.                                                                                                                                              |
| 8   | The Tauri `__TAURI_INTERNALS__` import paths in TWM may throw in E2E.                                                                                                                 |        Low | They are already wrapped in `try { const { … } = await import('@tauri-apps/api/window'); } catch { return null; }`. Playwright chromium has no `__TAURI_INTERNALS__`; the catch path runs and the E2E exercises the no-op branch. |
| 9   | The new `devhub:zed-open-url` event collides with future events.                                                                                                                      |        Low | Namespaced under `devhub:zed-*` like the existing `devhub:zed-open-terminal`. New spec `zed-event-bus` documents the namespace.                                                                                                   |

## Rough Phasing (4 chained commits, single PR, ~315 net LOC)

| Slice                              | Files                                                                                                                                                                                                                                                | Impl LOC | Test LOC |      Net |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | -------: | -------: |
| **1 — Visibility + re-fire guard** | `TerminalWorkspacesManager.jsx` (listener + extracted helper), `ChatPanel.jsx` (re-fire ref), `zedOpenTerminalFocus.js` (new), `zedOpenTerminalFocus.test.js` (new), `ChatPanel.test.jsx` (extend)                                                   |      ~30 |      ~80 |     +110 |
| **2 — Memory + system prompt**     | `ChatPanel.jsx` (drop slice), `zed-system-prompt.md` (2-line clause), `ChatPanel.test.jsx` (2-turn memory test), `buildZedHistory.test.js` (integration scenario)                                                                                    |       ~5 |      ~50 |      +55 |
| **3 — `open_url` parity**          | `browser.js` (event dispatch + xdg-open fallback), `WorkspaceBrowserPane.jsx` (listener + idempotence ref), `zedOpenUrlEvent.js` (new), `zedOpenUrlEvent.test.js` (new), `browser.test.js` (extend), `WorkspaceBrowserPane.test.jsx` (new or extend) |      ~25 |      ~40 |      +65 |
| **4 — E2E with stubs**             | `tests/e2e/06_zed_open_terminal.spec.ts` (visibility + re-fire assertions), `tests/e2e/07_zed_open_url.spec.ts` (new, mirrors 06)                                                                                                                    |       ~5 |      ~80 |      +85 |
| **Total**                          |                                                                                                                                                                                                                                                      |  **~65** | **~250** | **+315** |

**Budget check**: 315 net < 800 cap (D2). Per the sdd-tasks guard, 400-line budget risk: **Low**.

## Rollback Plan

1. **Revert single squash-merge commit** on `feature/session-workspace-restore`. Each slice is a single commit, so a partial revert is possible: `git revert <slice-1-sha>` for visibility-only rollback, etc.
2. **No data migrations, no env var additions, no new dependencies.** The change is pure client-side wiring + a 2-line prompt clause. The new helper files (`zedOpenTerminalFocus.js`, `zedOpenUrlEvent.js`) are additive imports.
3. **The `devhub:zed-open-url` event is additive**: if the listener is removed from `WorkspaceBrowserPane`, the event simply has no consumer; `browser.js` still falls back to `xdg-open`. No caller breaks.
4. **The closure fix is a 1-line change** (`messages.slice(0, -1)` → `messages`). If it surfaces a pre-existing model confusion, reverting restores the old behavior; user reports "no memory" symptom returns.
5. **The re-fire guard** can be disabled by removing the `dispatchedSessionIdsRef` check; listener fires on every `messages` change (old behavior).
6. **Smoke verification after any slice**: send a chat turn containing `open_terminal` and `open_url`; assert the new panel is visible and the browser pane navigates.

## Success Criteria

### User-observable outcomes

- [ ] User asks "open a terminal and run ls" → new panel appears visibly (workspace focus, pizarra de-maximized only when `detail.focus === true`).
- [ ] User asks "now run ls again" → the model uses the previous `session_id` (verified in the request body sent to `/api/assistant/chat`); no second terminal opens.
- [ ] User asks "open https://github.com/foo/bar" → right-dock browser pane navigates to the URL AND the system browser also opens (xdg-open fallback).
- [ ] Pizarra is **not** de-maximized when the dispatch event lacks `detail.focus`.
- [ ] Sending a 2nd, 3rd, 4th message after the first `open_terminal` does NOT create additional empty terminal panels.
- [ ] Repeated identical `open_url` dispatches do NOT re-create or scroll the browser pane (idempotent listener).

### Test outcomes

- [ ] `npm test` runs all new + existing suites green.
- [ ] New unit tests: `zedOpenTerminalFocus.test.js` (≥3 cases), `zedOpenUrlEvent.test.js` (≥2 cases).
- [ ] Extended component tests: `ChatPanel.test.jsx` covers (a) re-fire guard (2 messages → 1 event), (b) memory body (2nd-turn body contains `Tool open_terminal result:` and not duplicate new user message).
- [ ] Extended `buildZedHistory.test.js` covers 2-turn integration scenario.
- [ ] Extended `browser.test.js` asserts `devhub:zed-open-url` event dispatched.
- [ ] E2E `06_zed_open_terminal.spec.ts` asserts `activePanelIds` in `localStorage.devhub_terminal_state:*` after a chat turn AND that a 2nd message does not re-dispatch.
- [ ] E2E `07_zed_open_url.spec.ts` asserts `commitBrowserNavigation` called once on a dispatch, not re-called on a second identical dispatch.

### Spec / docs outcomes

- [ ] `openspec/changes/zed-chat-assistant-ux-fixes/specs/asistente-ui/spec.md` (delta) covers the listener focus chain + re-fire guard.
- [ ] `openspec/changes/zed-chat-assistant-ux-fixes/specs/asistente-chat/spec.md` (delta) covers the history contract and the new system-prompt clause.
- [ ] `openspec/changes/zed-chat-assistant-ux-fixes/specs/board-browser-pane/spec.md` (delta) covers the `devhub:zed-open-url` listener + idempotence.
- [ ] `openspec/changes/zed-chat-assistant-ux-fixes/specs/zed-event-bus/spec.md` (new) covers the `devhub:zed-*` event namespace, validator patterns, and SSR-safety.

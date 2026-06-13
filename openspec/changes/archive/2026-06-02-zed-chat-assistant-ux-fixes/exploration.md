# Exploration: zed-chat-assistant-ux-fixes

> Status: read-only investigation. No source code modified.
> Branch: `feature/session-workspace-restore`. Strict TDD active.
> Scope: the Zed chat assistant (UI = `src/components/asistente/ChatPanel.jsx`,
> route = `src/app/api/assistant/chat/route.js`, listener =
> `src/components/TerminalWorkspacesManager.jsx:3685-3700`, dispatch helper =
> `src/components/zedOpenTerminalEvent.js`). Out of scope:
> `openspec/changes/native-command-executor-assistant/` (CommandBar — orthogonal,
> different UI, verified PASS, do NOT touch).

## Executive summary

Three independent bugs are visible in the production path. (1) The listener
`handleZedOpenTerminal` in `TerminalWorkspacesManager.jsx` correctly creates a
new terminal panel and sets it active, but it never de-maximizes pizarra, never
calls `activateWorkspacePanel` (which also updates the active window's
`activePanelId`), and never scrolls into view — so when the user is in
pizarra-maximized or focused-on-another-panel mode, the new terminal is
invisible. The dispatch `useEffect` in `ChatPanel.jsx:167-191` also fires the
CustomEvent on **every** `messages` state change after the first `open_terminal`
result, so the event can re-fire and re-open panels on unrelated user actions.
(2) `buildZedHistory(messages.slice(0, -1))` in `ChatPanel.jsx:78-82` runs on
the **closure** value of `messages` (previous render's state), so
`messages.slice(0, -1)` excludes the previous ASSISTANT message instead of the
just-added optimistic USER message. The model never sees the previous
assistant turn, its `tool_results`, or the `session_id` that came back from the
model's own `open_terminal` call. (3) `open_url` shells out to `xdg-open` with
no CustomEvent and no parity with `open_terminal`'s in-app focus path. A
clean fix is small, strict-TDD-friendly, and phased (visibility → memory →
`open_url` parity → e2e).

---

## 1. Architecture map

### Zed chat data flow (current)

```
User types in textarea
  └─> ChatPanel.handleSend
        ├─ setMessages (optimistic: appends {user, msg, ts})          [ChatPanel:68-71]
        ├─ history = buildZedHistory(messages.slice(0, -1))          [ChatPanel:78-82]   ★ BUG (closure stale)
        ├─ fetch POST /api/assistant/chat { message, history, context } [ChatPanel:83-88]
        │     └─> route.js POST
        │           ├─ loadSystemPrompt() from docs/prompts/asistente/zed-system-prompt.md
        │           ├─ safeHistory = history.filter(...).slice(-20)  [route.js:136-146]
        │           ├─ conversation = [...safeHistory, {user, message}] [route.js:172]
        │           └─ while (turn < MAX_TURNS=6):
        │                 ├─ callMinimax(MODEL, system, conversation)  [route.js:63-95]
        │                 ├─ toolCalls = parseToolCalls(rawText)
        │                 ├─ for each call: tool.execute() → turnToolResults
        │                 └─ conversation.push({assistant, rawText}, "Tool X result: …")  [route.js:274-285]
        └─ setMessages (append {assistant, data.text, data.tool_results}) [ChatPanel:92-100]

ChatPanel useEffect on [messages]                                    [ChatPanel:167-191]
  └─> finds LAST assistant message with tool_results containing open_terminal
        └─> window.dispatchEvent(CustomEvent('devhub:zed-open-terminal', detail))  ★ re-fires on every messages change

window.addEventListener('devhub:zed-open-terminal', handleZedOpenTerminal)  [TWM:3708]
  └─> handleZedOpenTerminal:
        ├─ resolveZedOpenTerminalPanelId(detail, null) → explicitPanelId = session_id  [TWM:3688]
        ├─ targetWsId = activeWsIdRef.current || activeWsId                              [TWM:3690]
        ├─ targetPanelId = activePanelIdsRef.current[targetWsId] || activePanelId        [TWM:3691]
        └─ handleSplit('horizontal', targetPanelId, command, cwd, explicitPanelId)       [TWM:3699]
              └─> createColumn (or new panel in same column) with the session_id as the new panel id
              └─> setActivePanelIds(prev => ({ ...prev, [targetWsId]: newPanelId }))    [TWM:2822]
                                                                                       ★ does NOT exit pizarra-maximized
                                                                                       ★ does NOT call activateWorkspacePanel
                                                                                       ★ does NOT scroll-into-view
                                                                                       ★ does NOT call setFocusedPanelByWorkspace
```

### File map (one line each)

| File                                           | Role                                                                                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/api/assistant/chat/route.js`          | POST route. Parses body, owns per-turn tool loop, calls MiniMax, dispatches tool results.                                                                  |
| `src/components/asistente/ChatPanel.jsx`       | Right-dock UI. Sends `message` + `history`, dispatches `devhub:zed-open-terminal`.                                                                         |
| `src/components/zedOpenTerminalEvent.js`       | Pure helpers `isValidZedOpenTerminalEvent(detail)`, `resolveZedOpenTerminalPanelId(detail, fallback)`.                                                     |
| `src/components/TerminalWorkspacesManager.jsx` | Owns workspaces/columns/panels/right-dock state. Registers the `devhub:zed-open-terminal` listener (lines 3685-3700 + addEventListener 3708).              |
| `src/lib/asistente/tools/terminal.js`          | `terminalTool` (open), `listTerminalsTool`, `reviewTerminalTool`, `executeInTerminalTool`, `closeTerminalTool`. POSTs to `/api/terminal/session` for open. |
| `src/lib/asistente/tools/browser.js`           | `browserTool` (open_url). URL safety check + `execSync('xdg-open …')`. NO CustomEvent.                                                                     |
| `src/lib/asistente/utils/zed-logger.js`        | Server-side logger (`logs/zed-assistant.log`, `logs/zed-chat-YYYY-MM-DD.log`).                                                                             |
| `src/app/api/terminal/session/route.js` (POST) | Backend that creates PTY sessions and returns `{id, port, wsPath}`.                                                                                        |
| `docs/prompts/asistente/zed-system-prompt.md`  | Model system prompt (215 lines). Already covers all 10 tools + T-027 "do not re-verify" rule.                                                              |

---

## 2. Root-cause analysis: visibility bug

### Dispatch side (ChatPanel)

`ChatPanel.jsx:167-191`:

```jsx
useEffect(() => {
  let lastMessage = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].tool_results?.some((r) => r.tool === 'open_terminal')) {
      lastMessage = messages[i];
      break;
    }
  }
  if (!lastMessage) return;
  const openTerminalResult = lastMessage.tool_results.find((r) => r.tool === 'open_terminal');
  const result = openTerminalResult?.result;
  if (!result || result.error) return;
  const parsed = typeof result === 'string' ? safeParse(result) : result;
  if (parsed?.session_id) {
    window.dispatchEvent(new CustomEvent('devhub:zed-open-terminal', { detail: { … } }));
  }
}, [messages]);
```

**Sub-bug A: re-fires on every `messages` change after the first open_terminal
result.** Every time the user sends a new message or a new assistant turn
lands, this `useEffect` re-runs, re-finds the same `lastMessage` (the FIRST
assistant turn that opened a terminal), and re-dispatches the CustomEvent. The
listener therefore re-opens the same PTY session as a new panel **every
single time the chat updates** after the first open. This compounds the
visibility bug — the user sees a growing column of empty terminals on every
chat turn. The fix is to track which `open_terminal` result has already been
handled (e.g. a `useRef` of the last dispatched `session_id`).

### Consumer side (TWM)

`TerminalWorkspacesManager.jsx:3685-3700`:

```jsx
const handleZedOpenTerminal = (e) => {
  if (!isValidZedOpenTerminalEvent(e.detail)) return;
  const { command, cwd, session_id } = e.detail;
  const explicitPanelId = resolveZedOpenTerminalPanelId(e.detail, null);

  const targetWsId = activeWsIdRef.current || activeWsId;
  const targetPanelId = activePanelIdsRef.current[targetWsId] || activePanelId;

  if (!targetWsId || !targetPanelId) return;

  console.log(`[Zed] Opening terminal command=${command} cwd=${cwd} session_id=${session_id}`);
  handleSplit('horizontal', targetPanelId, command, cwd || null, explicitPanelId);
};
```

`handleSplit` (lines 2757-2834) DOES create a fresh panel/column. A new
panel id is minted (`p${panelCounterRef.current + 1}`) OR, when
`explicitPanelId` (the model's `session_id`) is supplied, that id is reused.
Then `setActivePanelIds(prev => ({ ...prev, [targetWsId]: newPanelId }))` runs.
So the new panel exists and is "active" in the data layer.

**But "active" in the data layer ≠ "visible on the user's screen" in three
common scenarios. Evidence from `TerminalWorkspacesManager.jsx`:**

1. **Pizarra-maximized (the dominant case for the right-dock chat user).**
   When `effectiveRightDockState.maximized === true && maximizedView === 'pizarra'`,
   the right dock renders fullscreen and the LEFT workspace (where the new
   terminal lives) is hidden by the absolute-positioned dock layer (line
   4524-4530: `!effectiveRightDockState.visible || hideRightDockPanel ? 'hidden' : 'flex flex-col'`).
   The new panel is created in workspace state, but the user is staring at
   pizarra. `hideRightDockPanel` includes the maximized check (line 1672).
   `handleZedOpenTerminal` does NOT call `updateRightDockState` to de-maximize.

2. **Focused-on-different-panel mode.** When a user clicks "Focus terminal"
   on a panel (line 766-775), `setFocusedPanelByWorkspace` is set, and the
   workspace renders only that one panel (line 4288-4298:
   `focusedPanel ? renderWorkspacePanel(focusedPanel, …) : <multi-panel view>`).
   The new panel from `handleSplit` is created in `workspaces` state but
   `focusedPanelByWorkspace[ws.id]` still points at the old one. The
   listener does NOT call `setFocusedPanelByWorkspace` to clear or update
   the focus.

3. **Workspace-window mismatch.** `workspaces` and `workspaceWindows` are two
   parallel trees. `activateWorkspacePanel` (line 1998-2025) keeps them in
   sync: it updates `setActivePanelIds` AND iterates `workspaceWindows[wsId]`
   to set `activePanelId` on the active `windowView`. `handleSplit` only
   updates `setActivePanelIds` and the active `windowView` via
   `syncActiveWindowSnapshot` — but `syncActiveWindowSnapshot` only sets
   `activePanelId` to `nextActivePanelId || win.activePanelId || …[0]?.id`.
   When the new panel is the ONLY panel in the new column (a fresh
   `createColumn` call), this should work, but **if the user is in a
   "window" that doesn't yet exist in `workspaceWindows`** (e.g. the legacy
   default workspace before `syncActiveWindowSnapshot` has been called for
   the current state), the new panel may live in a hidden window.
   `activateWorkspacePanel` is the safer call.

### Where the chain breaks

The chain is "fire event → listener → handleSplit → setActivePanelIds →
render in workspace". The break is downstream of `setActivePanelIds`:

- **`handleSplit` does not exit pizarra-maximized.** Fix: in the listener,
  also call `updateRightDockState(prev => ({ ...prev, visible: true, maximized: false, maximizedView: 'browser' }))`
  (or the dedicated "exit-maximized" helper if one exists; otherwise the
  above inlined state works).
- **`handleSplit` does not call `activateWorkspacePanel`.** Fix: after
  `handleSplit` returns `newPanelId`, call `activateWorkspacePanel(targetWsId, newPanelId)`.
  This is the existing pattern (lines 1998-2025) used by other workspace
  changes. It also updates `setWorkspaceWindows` and triggers React re-render
  of the active window.
- **`handleSplit` does not call `setFocusedPanelByWorkspace`.** Optional but
  recommended: clear or set the focused panel to the new one so the user
  sees it instead of whatever was focused.
- **`handleSplit` does not switch the right-dock tab away from `zed`.**
  Optional. Two valid behaviors: (a) keep `zed` so the user sees the chat
  confirmation alongside, (b) switch to `editor` to make room for the
  terminal view. Keep `zed` for now — that's where the user just clicked.

### "New empty terminal, not reuse one with content"

Reading the user request literally: every `open_terminal` call should yield
a NEW panel (no reuse) AND the new panel should be EMPTY (no pre-populated
content; the command runs in the PTY but the panel chrome shows nothing
pre-existing).

The current code DOES create a new panel every time (no reuse), so that
half of the request is already met. The "empty" half is satisfied by the
PTY starting fresh (which it does — `ttyServer.createSession` mints a new
node-pty). The only sense in which a panel could be "non-empty" is if the
new panel happens to land in a column that already has a focused panel
showing prior content. **The fix is to ensure the new panel becomes the
visible/focused panel**, not to change the open_terminal tool itself.

---

## 3. Root-cause analysis: memory bug

### The closure-stale bug

`ChatPanel.jsx:56-116` (`handleSend`):

```jsx
const userMessage = input.trim();
setInput('');
setIsLoading(true);

const ctrl = new AbortController();
setAbortController(ctrl);

setMessages((prev) => [
  ...prev,
  { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
]);

try {
  // T-033: send the conversation history (last 20 messages, flattened
  // into the server protocol by `buildZedHistory`). The server prepends
  // it to the per-turn tool loop so the model retains recent context
  // across requests.
  const history = buildZedHistory(
    // Exclude the message we just optimistically appended in
    // setMessages above (line 68-71) — that one is sent as `message`.
    messages.slice(0, -1)        // ★ messages is the CLOSURE value (previous render's state)
  );
  const response = await fetch('/api/assistant/chat', { …, body: JSON.stringify({ message: userMessage, history, … }) });
```

`handleSend` is wrapped in `useCallback(..., [input, isLoading, scrollToBottom])`.
`messages` is **not** in the dependency array, so the closure `messages`
captures the state from the LAST render — the state BEFORE the optimistic
`setMessages` call queues the new user message.

Concretely, after two completed turns the state is:

```
messages (closure) = [
  { role: 'assistant', content: 'Hola, soy Zed...', ts: 'initial' },  // welcome
  { role: 'user',      content: 'abre una terminal', ts: '...' },     // turn 1 user
  { role: 'assistant', content: 'Terminal abierta', ts: '...', tool_results: [{tool:'open_terminal', result:{session_id:'term-1780430078056-v57np',…}}] },  // turn 1 assistant
]
```

When the user types "ahora corré `ls` en esa terminal" and clicks Send:

1. `setMessages((prev) => [...prev, {user, 'ahora corré ls…'}])` — QUEUED, not yet applied.
2. `buildZedHistory(messages.slice(0, -1))`:
   - `messages` is still the closure value above.
   - `messages.slice(0, -1)` = `[welcome, turn1-user]`.
   - `buildZedHistory([welcome, turn1-user])` = `[{role:assistant, content:'Hola…'}, {role:user, content:'abre una terminal'}]`.
   - **The turn-1 assistant message AND its `tool_results` (including the `session_id: 'term-1780430078056-v57np'`) are DROPPED.**
3. The server receives: `message='ahora corré ls…'`, `history=[{assistant, 'Hola…'}, {user, 'abre una terminal'}]`.
4. Server builds: `conversation = [{assistant, 'Hola…'}, {user, 'abre una terminal'}, {user, 'ahora corré ls…'}]`.
5. **The model has no idea a terminal was opened, no `session_id` to refer to, and no record that the assistant said "Terminal abierta".**

This explains the user's symptom: "the assistant does not remember recent
messages" + "every command runs in a new empty terminal". The model literally
forgets its own previous turns, so when the user says "now run ls in that
terminal", the model has to call `open_terminal` again with a fresh session
(and the listener will then re-open with that fresh session_id).

### Why the comment is wrong

The author wrote "Exclude the message we just optimistically appended in
setMessages above — that one is sent as `message`." The intent is correct:
the new user message is sent as `message`, so it should be excluded from
`history`. But the implementation reads from the closure `messages`, which
has the PREVIOUS render's state, where the just-appended message is NOT
present. So `messages.slice(0, -1)` excludes the LAST message of the
previous render — which is the previous assistant turn. The slice is
correct in shape, but applied to the wrong array.

### Three ways to fix it (pick one, do not mix)

1. **Use a `useRef` of latest messages, updated in the same setMessages
   callback.** Pattern: `const messagesRef = useRef(messages); … 
setMessages((prev) => { const next = [...prev, newMsg]; messagesRef.current = next; return next; });
… buildZedHistory(messagesRef.current.slice(0, -1));`. Clean, no double-source-of-truth. Strict-TDD-friendly: write a test that asserts the history sent on the 2nd turn includes the 1st assistant turn.

2. **Drop the slice entirely and let the server dedupe.** Pass the full
   `messages` state as history. The server already filters by role
   (`user`/`assistant` only) and slices the last 20. The server's
   `[...safeHistory, {user, message}]` will end up with the previous user
   message right before the new one — which is harmless (the model already
   handled that pair last turn). The risk: the same `message` content
   appears twice in `conversation`, but it's the PREVIOUS turn's user
   message, not the current one. Model can ignore it. Simplest fix.

3. **Use `setMessages(prev => ...)` and read the updated value from `prev`
   via a side channel.** Awkward in React; not recommended.

**Recommendation: option 2 (drop the slice).** Smallest diff, server already
filters and caps, no risk of double-rendering. Add a unit test that
verifies the 2nd-turn history contains the 1st-turn assistant message
(including the `tool_results`-derived `Tool <name> result: …` line that
`buildZedHistory` synthesizes).

### Server side is already correct

`route.js:136-172` is fine: `safeHistory` filters malformed entries,
slices to 20, and the conversation is `[...safeHistory, {user, message}]`.
The per-turn tool loop appends assistant text and `"Tool X result: …"`
messages after the initial seed (lines 274-285), and `turnToolResults`
keeps this turn's results from leaking across turns (T-031 fix). No
changes needed server-side for the memory bug.

### System prompt coverage

`docs/prompts/asistente/zed-system-prompt.md` already has the "After tool
execution" rule (line 57-65) telling the model to interpret the prior
tool result instead of re-asking. The "Do not re-verify after a tool
confirms" rule (T-027, line 72) is also in. The model is told to USE
history implicitly via the per-turn loop, not explicitly. The system
prompt does NOT need a new clause for the memory bug — fixing the
client-side slice is sufficient.

---

## 4. Open URL parity

### Current `open_url` tool

`src/lib/asistente/tools/browser.js`:

```js
async execute(params) {
  const { url, label } = params;
  if (!url) return { error: 'url is required' };
  const safety = isSafeHttpUrl(url);
  if (safety.error) return safety;
  zedLog.info('TOOL', 'open_url', { url, label });
  try {
    execSync(`xdg-open "${safety.url}"`, { stdio: 'ignore' });
  } catch { /* ignore */ }
  return { url: safety.url, opened: true, message: `Browser opened for ${safety.url}` };
}
```

This just shells out to the system browser via `xdg-open`. No CustomEvent,
no in-app navigation, no focus change.

### Parity with `open_terminal`

`open_terminal` fires a CustomEvent so the panel layer can wire it to the
visual workspace. `open_url` does not. The user-visible behaviors are
different (system browser vs. in-app terminal), but the same kind of
"where should the user's attention go?" question applies:

- If the user is in pizarra-maximized and asks "open
  https://github.com/foo", do we want to (a) open the system browser and
  let the user alt-tab, (b) navigate the in-app right-dock browser pane
  to the URL, (c) do both?
- The right-dock browser pane already exists (`WorkspaceBrowserPane.jsx`,
  `browserWindowState` is the persisted URL state per workspace). The
  natural fix is a new CustomEvent `devhub:zed-open-url` that the right-dock
  browser pane (or a new listener) catches and either navigates in-app or
  de-maximizes pizarra and shows the URL.

### What to do (recommendation)

Same pattern as `open_terminal`:

1. `browserTool.execute` dispatches `new CustomEvent('devhub:zed-open-url', { detail: { url, label } })`.
2. `WorkspaceBrowserPane` (or TWM) adds a listener that calls
   `updateBrowserWindowState(workspaceId, { url, open: true })` and
   `updateRightDockState(prev => ({ ...prev, visible: true, activeTab: 'browser', maximized: false }))`.
3. Optionally keep the `xdg-open` call as a fallback (or remove it — user's
   intent is likely in-app navigation, not system browser).

Keep it as a separate slice (slice 3) so the `open_terminal` and `open_url`
fixes ship independently.

---

## 5. Test gap analysis

### Existing tests (the relevant ones)

| File                                                                | What it covers                                                                                   | Verdict                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `src/lib/asistente/__tests__/parseToolCalls.test.js`                | 10+ parser cases.                                                                                | Solid.                                                                     |
| `src/lib/asistente/__tests__/zedSystemPrompt.test.js`               | Prompt file exists, contains tool names.                                                         | Surface-level.                                                             |
| `src/lib/asistente/__tests__/tools/browser.test.js`                 | URL allow-list, xdg-open call.                                                                   | Solid.                                                                     |
| `src/lib/asistente/__tests__/tools/terminal.exec.test.js`           | `execute_in_terminal` PUT, `close_terminal` confirm.                                             | Solid.                                                                     |
| `src/lib/asistente/__tests__/tools/terminal.list.test.js`           | `list_terminals`, `review_terminal_output`.                                                      | Solid.                                                                     |
| `src/lib/asistente/__tests__/tools/registry.get.test.js`            | Registry get/lookup.                                                                             | Solid.                                                                     |
| `src/components/asistente/__tests__/ChatPanel.test.jsx`             | Hydration sentinel, `devhub:zed-open-terminal` dispatch (positive + error), paste.               | Missing: history content, useEffect re-fire guard, focus dispatch.         |
| `src/components/asistente/__tests__/buildZedHistory.test.js`        | `buildZedHistory` shape, cap, malformed filter.                                                  | Solid for the helper; no integration test that wires it into `handleSend`. |
| `src/components/__tests__/zedOpenTerminalEvent.test.js`             | `isValidZedOpenTerminalEvent`, `resolveZedOpenTerminalPanelId`.                                  | Solid.                                                                     |
| `src/app/api/assistant/chat/__tests__/route.history.test.js`        | Server prepends `safeHistory` to `conversation`, caps at 20, drops malformed, accepts non-array. | Solid (server-side).                                                       |
| `src/app/api/assistant/chat/__tests__/route.no-params.test.js`      | No-params feedback for tools with required schema.                                               | Solid.                                                                     |
| `src/app/api/assistant/chat/__tests__/route.context-growth.test.js` | `turnToolResults` stays per-turn (T-031 fix).                                                    | Solid.                                                                     |
| `tests/e2e/06_zed_open_terminal.spec.ts`                            | E2E: ChatPanel dispatches the event after a mocked `/api/assistant/chat`.                        | Asserts ONLY on the event detail, NOT on the panel becoming visible.       |

**There are more than 5 unit tests** — the prompt's "5 unit + 1 E2E" is an
underestimate. Above I list 11 unit/integration files plus 1 E2E that are
relevant to this change.

### Gaps the change must close

1. **No test asserts the visibility outcome.** The current E2E only checks
   the CustomEvent was dispatched. There is no test that asserts after
   `devhub:zed-open-terminal` is received, the new panel is in the active
   workspace's `activePanelIds`, the panel id matches the model-supplied
   `session_id`, and pizarra-maximized was exited. This is the single
   most important test to add.

2. **No test for the re-fire sub-bug.** The current E2E/ChatPanel test
   sends one message and asserts one event. There is no test that sends a
   SECOND message (which causes `messages` to change again) and asserts
   the event is NOT re-dispatched for the same `session_id`. Required.

3. **No test for the memory closure bug.** `buildZedHistory.test.js` is
   unit-only. There is no `handleSend` test that:
   - sends message A, gets response with `tool_results: [open_terminal{session_id:X}]`
   - sends message B
   - asserts the body sent for B contains `tool open_terminal result: {"session_id":"X",…}`
   - asserts the body sent for B does NOT contain the new user message twice

4. **No test for `open_url` CustomEvent dispatch.** Add a unit test that
   asserts the tool result returns `{opened: true, …}` AND a
   `devhub:zed-open-url` event was dispatched with the URL detail.

5. **No E2E for `open_url` parity.** Optional. Lower priority than the
   visibility E2E.

### Manual test scripts the user can stop running after the fix

Currently the user has to:

- type "open a new terminal and run ls" → look at the right-dock chat → manually click the right-dock `editor` or workspace area → manually scroll to find the new terminal.
- type "now run ls again" → see whether the assistant uses the same `session_id` or opens a new one.

After the fix, the new panel should be visible without user intervention,
and the 2nd-turn body should contain the previous tool result.

### E2E without Tauri runtime

`tests/e2e/06_zed_open_terminal.spec.ts` already runs without Tauri — it
mocks `/api/db/query*`, `/api/db/mutate*`, and `/api/assistant/chat` via
`page.route()`. It uses `localStorage.setItem` to seed the right-dock
state. The existing pattern is enough for a follow-up visibility test:

- mock `/api/assistant/chat` to return `tool_results: [open_terminal]`
- assert `window.__lastPanelActivated` (a new test hook the listener sets)
- or assert the active panel id in `localStorage.devhub_terminal_state:*`
  after the chat turn completes

The Tauri window helpers are wrapped in `try { const { … } = await
import('@tauri-apps/api/window'); } catch { return null; }` patterns
(TWM:3724-3731, 3735-3756), so the listener is a no-op when `window.__TAURI_INTERNALS__`
is undefined. The Playwright chromium does NOT have `__TAURI_INTERNALS__`,
so the E2E exercises the no-op path — fine for asserting the event-bus
contract; insufficient for asserting `activateWorkspacePanel` side effects
(which DO run in browser, regardless of Tauri).

To assert `activateWorkspacePanel` side effects, stub it on `window` (via
`page.exposeFunction` or a `addInitScript` that injects a spy) and read
the call count. This is the standard pattern in this repo's existing E2E
suites.

---

## 6. Risks

| #   | Risk                                                                                                                                                                                                                                                                                               |       Likelihood | Mitigation                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Always create new empty terminal breaks existing flows.** E.g. if a user-driven UX flows through `handleSplit` with the same `activePanelId` to "open in the same column" — would not break because `handleSplit` always creates a new panel/column. The "new empty" requirement is already met. |              Low | No change to `terminalTool` itself. Only the listener is touched.                                                                                                                                                                                                                                                                                                                                |
| 2   | **`activateWorkspacePanel` + `setFocusedPanelByWorkspace` could steal focus at the wrong moment.** E.g. the user is typing in the chat textarea when a previous-turn assistant message is processed; clearing the focus could disrupt the next message render.                                     |           Medium | Only run the focus side-effects on the dispatch path (`handleZedOpenTerminal`), not on every `messages` change. Add a `dispatchedSessionIdsRef` so the listener only fires once per `session_id`.                                                                                                                                                                                                |
| 3   | **De-maximizing pizarra could surprise the user.** If the user is in pizarra deliberately and Zed dispatches a `devhub:zed-open-terminal`, exiting pizarra to show the terminal is a state change the user did not ask for.                                                                        |           Medium | De-maximize only when the pizarra view is currently `pizarra` AND no other tab is more relevant. Alternative: keep pizarra visible, but pin a small toast/banner "Terminal opened in workspace X". Pinarra is the dominant case but not the only one. Make the de-maximize opt-in via a `devhub:zed-open-terminal:detail.focus = true` flag in the event detail — defaulting to NOT de-maximize. |
| 4   | **Always sending 20-message history bloat the prompt.** M3 round-trips are ~6s/turn per memory. 20 messages + tool_results (each as `Tool <name> result: <json>`) is at most ~4-6k tokens. M3 has 200k context; well within budget.                                                                |              Low | Already capped at 20. Re-check if any tool result exceeds 1k tokens (none in the audit).                                                                                                                                                                                                                                                                                                         |
| 5   | **The `useEffect([messages])` re-fire sub-bug compounds with the visibility bug.** If the user sends 3 messages after the first `open_terminal`, the listener fires 3 times, each opening a new panel. After the fix, only 1 panel opens (the first one), and subsequent messages don't re-open.   | High (currently) | Track last dispatched `session_id` in a `useRef`. Lock with a test.                                                                                                                                                                                                                                                                                                                              |
| 6   | **Server-side `safeHistory` filter is already strict** (must be object, role `user`/`assistant`, content string). The closure-stale fix does not need to change the server.                                                                                                                        |             None | No change to `route.js` for the memory bug.                                                                                                                                                                                                                                                                                                                                                      |
| 7   | **The T-024 producer test (ChatPanel.test.jsx) does NOT cover the `useEffect` re-fire behavior.** If we add a `useRef` guard, we need a test that sends 2 messages and asserts the event fired only once.                                                                                          |             None | Add the test as part of slice 1.                                                                                                                                                                                                                                                                                                                                                                 |
| 8   | **The `activateWorkspacePanel` side effect could change the `activeWindowId`.** If the user is in a non-default window in a workspace, the new panel might land in a different window.                                                                                                             |              Low | `handleSplit` already calls `syncActiveWindowSnapshot` which keeps the new panel in the active window. No additional fix needed.                                                                                                                                                                                                                                                                 |
| 9   | **`devhub:zed-open-url` CustomEvent name collision with future events.**                                                                                                                                                                                                                           |              Low | The `devhub:zed-*` namespace is already established (`devhub:zed-open-terminal`). New event fits.                                                                                                                                                                                                                                                                                                |
| 10  | **The 2nd-turn memory fix could expose a pre-existing issue** with `buildZedHistory` flattening tool_results to user-role messages. If the model is confused by seeing its own tool results as user-role messages, that pre-dates this change.                                                     |              Low | Pre-existing behavior. The `route.js:280-285` injects tool results as user-role too, so the model is already trained to handle this shape.                                                                                                                                                                                                                                                       |

---

## 7. Recommended fix strategy

### Slices (smallest reviewable unit per slice)

#### Slice 1 — Visibility (most impactful, ships first)

- **File**: `src/components/TerminalWorkspacesManager.jsx`
  - **Symbol**: `handleZedOpenTerminal` (lines 3685-3700)
  - **Change**: after `handleSplit(...)` returns `newPanelId`, also:
    1. Call `activateWorkspacePanel(targetWsId, newPanelId)`. This is the
       existing helper at lines 1998-2025 that updates `setActiveWsId`,
       `setActivePanelIds`, AND `setWorkspaceWindows` (active window's
       `activePanelId`).
    2. Optionally `setFocusedPanelByWorkspace(prev => ({ ...prev, [targetWsId]: newPanelId }))`
       so the new panel becomes the only one visible in its workspace.
    3. Optionally de-maximize pizarra via `updateRightDockState(prev => ({ ...prev, maximized: false, maximizedView: 'browser' }))`
       — but only when the current view is `pizarra` AND the event's
       `detail.focus === true` (opt-in to avoid surprising users in other
       modes). Default to NOT de-maximize; the active-panel change is
       usually enough.
- **File**: `src/components/asistente/ChatPanel.jsx`
  - **Symbol**: the `useEffect([messages])` at lines 167-191
  - **Change**: add a `useRef` of dispatched `session_id`s; only dispatch
    if the new `session_id` is not in the ref. Update the ref after
    dispatch. Lock behavior with a test that sends 2 messages after the
    first `open_terminal` and asserts the event fired only once.
- **Test**:
  - Unit: `src/components/TerminalWorkspacesManager.jsx` does not have a
    Jest test today (the file is 4602 lines, hard to mount). Instead, add
    a unit test for the new helper `dispatchZedOpenTerminalToPanel(eventDetail, targetWsId, deps)` extracted from `handleZedOpenTerminal` — pure function takes `(detail, targetWsId)` and returns the new panel id + workspace actions to apply. This is the same pattern the existing `zedOpenTerminalEvent.js` uses (T-025 extracted `isValidZedOpenTerminalEvent` for testability).
  - Component: extend `src/components/asistente/__tests__/ChatPanel.test.jsx`
    with a test that sends 2 messages and asserts the event fired once.
  - E2E: extend `tests/e2e/06_zed_open_terminal.spec.ts` with a
    visibility check: stub `localStorage.devhub_terminal_state` to have
    a known `activePanelIds`, send a chat turn that returns an
    `open_terminal` result, assert the panel id in `activePanelIds` is
    now the model's `session_id`.

#### Slice 2 — Memory

- **File**: `src/components/asistente/ChatPanel.jsx`
  - **Symbol**: `handleSend` (lines 56-116)
  - **Change**: drop `messages.slice(0, -1)` and pass the closure `messages`
    directly to `buildZedHistory`. The server's `safeHistory` filter
    (`route.js:136-146`) already validates roles and slices to 20; the
    harmless duplicate of the previous-turn user message is OK (it
    represents the prior turn, not the current one).
  - Alternative: add a `useRef` of latest messages, updated synchronously
    in the `setMessages` callback. Then `buildZedHistory(messagesRef.current.slice(0, -1))`
    works as the author intended. Tradeoff: ref adds a second source of
    truth. Prefer the "drop the slice" option for simplicity.
- **Test**:
  - Unit: extend `src/components/asistente/__tests__/buildZedHistory.test.js`
    with an integration scenario — call the helper with the same
    `messages` array that `handleSend` would see on the 2nd turn, assert
    the result contains the previous assistant turn and its
    tool_results-derived `Tool open_terminal result: …` line.
  - Component: extend `src/components/asistente/__tests__/ChatPanel.test.jsx`
    with a 2-turn send-and-settle test that captures the second
    `fetch` body and asserts it contains the previous
    `open_terminal result:` string.
  - Route: no change to `route.js`; existing `route.history.test.js`
    already covers the server-side prepend.

#### Slice 3 — `open_url` parity

- **File**: `src/lib/asistente/tools/browser.js`
  - **Change**: in addition to `execSync('xdg-open …')`, dispatch
    `new CustomEvent('devhub:zed-open-url', { detail: { url, label } })`
    on `window`. Return the same shape as before.
- **File**: `src/components/workspace/WorkspaceBrowserPane.jsx` (or TWM)
  - **Change**: add a `useEffect` that listens for `devhub:zed-open-url`
    and calls `onBrowserWindowStateChange(workspaceId, { url, open: true })`
    plus `updateRightDockState(prev => ({ ...prev, visible: true, activeTab: 'browser', maximized: false }))`.
- **Test**:
  - Unit: extend `src/lib/asistente/__tests__/tools/browser.test.js` to
    assert a `devhub:zed-open-url` CustomEvent was dispatched.
  - Component: a new `WorkspaceBrowserPane` test that listens for the
    event and asserts the browser state updated.

#### Slice 4 — E2E coverage (optional, can merge into slice 1)

- Extend `tests/e2e/06_zed_open_terminal.spec.ts` with:
  - A visibility assertion (panel id in `activePanelIds` after the turn).
  - A re-fire guard assertion (send 2 messages, assert event fired once).
- Add `tests/e2e/07_zed_open_url.spec.ts` (mirrors the structure).

### LOC budget (per slice)

| Slice               |    Impl |    Tests |      Net |
| ------------------- | ------: | -------: | -------: |
| 1 (visibility)      |     ~30 |      ~80 |     +110 |
| 2 (memory)          |      ~5 |      ~50 |      +55 |
| 3 (open_url parity) |     ~25 |      ~40 |      +65 |
| 4 (e2e)             |      ~5 |      ~80 |      +85 |
| **Total**           | **~65** | **~250** | **+315** |

Well under the 400-line review-workload budget. Each slice is a chained
PR. Per the sdd-tasks guard, `400-line budget risk: Low`.

### Rollback plan

Each slice is a single commit on `feature/session-workspace-restore`. If
slice 1 breaks visibility, `git revert` the commit. Same for slices 2/3/4.
No DB migration, no env var addition, no dependency bump.

### Out of scope (deferred)

- Native-terminal placeholder (VTE) integration with `devhub:zed-open-terminal`:
  the listener should eventually route the `session_id` to a VTE-backed
  surface too. Defer to a follow-up `zed-native-visibility` change.
- `close_terminal` UX when the panel is in pizarra-maximized: not in scope.
- In-app browser as default for `open_url` (currently still shells out to
  `xdg-open`): can be added in slice 3 with a flag, or deferred if the
  system browser behavior is preferred.

---

## Files touched (per slice, for the orchestrator's downstream phases)

- **Slice 1**: `src/components/TerminalWorkspacesManager.jsx` (listener
  refactor + helper extraction), `src/components/asistente/ChatPanel.jsx`
  (re-fire guard), `src/components/zedOpenTerminalEvent.js` (new
  helper, optional), `src/components/asistente/__tests__/ChatPanel.test.jsx`,
  `tests/e2e/06_zed_open_terminal.spec.ts`, NEW test for the extracted
  listener helper.
- **Slice 2**: `src/components/asistente/ChatPanel.jsx` (drop slice),
  `src/components/asistente/__tests__/ChatPanel.test.jsx`,
  `src/components/asistente/__tests__/buildZedHistory.test.js`.
- **Slice 3**: `src/lib/asistente/tools/browser.js`,
  `src/components/workspace/WorkspaceBrowserPane.jsx` (listener),
  `src/lib/asistente/__tests__/tools/browser.test.js`, NEW
  `WorkspaceBrowserPane` test (or TWM test if listener stays in TWM).
- **Slice 4**: `tests/e2e/06_zed_open_terminal.spec.ts` (extend),
  `tests/e2e/07_zed_open_url.spec.ts` (NEW, optional).

---

## Ready for Proposal

Yes. The orchestrator should run `sdd-propose` next, with the slice
breakdown above as the starting point. The visibility slice is the most
urgent and self-contained — it can ship as a single chained PR
independent of the memory and `open_url` slices.

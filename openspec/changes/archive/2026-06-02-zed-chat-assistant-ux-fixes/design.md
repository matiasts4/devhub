# Design: Zed Chat Assistant UX Fixes

> Branch: `feature/session-workspace-restore`. Strict TDD. Single PR, 4 chained commits.
> Inputs: `openspec/changes/zed-chat-assistant-ux-fixes/{proposal,exploration}.md` + 4 spec deltas in `specs/`.
> Out of scope: `openspec/changes/native-command-executor-assistant/` (CommandBar — orthogonal).
> Backend: untouched. This change is pure client/listener/event-flow.
> Design LOC target: < 800 net (per sdd-proposal D2 guard).

## §1. Goals and non-goals

**Goal.** Close the three client-side breaks in the Zed chat assistant: (a) the `devhub:zed-open-terminal` listener creates a new panel but never makes it visible (pizarra-maximized, focused-panel, and window-mismatch cases all hide the new panel), and the dispatch `useEffect` re-fires on every `messages` change; (b) `ChatPanel.handleSend` builds the request history from the closure value of `messages`, so the model never sees its own previous assistant turn or the `session_id` returned by its own `open_terminal` call; (c) `open_url` shells out to `xdg-open` with no in-app `devhub:zed-open-url` event for the right-dock browser pane. Ship a strict-TDD, slice-able fix that turns the broken manual-test loop into a fully covered change with four chained commits.

**Non-goals.** Re-architect the model loop, tool loop, or `route.js` per-turn seed. Change the LLM model id or `MINIMAX_API_KEY` plumbing. Touch Director General mission / `swarm-director`. Add the native VTE renderer. Make the in-app browser pane the **default** for `open_url` (system browser stays as fallback; in-app is now also wired). Add voice/TTS read-aloud. Promote a new dependency. Migrate data. Touch any `route.js` line that is not strictly required.

## §2. Architecture overview

```
                                  +-----------------------------------------+
                                  |                                         |
  user types  ───────────────────► |  ChatPanel.handleSend                   |
  in textarea                      |   ├─ setMessages((prev)=>…new user…)   |
                                  |   ├─ history = buildZedHistory(messages) |
                                  |   │     (closure value; closure-stable) |
                                  |   └─ fetch POST /api/assistant/chat      |
                                  |         { message, history, context }    |
                                  +-------------------┬---------------------+
                                                      │
                                                      ▼
                            +-------------------------------------------------+
                            |  src/app/api/assistant/chat/route.js           |
                            |   ├─ safeHistory = history                     |
                            |   │     .filter(role∈{user,assistant}            |
                            |   │           content is string)                |
                            |   │     .slice(-20)                             |
                            |   ├─ conversation = [...safeHistory,            |
                            |   │                     {user, message}]       |
                            |   └─ while (turn<MAX_TURNS=6):                 |
                            |         callMinimax + tool dispatch             |
                            |         push assistant + tool_results           |
                            |         into conversation                       |
                            +-----------------------┬-------------------------+
                                                    │ JSON response
                                                    ▼
                            +-------------------------------------------------+
                            |  ChatPanel (post-fetch)                        |
                            |   setMessages((prev)=>… assistant + tool_res) |
                            +-----------------------┬-------------------------+
                                                    │ messages changes
                                                    ▼
                            +-------------------------------------------------+
                            |  ChatPanel dispatch useEffect                  |
                            |  useRef dispatchedSessionIds = new Set()       |
                            |   if messages[i].tool_results has open_terminal |
                            |   && parsed.session_id not in ref:             |
                            |     dispatchZedOpenTerminal({                  |
                            |       command, cwd, session_id, focus?         |
                            |     })  // via helper, NEVER inline            |
                            |     ref.add(session_id)                        |
                            +-----------------------┬-------------------------+
                                                    │ window CustomEvent
                                                    ▼
                            +-------------------------------------------------+
                            |  TerminalWorkspacesManager (listener)          |
                            |   handleZedOpenTerminal(e)                     |
                            |   ├─ newPanelId = handleSplit('horizontal',    |
                            |   │     targetPanelId, command, cwd,            |
                            |   │     explicitPanelId=session_id)             |
                            |   ├─ activateWorkspacePanel(wsId, newPanelId)   |
                            |   ├─ setFocusedPanelByWorkspace(               |
                            |   │     prev => ({...prev, [wsId]: newPanelId}))|
                            |   └─ if (detail.focus && maximizedView===      |
                            |        'pizarra'):                              |
                            |         updateRightDockState({                  |
                            |           maximized:false,                      |
                            |           maximizedView:'browser' })            |
                            +-------------------------------------------------+

  Parallel for open_url:

  open_url tool (browser.js)
    └─ dispatchZedOpenUrl({ url, label, focus? })  // SSR-safe, NO inline
    └─ execSync('xdg-open …')  // kept as fallback
                              │
                              ▼
  WorkspaceBrowserPane (listener)
   ├─ if (url same as lastRef): bail
   ├─ onDockStateChange(state => ({…state, browserUrl:url,
   │     browserHistory:[…history,url], browserHistoryIndex:N}))
   └─ if (focus && maximizedView==='pizarra'):
        updateRightDockState({maximized:false, maximizedView:'browser',
                              activeTab:'browser'})
```

The 3 fix points are marked: (1) `TerminalWorkspacesManager.handleZedOpenTerminal` adds the focus chain (`activateWorkspacePanel` + `setFocusedPanelByWorkspace` + opt-in pizarra de-max); (2) `ChatPanel` adds a `useRef` of dispatched `session_id`s and drops `.slice(0, -1)` in `handleSend`; (3) `WorkspaceBrowserPane` adds a `useEffect` for `devhub:zed-open-url` with idempotence + opt-in pizarra de-max. All `devhub:zed-*` dispatches go through helpers (`dispatchZedOpenTerminal` in `zedOpenTerminalEvent.js`, `dispatchZedOpenUrl` in the new `zedOpenUrlEvent.js`). No source file outside the helpers is allowed to do `window.dispatchEvent(new CustomEvent('devhub:zed-…', ...))` (ZEB-005; enforced by the test added in slice 4).

## §3. Component design

### §3.1 Visibility (TWM listener + ChatPanel re-fire)

**File `src/components/TerminalWorkspacesManager.jsx`, lines 3715-3736** (the existing `handleZedOpenTerminal`). Before:

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

After:

```jsx
const handleZedOpenTerminal = (e) => {
  if (!isValidZedOpenTerminalEvent(e.detail)) return;
  const { command, cwd, session_id, focus = false } = e.detail;
  const explicitPanelId = resolveZedOpenTerminalPanelId(e.detail, null);

  const targetWsId = activeWsIdRef.current || activeWsId;
  const targetPanelId = activePanelIdsRef.current[targetWsId] || activePanelId;
  if (!targetWsId || !targetPanelId) return;

  console.log(
    `[Zed] Opening terminal command=${command} cwd=${cwd} session_id=${session_id} focus=${focus}`
  );

  const newPanelId = handleSplit(
    'horizontal',
    targetPanelId,
    command,
    cwd || null,
    explicitPanelId
  );
  if (!newPanelId) return;

  applyZedOpenTerminalFocus(
    targetWsId,
    newPanelId,
    { focus },
    {
      activateWorkspacePanel,
      setFocusedPanelByWorkspace,
      updateRightDockState,
      maximizedView: rightDockState?.maximizedView ?? null,
    }
  );
};
```

**New file `src/components/asistente/zedOpenTerminalFocus.js`**. Pure function (no React, no side effects, no `window` access at import time). SSR-safe.

```js
/**
 * T-WSR-zed-001: extract the post-handleSplit focus chain from
 * TerminalWorkspacesManager.handleZedOpenTerminal so it can be unit-tested
 * without mounting the 4 600-line TWM. Pure function — does NOT import
 * React, does NOT touch `window`, does NOT call any state setter.
 *
 * @param {string}   targetWsId  - active workspace id
 * @param {string}   newPanelId  - panel id returned by handleSplit
 * @param {object}   detail      - event detail; reads `focus` (boolean)
 * @param {object}   deps        - the four callables + a snapshot of
 *                                maximizedView (avoids reading React state)
 * @returns {{ activated: boolean, focused: boolean, demaximized: boolean }}
 */
export function applyZedOpenTerminalFocus(
  targetWsId,
  newPanelId,
  detail,
  { activateWorkspacePanel, setFocusedPanelByWorkspace, updateRightDockState, maximizedView }
) {
  if (!targetWsId || !newPanelId) {
    return { activated: false, focused: false, demaximized: false };
  }
  // Always: activate the panel in the active workspace. Same pattern as
  // the existing TWM:1998-2025 helper. The user opens a new panel; it
  // becomes active regardless of `focus` opt-in.
  activateWorkspacePanel(targetWsId, newPanelId);

  const wantFocus = detail && detail.focus === true;
  let focused = false;
  let demaximized = false;

  if (wantFocus) {
    // Clear or update the focused-panel so the new panel is the only one
    // visible in its workspace (the user is asking us to "focus on this").
    setFocusedPanelByWorkspace((prev) => ({ ...prev, [targetWsId]: newPanelId }));
    focused = true;

    // Opt-in pizarra de-maximize. The user opted in by setting focus=true.
    if (maximizedView === 'pizarra') {
      updateRightDockState((current) => ({
        ...current,
        maximized: false,
        maximizedView: 'browser',
      }));
      demaximized = true;
    }
  }

  return { activated: true, focused, demaximized };
}
```

**Pure-function contract.** `applyZedOpenTerminalFocus` is a pure data-in / calls-out function. It does not import React, does not access `window`, and does not read React state. The caller (`handleZedOpenTerminal`) supplies the `deps` snapshot. This makes it trivial to unit-test the 3 focus modes (pizarra-maximized + focus, focused-on-different + focus, default) by passing stub `deps` and asserting the calls.

**SSR-safety.** `zedOpenTerminalFocus.js` never references `window` or any browser global at module scope. It is safe to import from a Server Component or a Node.js test runner.

**File `src/components/asistente/ChatPanel.jsx`, lines 167-191** (the dispatch `useEffect`). Before:

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
    window.dispatchEvent(
      new CustomEvent('devhub:zed-open-terminal', {
        detail: {
          command: parsed?.command || null,
          cwd: parsed?.cwd || null,
          session_id: parsed?.session_id || null,
        },
      })
    );
  }
}, [messages]);
```

After:

```jsx
const dispatchedSessionIdsRef = useRef(new Set());

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
  if (!parsed?.session_id) return;

  // Re-fire guard (ASST-UI-001). The dispatch site MUST NOT fire the
  // event for the same session_id twice — every subsequent messages
  // change re-runs this effect, and the same assistant turn (the one
  // that contains the open_terminal result) would be re-found.
  if (dispatchedSessionIdsRef.current.has(parsed.session_id)) return;
  dispatchedSessionIdsRef.current.add(parsed.session_id);

  dispatchZedOpenTerminal({
    command: parsed?.command || null,
    cwd: parsed?.cwd || null,
    session_id: parsed.session_id,
  });
}, [messages]);
```

**Re-fire guard choice — `useRef` of last dispatched `session_id` (NOT `useEffect([lastMessage])`).** Rationale: a `useRef` of a `Set` is the simplest single-source-of-truth guard. It survives React strict-mode double-invocation (both invocations hit the same ref; the second sees the `session_id` in the set and returns). It does not depend on a derived `lastMessage` value being stable across re-renders. It is trivially testable (render the component, fire 2 messages, read the dispatch spy once). Alternative `useEffect([lastMessage])` would require memoizing `lastMessage` (or making it state) — extra indirection for no benefit. The `Set` grows monotonically per mount; on unmount the ref is GC'd.

**`useRef` strict-mode pattern.** React strict mode in dev double-invokes `useEffect` after mount. With this ref pattern, the FIRST invocation adds the `session_id` to the set; the SECOND invocation finds it and bails. Net effect: exactly one dispatch. This is verified by the new component test in §5.

**Note — `dispatchZedOpenTerminal` is added to `zedOpenTerminalEvent.js`** (the file already exists, see §3.3 for the contract). The new export is a thin wrapper:

```js
export function dispatchZedOpenTerminal(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('devhub:zed-open-terminal', { detail: detail ?? {} }));
}
```

### §3.2 Memory (ChatPanel closure fix)

**File `src/components/asistente/ChatPanel.jsx`, lines 73-82** (the `history` construction inside `handleSend`). Before:

```jsx
try {
  // T-033: send the conversation history (last 20 messages, flattened
  // into the server protocol by `buildZedHistory`). The server prepends
  // it to the per-turn tool loop so the model retains recent context
  // across requests.
  const history = buildZedHistory(
    // Exclude the message we just optimistically appended in
    // setMessages above (line 68-71) — that one is sent as `message`.
    messages.slice(0, -1)
  );
  const response = await fetch('/api/assistant/chat', { … });
```

After:

```jsx
try {
  // T-WSR-zed-002 (ASST-CHAT-001): pass the full closure `messages` to
  // `buildZedHistory`. The closure value is the previous render's state
  // — i.e. it does NOT contain the new user message we just queued via
  // setMessages above. The new user message is sent as the `message`
  // field of the request body, not inside `history`. The server's
  // safeHistory filter (route.js:136-146) caps to 20 entries and the
  // previous assistant turn + its `Tool <name> result: …` lines are
  // preserved verbatim. No duplication: the previous user message
  // (the one from the prior turn) appears once in history; the new
  // user message appears once as `message`.
  const history = buildZedHistory(messages);
  const response = await fetch('/api/assistant/chat', { … });
```

**Closure-fix choice — drop the slice (option 2 from the exploration).** Rationale: smallest diff (1 line), no second source of truth, no extra `useRef`. The closure value of `messages` is the previous render's state — exactly the state the user wants sent as history (the new user message goes in the `message` field, not in `history`). The server's `safeHistory` filter validates role/content and caps to 20.

**ASST-CHAT-001 duplication analysis (the spec-phase risk #4).**

The concern from the spec phase was: dropping `.slice(0, -1)` could cause a duplicate user message. Tracing the flow:

- At the time `handleSend` runs, the closure `messages` is the previous render's state (whatever was last committed to React state). It does NOT include the new user message that was just queued via `setMessages((prev) => [...prev, user2])`.
- `buildZedHistory(messages)` flattens the closure state. The new user message is NOT in this array.
- The request body is `{ message: user2, history: [flattened messages], context: {} }`.
- The new user message `user2` appears exactly once in the body — as the `message` field, NOT inside `history`.

There is no "previous user message duplication" either:

- After the fix, the conversation the model sees is `[...safeHistory, {user, message}]` where `safeHistory` contains exactly the closure-state entries (the previous user message `user1` appears once, the previous assistant turn appears once, and any prior `Tool … result:` lines appear once).
- With or without the slice, the previous user message appears once in the conversation (the slice only removes the LAST entry of the closure, which is the previous assistant turn — not a user message).

**The `safeHistory` 20-cap semantics.** `route.js:136-146` does:

```js
const safeHistory = Array.isArray(history)
  ? history
      .filter(
        (m) =>
          m &&
          typeof m === 'object' &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string'
      )
      .slice(-20)
  : [];
```

This takes the LAST 20 entries that pass the role/content filter. The filter does NOT dedupe by content. With the chosen fix, the input is a `buildZedHistory` output that contains unique messages by construction (the closure value of `messages` is a strictly-growing list; the flatten step does not duplicate). The server then appends `{user, message}` (the new user message) as the last entry, so the conversation is 21 entries max in the worst case. The per-turn tool loop may push more (assistant text + tool results), but those never round-trip via the client's `history` field.

**No second-line fix needed in `route.js`.** The closure value is unique by construction; the filter caps to 20; the new user message is sent only as `message` field. No dedup logic is required. A defensive dedup in the server would be wrong — it could swallow genuinely repeated user messages (e.g. the user pasted the same question twice on purpose).

**Alternative considered and rejected: `useRef` of latest messages, updated in the `setMessages` callback.** Tradeoff: it preserves the `messages.slice(0, -1)` shape (correct slice semantics), but it adds a second source of truth and makes the closure fix a 5-line change instead of a 1-line change. Not worth the complexity.

### §3.3 Open URL parity

**File `src/lib/asistente/tools/browser.js`** (29 lines). Before:

```js
import { execSync } from 'child_process';
import { zedLog } from '../utils/zed-logger';
import { isSafeHttpUrl } from './urlSafety';

export const browserTool = {
  name: 'open_url',
  description: 'Open a URL in the default browser. Only http: and https: schemes are allowed.',
  parameters: {
    url: { type: 'string', required: true, description: 'URL to open' },
    label: { type: 'string', description: 'Label for this URL' },
  },
  async execute(params /* , context */) {
    const { url, label } = params;
    if (!url) return { error: 'url is required' };

    const safety = isSafeHttpUrl(url);
    if (safety.error) return safety;

    zedLog.info('TOOL', 'open_url', { url, label });

    try {
      execSync(`xdg-open "${safety.url}"`, { stdio: 'ignore' });
    } catch {
      // ignore — browser may not be installed; caller still gets opened:true
    }

    return { url: safety.url, opened: true, message: `Browser opened for ${safety.url}` };
  },
};
```

After:

```js
import { execSync } from 'child_process';
import { zedLog } from '../utils/zed-logger';
import { isSafeHttpUrl } from './urlSafety';
import { dispatchZedOpenUrl } from '@/components/zedOpenUrlEvent';

export const browserTool = {
  name: 'open_url',
  description:
    'Open a URL in the default browser (xdg-open fallback) AND dispatch a devhub:zed-open-url CustomEvent so the in-app WorkspaceBrowserPane can navigate. Only http: and https: schemes are allowed.',
  parameters: {
    url: { type: 'string', required: true, description: 'URL to open' },
    label: { type: 'string', description: 'Label for this URL' },
  },
  async execute(params /* , context */) {
    const { url, label, focus = false } = params;
    if (!url) return { error: 'url is required' };

    const safety = isSafeHttpUrl(url);
    if (safety.error) return safety;

    zedLog.info('TOOL', 'open_url', { url, label, focus });

    // In-app navigation event (ZEB-003). dispatchZedOpenUrl is SSR-safe
    // and goes through the helper so dispatch is testable in isolation
    // (ZEB-005). The WorkspaceBrowserPane listener is idempotent on
    // (url, label) so this is safe to call repeatedly.
    dispatchZedOpenUrl({ url: safety.url, label: label ?? null, focus });

    try {
      execSync(`xdg-open "${safety.url}"`, { stdio: 'ignore' });
    } catch {
      // ignore — system browser may not be installed; the in-app pane
      // already navigated, so caller still gets opened:true
    }

    return { url: safety.url, opened: true, message: `Browser opened for ${safety.url}` };
  },
};
```

**New file `src/components/zedOpenUrlEvent.js`** (mirrors `zedOpenTerminalEvent.js`):

```js
/**
 * Helper for the `devhub:zed-open-url` CustomEvent contract (ZEB-003, ZEB-004).
 *
 * Producer: `src/lib/asistente/tools/browser.js` (T-WSR-zed-003) dispatches
 *   `devhub:zed-open-url` with detail `{ url, label, focus }` AFTER the
 *   `isSafeHttpUrl` check, alongside the existing xdg-open fallback. The
 *   system browser still opens (existing behavior preserved) — the in-app
 *   browser pane navigates too, in parallel.
 *
 * Consumer: `src/components/workspace/WorkspaceBrowserPane.jsx`
 *   (T-WSR-zed-003) registers a `useEffect` listener that calls
 *   `onDockStateChange` with the new URL and (when `focus === true` and
 *   pizarra is maximized) de-maximizes pizarra. Idempotent on (url, label)
 *   via a `useRef` of the last applied pair.
 *
 * Pure function surface (validators, resolvers) is testable without a DOM.
 * The dispatch helper is the ONLY place that touches `window.dispatchEvent`
 * for this event name (ZEB-005).
 */

import { isSafeHttpUrl } from '@/lib/asistente/tools/urlSafety';

/**
 * @typedef {object} ZedOpenUrlEventDetail
 * @property {string}      url   - normalized https URL
 * @property {string|null} label - optional human label
 * @property {boolean}     focus - opt-in flag, default false
 */

/**
 * Returns true when the event payload passes the URL safety check.
 * Pure function — does not access `window`. SSR-safe.
 *
 * @param {unknown} detail
 * @returns {boolean}
 */
export function isValidZedOpenUrlEvent(detail) {
  if (!detail || typeof detail !== 'object') return false;
  const safety = isSafeHttpUrl(detail.url);
  return Boolean(safety && safety.url);
}

/**
 * Returns the browser shape id for an event detail, or null when no label
 * is present. Pure function.
 *
 * @param {unknown} detail
 * @returns {string|null}
 */
export function resolveZedOpenUrlBrowserShape(detail) {
  if (!detail || typeof detail !== 'object') return null;
  return typeof detail.label === 'string' && detail.label.length > 0 ? detail.label : null;
}

/**
 * Dispatches `devhub:zed-open-url` on `window`. SSR-safe (no-op when
 * `window` is undefined). This is the ONLY allowed site for an inline
 * `new CustomEvent('devhub:zed-…', …)` for this event name (ZEB-005).
 *
 * @param {{ url: string, label?: string|null, focus?: boolean }} detail
 * @returns {void}
 */
export function dispatchZedOpenUrl(detail) {
  if (typeof window === 'undefined') return;
  const payload = {
    url: detail && typeof detail.url === 'string' ? detail.url : null,
    label: detail && typeof detail.label === 'string' ? detail.label : null,
    focus: Boolean(detail && detail.focus === true),
  };
  if (!payload.url) return; // silently drop malformed payloads
  window.dispatchEvent(new CustomEvent('devhub:zed-open-url', { detail: payload }));
}
```

**Test contract for the new helpers (one line each):**

- `isValidZedOpenUrlEvent({ url: 'https://x' })` → `true`
- `isValidZedOpenUrlEvent({ url: 'javascript:alert(1)' })` → `false` (because `isSafeHttpUrl` rejects)
- `resolveZedOpenUrlBrowserShape({ label: 'repo' })` → `'repo'`
- `resolveZedOpenUrlBrowserShape({})` → `null`
- `dispatchZedOpenUrl({ url: 'x' })` with `window === undefined` → no throw
- `dispatchZedOpenUrl({ url: 'x' })` with a real `window` → exactly one `CustomEvent` of type `devhub:zed-open-url` with `detail.url === 'x'`

**Reconciling terminology with the actual `WorkspaceBrowserPane` API surface (spec risk #2).**

The spec uses `commitBrowserNavigation` / `spawnBrowser` / `updateElement` — none of which exist on `WorkspaceBrowserPane`. The actual API surface (read from `src/components/workspace/WorkspaceBrowserPane.jsx` lines 64-81, 459-469, 729-734) is:

- State is **read from `dockState` props** (an object owned by the parent TWM).
- State is **mutated via `onDockStateChange((currentState) => nextState)`** — a callback that takes a state updater function (current → next).
- The dedicated Tauri WebviewWindow flow uses `onBrowserWindowStateChange(workspaceId, { open, label, url, updatedAt })` — but this is for spawning a SEPARATE OS window, not for navigating the in-app browser pane.

**Canonical API surface (chosen):**

| Spec term                                          | Actual call                                                                                                                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commitBrowserNavigation(url)`                     | `onDockStateChange((state) => ({ ...state, browserUrl: url, browserHistory: [...(state.browserHistory ?? []), url], browserHistoryIndex: (state.browserHistory?.length ?? 0) }))`                                     |
| `spawnBrowser({ url, label })`                     | Not applicable — `WorkspaceBrowserPane` does NOT manage a multi-shape browser tree. The single in-app pane is the "browser"; `label` is a free-form string we store alongside the URL in `dockState` for idempotence. |
| `updateElement(id, { url })`                       | Same `onDockStateChange` shape; the listener uses the `label` from the event detail to find a "shape" (which is, in this codebase, just `(url, label)` in a `useRef`).                                                |
| `onBrowserWindowStateChange(workspaceId, { url })` | Used for the dedicated Tauri WebviewWindow. We do NOT call this from the new listener — it would spawn an OS window, which is NOT the user-facing "navigate in-app" behavior.                                         |

**Terminology reconciliation rationale.** The codebase does NOT have a multi-shape browser tree; it has a single `WorkspaceBrowserPane` with one in-app iframe + an optional dedicated Tauri WebviewWindow. The new listener does ONE thing: navigate the existing in-app pane to the URL. The `label` field in the event is used purely for idempotence keying, not for selecting a "shape". The spec language (`spawnBrowser`, `updateElement`) was a misreading; the canonical call is `onDockStateChange` with the URL inlined. This is documented in §9 as an open question for the spec maintainer (the BBP-001/002/003 scenarios should be reworded once design lands).

**New useEffect in `WorkspaceBrowserPane.jsx`** (the actual file: `src/components/workspace/WorkspaceBrowserPane.jsx`, before the existing `handleRuntimeReload` at line 274).

Before (no listener — file is unchanged from current state at the new insertion point):

```jsx
// (no `devhub:zed-open-url` listener exists in the file today)
```

After (inserted between the existing `useEffect(() => { /* clear browserLoadFallback */ }, [])` at line 263-270 and the `handleRuntimeReload` at line 274):

```jsx
// T-WSR-zed-003 (BBP-001/BBP-002/BBP-003/BBP-004): listen for
// `devhub:zed-open-url` so the in-app browser pane navigates when
// Zed calls `open_url`. Idempotent on (url, label) so repeated
// dispatches (model retry, user re-asks) do not re-fire navigation
// or stack the browser history.
const lastAppliedUrlRef = useRef({ url: null, label: null });
useEffect(() => {
  const handler = (e) => {
    if (!isValidZedOpenUrlEvent(e.detail)) return;
    const { url, label, focus = false } = e.detail;
    const last = lastAppliedUrlRef.current;
    if (last.url === url && (last.label ?? null) === (label ?? null)) {
      // Same (url, label) as the last applied dispatch — no-op.
      return;
    }

    onDockStateChange?.((currentState) => ({
      ...currentState,
      browserUrl: url,
      browserHistory: [...(currentState.browserHistory ?? []), url],
      browserHistoryIndex: currentState.browserHistory?.length ?? 0,
    }));
    lastAppliedUrlRef.current = { url, label: label ?? null };

    if (focus === true && rightDockState?.maximizedView === 'pizarra') {
      onDockStateChange?.((currentState) => ({
        ...currentState,
        maximized: false,
        maximizedView: 'browser',
        activeTab: 'browser',
      }));
    }
  };

  window.addEventListener('devhub:zed-open-url', handler);
  return () => window.removeEventListener('devhub:zed-open-url', handler);
}, [onDockStateChange, rightDockState?.maximizedView]);
```

**Notes on the listener pattern.**

- The idempotence `useRef` is keyed on `(url, label)`, not on the dispatch event itself. So a SECOND event with the SAME `(url, label)` is a no-op (BBP-002 first scenario). A different URL with the same label navigates the existing browser (BBP-002 second scenario — because `label` matches, we just update the URL; we do NOT spawn).
- `rightDockState` is the prop the parent TWM passes in. We read `maximizedView` from it for the BBP-004 opt-in de-max check. The dependency array only tracks `rightDockState?.maximizedView` (not the whole `rightDockState` object) so the listener re-registers only when the relevant field changes.
- We do NOT call `onBrowserWindowStateChange` from this listener — that would spawn a Tauri WebviewWindow, which is not the "navigate the in-app pane" behavior the spec wants.

### §3.4 System prompt tweak

**File `docs/prompts/asistente/zed-system-prompt.md`, line 65** (just after the "After tool execution" bullet list). Before:

```
### After tool execution

When a `TOOL: <name>` block in a previous turn was followed by a tool result, your next response MUST interpret that result, not re-ask the user. Examples:

- If `open_terminal` returned `{ id, port, wsPath }`, confirm what you opened and what to do next — do not ask "do you want me to open a terminal?".
- If `list_terminals` returned the active sessions, summarize them and propose the next action.

Only ask a clarifying question if the tool result is genuinely missing required context.
```

After (the bullet list stays; one bullet is APPENDED):

```
### After tool execution

When a `TOOL: <name>` block in a previous turn was followed by a tool result, your next response MUST interpret that result, not re-ask the user. Examples:

- If `open_terminal` returned `{ id, port, wsPath }`, confirm what you opened and what to do next — do not ask "do you want me to open a terminal?".
- If `list_terminals` returned the active sessions, summarize them and propose the next action.

Only ask a clarifying question if the tool result is genuinely missing required context.

### Prior-turn context (T-WSR-zed-002)

When prior turns are present in the conversation, treat them as user-visible context. If the user references something from a prior turn (e.g., "that terminal", "the previous command", "esa terminal", "el archivo anterior"), use the history to resolve the reference rather than asking again. In particular: a previous `open_terminal` tool result includes the `session_id` you must reuse with `execute_in_terminal` — do NOT call `open_terminal` again when a session already exists.
```

**Why this is a 2-line addition (not 5+).** The prompt is already 215 lines; we add 1 prose paragraph and 1 imperative clause. The new "Prior-turn context" section is reachable from the table of contents and discoverable by the test that asserts on substring `"treat them as user-visible context"` (ASST-CHAT-003 second scenario).

## §4. Data contracts

```ts
// devhub:zed-open-terminal
// Dispatcher: ChatPanel (via dispatchZedOpenTerminal helper)
// Consumer:   TerminalWorkspacesManager (handleZedOpenTerminal)
type ZedOpenTerminalDetail = {
  session_id: string; // REQUIRED — PTY session id from ttyServer
  command?: string | null; // initial command, or null for empty shell
  cwd?: string | null; // working directory, or null to inherit
  port?: number; // PTY port (informational)
  wsPath?: string; // /terminal websocket path
  program?: string; // zsh | bash | opencode | ...
  command_sent?: string; // the command that was actually run
  focus?: boolean; // OPT-IN (default false): de-max pizarra + focus panel
  explicitPanelId?: string; // visual panel id (defaults to session_id)
};
```

```ts
// devhub:zed-open-url
// Dispatcher: browserTool.execute (via dispatchZedOpenUrl helper)
// Consumer:   WorkspaceBrowserPane (new useEffect)
type ZedOpenUrlDetail = {
  url: string; // REQUIRED — normalized https URL
  label?: string | null; // optional human label, used for idempotence key
  focus?: boolean; // OPT-IN (default false): de-max pizarra
};
```

Both detail objects are documented in the helper modules' JSDoc, exported via `zedOpenTerminalEvent.js` and `zedOpenUrlEvent.js`. Validators (`isValidZedOpenTerminalEvent`, `isValidZedOpenUrlEvent`) and resolvers (`resolveZedOpenTerminalPanelId`, `resolveZedOpenUrlBrowserShape`) are the public API. Dispatchers (`dispatchZedOpenTerminal`, `dispatchZedOpenUrl`) are the ONLY places that call `window.dispatchEvent(new CustomEvent('devhub:zed-…'))` (ZEB-005).

## §5. Testing strategy

**Unit (Jest / next test, no DOM):**

| Test                            | File                                                                  | Asserts                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applyZedOpenTerminalFocus`     | NEW `src/components/asistente/__tests__/zedOpenTerminalFocus.test.js` | Pure function. 4 cases: (a) `focus: true` + `maximizedView: 'pizarra'` → activates + focuses + demaximizes. (b) `focus: true` + `maximizedView: 'browser'` → activates + focuses, NO demax. (c) `focus: undefined` → activates, NO focus, NO demax. (d) Empty `targetWsId` → returns `{ activated: false, … }` and does NOT call any dep. |
| `dispatchZedOpenUrl` SSR-safety | NEW `src/components/__tests__/zedOpenUrlEvent.test.js`                | (a) `window === undefined` → no throw. (b) `window` defined → exactly one `CustomEvent` of type `devhub:zed-open-url` with `detail.url === input.url`.                                                                                                                                                                                    |
| `isValidZedOpenUrlEvent`        | same file                                                             | (a) `{ url: 'https://x' }` → true. (b) `{ url: 'javascript:alert(1)' }` → false. (c) `null` → false.                                                                                                                                                                                                                                      |
| `resolveZedOpenUrlBrowserShape` | same file                                                             | (a) `{ label: 'repo' }` → `'repo'`. (b) `{}` → `null`.                                                                                                                                                                                                                                                                                    |
| `buildZedHistory` integration   | EXTEND `src/components/asistente/__tests__/buildZedHistory.test.js`   | New test: 2-turn input — `messages = [welcome, user1, assistant1(tool_results:[open_terminal{session_id:'term-X'}])]`, assert output contains the assistant turn AND the `Tool open_terminal result: {"session_id":"term-X"}` line. This is the snapshot the closure fix relies on.                                                       |
| System prompt                   | EXTEND `src/lib/asistente/__tests__/zedSystemPrompt.test.js`          | New test: prompt body contains substring `"treat them as user-visible context"` (ASST-CHAT-003).                                                                                                                                                                                                                                          |

**Component (JSDOM + createRoot + flushSync, no RTL):**

| Test                         | File                                                                           | Asserts                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Re-fire guard                | EXTEND `src/components/asistente/__tests__/ChatPanel.test.jsx`                 | Send 1st message (gets assistant with `open_terminal{session_id:'term-1'}`). Send 2nd message. Assert `dispatchEvent` was called with `devhub:zed-open-terminal` exactly ONCE.                                                                                                                                                                                                                                  |
| Memory body                  | EXTEND same file                                                               | Stub `fetch` to capture the body of the 2nd send. Assert the captured body includes the previous `Tool open_terminal result:` line. Assert the new user message appears in `message` (not duplicated inside `history`).                                                                                                                                                                                         |
| Idempotent URL listener      | NEW `src/components/workspace/__tests__/WorkspaceBrowserPane.openUrl.test.jsx` | (a) Render `WorkspaceBrowserPane` with a stub `onDockStateChange`. Dispatch `devhub:zed-open-url` with `{url:'https://github.com',label:'repo'}` twice. Assert `onDockStateChange` was called once with `browserUrl:'https://github.com'`. (b) Dispatch a SECOND event with `{url:'https://gitlab.com',label:'repo'}` — assert `onDockStateChange` called with `browserUrl:'https://gitlab.com'` (no re-spawn). |
| Listener registered on mount | same file                                                                      | Assert `window.addEventListener('devhub:zed-open-url', …)` was called on mount, `removeEventListener` on unmount.                                                                                                                                                                                                                                                                                               |
| Pizarra opt-in               | same file                                                                      | (a) Render with `dockState.maximizedView='pizarra'`, dispatch event WITHOUT `focus` → assert `onDockStateChange` not called with `maximized:false`. (b) Same render, dispatch event WITH `focus:true` → assert `onDockStateChange` called with `maximized:false, maximizedView:'browser'`.                                                                                                                      |

**No component test for the TWM listener.** TWM is 4 600 lines with many heavy dependencies; the existing test pattern in this repo (`TerminalWorkspacesManager.*.test.jsx` files) tests single hooks in isolation. We follow the same pattern by extracting the post-`handleSplit` logic into the pure `applyZedOpenTerminalFocus` function (covered by unit tests above). The full listener integration is covered by the E2E suite (below), which mounts the real page and asserts on the active panel id in `localStorage.devhub_terminal_state:*`.

**E2E (Playwright, no Tauri runtime — `__TAURI_INTERNALS__` is undefined):**

| Test                                        | File                                              | Asserts                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visibility after `devhub:zed-open-terminal` | EXTEND `tests/e2e/06_zed_open_terminal.spec.ts`   | Seed `localStorage.devhub_terminal_state` with `activePanelIds:{ws9:'p1'}`. Mock `/api/assistant/chat` to return `open_terminal{session_id:'term-test-123'}`. Send a chat turn. After settle, assert `localStorage.devhub_terminal_state` has been mutated and `activePanelIds[ws9]` is now a new panel id (not `'p1'`). The E2E uses the same `page.evaluate(() => window.localStorage.getItem('devhub_terminal_state:project-1'))` pattern as the existing 06 test. |
| Re-fire guard in E2E                        | same file                                         | Send 1st message (gets open_terminal). Send 2nd message. Assert `window.__lastZedOpenTerminalEvent` (the existing init-script hook) was assigned exactly once. Reuse the same `__lastZedOpenTerminalEvent` spy from the existing 06 test.                                                                                                                                                                                                                             |
| URL listener in E2E                         | NEW `tests/e2e/07_zed_open_url.spec.ts`           | Mirror structure of 06. Add an `addInitScript` hook `window.__lastZedOpenUrlEvent` that records dispatched events. Send a chat turn where the mock returns `open_url{url:'https://github.com',label:'repo'}`. Assert the hook fired once with the right detail. Send a 2nd message with the SAME URL → assert the hook fired ONLY ONCE (idempotence in real browser).                                                                                                 |
| No-inline-dispatch scanner                  | NEW `tests/spec/zed-event-bus-namespace.test.mjs` | Globs `src/components/`, `src/lib/`, `src/app/` for the regex `window\.dispatchEvent\(\s*new\s+CustomEvent\(\s*['"]devhub:zed-`. Asserts the only matches are inside `zedOpenTerminalEvent.js` or `zedOpenUrlEvent.js`. (This is the ZEB-005 enforcement — see §7 risk 3 for why we picked a CI scanner over ESLint.)                                                                                                                                                 |

**Total test budget:** ~250 LOC across unit + component + E2E (matches the proposal's preflight estimate).

## §6. Phasing (within the single PR)

| Slice                                   | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Impl LOC | Test LOC |      Net |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------: | -------: | -------: |
| **1 — Visibility + re-fire guard**      | `TerminalWorkspacesManager.jsx` (~12 lines: invoke `applyZedOpenTerminalFocus` from listener); `ChatPanel.jsx` (~5 lines: `dispatchedSessionIdsRef` + early-return + use of `dispatchZedOpenTerminal`); `zedOpenTerminalEvent.js` (~5 lines: new `dispatchZedOpenTerminal` export); NEW `src/components/asistente/zedOpenTerminalFocus.js` (~30 lines); NEW `src/components/asistente/__tests__/zedOpenTerminalFocus.test.js` (~50 lines); EXTEND `src/components/asistente/__tests__/ChatPanel.test.jsx` (~30 lines for the re-fire test) |      ~52 |      ~80 | **+132** |
| **2 — Memory + system prompt**          | `ChatPanel.jsx` (1 line: drop `.slice(0, -1)`); `zed-system-prompt.md` (~6 lines: new "Prior-turn context" section); EXTEND `src/components/asistente/__tests__/ChatPanel.test.jsx` (~30 lines: 2-turn memory body test); EXTEND `src/components/asistente/__tests__/buildZedHistory.test.js` (~15 lines: 2-turn integration scenario); EXTEND `src/lib/asistente/__tests__/zedSystemPrompt.test.js` (~5 lines: substring assertion)                                                                                                       |       ~7 |      ~50 |  **+57** |
| **3 — `open_url` parity**               | `browser.js` (~3 lines: import + dispatch call); NEW `src/components/zedOpenUrlEvent.js` (~55 lines: helpers + JSDoc); `WorkspaceBrowserPane.jsx` (~30 lines: new useEffect); EXTEND `src/lib/asistente/__tests__/tools/browser.test.js` (~10 lines: assert dispatch fired); NEW `src/components/__tests__/zedOpenUrlEvent.test.js` (~35 lines: validator + resolver + dispatch tests); NEW `src/components/workspace/__tests__/WorkspaceBrowserPane.openUrl.test.jsx` (~60 lines: mount/unmount + idempotence + pizarra opt-in)           |      ~88 |     ~105 | **+193** |
| **4 — E2E with stubs + namespace scan** | EXTEND `tests/e2e/06_zed_open_terminal.spec.ts` (~30 lines: visibility + re-fire assertions); NEW `tests/e2e/07_zed_open_url.spec.ts` (~50 lines: mirror 06); NEW `tests/spec/zed-event-bus-namespace.test.mjs` (~30 lines: glob + assert)                                                                                                                                                                                                                                                                                                 |       ~5 |     ~110 | **+115** |
| **Total**                               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | **~152** | **~345** | **+497** |

497 net < 800 cap (D2). Per-slice commits:

1. `feat(zeb): visibility + re-fire guard (slice 1)`
2. `feat(zeb): memory + system-prompt prior-turn clause (slice 2)`
3. `feat(zeb): open_url parity + idempotent listener (slice 3)`
4. `test(zeb): e2e visibility + re-fire + namespace scan (slice 4)`

Each commit is independently buildable and `npm test`-able (slices 1-3 add new tests as they go; slice 4 only adds E2E).

## §7. Risks and mitigations

| #   | Risk                                                                                                                                                                                                                            | Likelihood | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Spec baseline gap (`asistente-ui` / `asistente-chat` have no `openspec/specs/` baseline).** Archive will not have a destination to merge the deltas into.                                                                     |       High | **Action for archive phase:** the archive step MUST create new capability files at `openspec/specs/asistente-ui/spec.md` and `openspec/specs/asistente-chat/spec.md` from these deltas (not the usual "delta into existing spec" flow). The baseline content is: the unchanged intro + the full REQ list from the ADDED sections of the two deltas (ASST-UI-001..004 for UI, ASST-CHAT-001..004 for chat). Documented in the rollout doc.                                                                                                                                                                                                                                                                                                                                                                                         |
| 2   | **Terminology mismatch (`commitBrowserNavigation` / `spawnBrowser` / `updateElement` do NOT exist on `WorkspaceBrowserPane`).** Spec language is misleading; the actual API is `onDockStateChange` + a `(url, label)` `useRef`. |   Resolved | **Decision (§3.3):** the canonical call is `onDockStateChange((state) => ({ ...state, browserUrl: url, browserHistory: […], browserHistoryIndex: N }))`. The `label` is idempotence keying, NOT a "shape selector" — `WorkspaceBrowserPane` has no multi-shape tree. The spec maintainer should reword the BBP-001/002/003 scenarios once design lands (see §9 open question).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3   | **No lint rule for "no inline dispatch outside helpers" (ZEB-005).** Three options: (a) ESLint `no-restricted-syntax`, (b) CI scan script, (c) status quo (code review).                                                        |     Medium | **Decision: option (b) — `tests/spec/zed-event-bus-namespace.test.mjs` CI scan.** Rationale: (a) ESLint `no-restricted-syntax` with a custom AST matcher is fragile in this repo (existing ESLint config is flat-config; adding a custom rule requires a separate plugin package, not just config — too heavy for one check); (b) a `node:test` script that globs + greps runs on every `npm test`, is a real test that fails CI when violated, requires no new tooling, and is straightforward to extend (one regex, one allow-list). The script lives in `tests/spec/` (next to existing E2E tests, in the same runner) and is run by `npm test` via the existing test pipeline. (c) status quo is what we have today and the source has 1 inline dispatch (`ChatPanel.jsx:181-189`) — that proves the status quo doesn't work. |
| 4   | **ASST-CHAT-001 duplication risk** (the spec asserts the new user message is not duplicated; the chosen fix drops `.slice(0, -1)`).                                                                                             |        Low | **Resolved (no second-line fix needed).** The closure `messages` is the previous render's state, which does NOT contain the new user message that was just queued via `setMessages`. The new user message is sent only as the `message` field of the request body. The `safeHistory` filter (route.js:136-146) caps to 20 entries and the conversation seed is `[...safeHistory, {user, message}]` — no dedup needed because the flatten step does not produce duplicates by construction (the closure value is a strictly-growing list). A defensive dedup in the server would be wrong (it could swallow genuinely repeated user messages). Documented in §3.2.                                                                                                                                                                 |
| 5   | **`useRef` re-fire guard vs. React strict mode (effects fire twice in dev).**                                                                                                                                                   |        Low | **Documented pattern (§3.1).** React strict mode double-invokes `useEffect` after mount. With this ref pattern, the FIRST invocation adds the `session_id` to the set; the SECOND invocation finds it and bails. Net effect: exactly one dispatch per `session_id`. Verified by the new component test in §5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 6   | **`devhub:zed-open-url` dispatch with invalid URL.**                                                                                                                                                                            |        Low | The browser tool runs `isSafeHttpUrl` BEFORE calling `dispatchZedOpenUrl` (the order is in §3.3). The `dispatchZedOpenUrl` helper ALSO re-validates (defensive: `dispatchZedOpenUrl({ url: 'javascript:…' })` is silently dropped — `if (!payload.url) return;`). The trust boundary: the browser tool is server-controlled (it runs in the tool loop, not in the user-controlled dispatch path); the helper's re-validation is a belt-and-suspenders guard for future dispatchers.                                                                                                                                                                                                                                                                                                                                               |
| 7   | **CustomEvent helper modules MUST NOT import React.**                                                                                                                                                                           |        Low | **Documented contract.** `zedOpenTerminalEvent.js`, `zedOpenUrlEvent.js`, and the new `zedOpenTerminalFocus.js` are pure JS — no `import … from 'react'`, no JSX, no hooks. This is verified by inspection during review and by the absence of any React-specific code in the files.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 8   | **`handleSplit` return value timing.** `handleSplit` returns `newPanelId` from a `useState` callback; calling `activateWorkspacePanel` immediately afterward may batch into the same render.                                    |        Low | `activateWorkspacePanel` is the existing pattern (TWM:2008-2035) and works in the same tick for other call sites. No new state shape. The new useRef + activateWorkspacePanel + setFocusedPanelByWorkspace chain is identical in structure to other listeners that update multiple state slots in one event.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 9   | **The 4-slice budget could be exceeded by tests (+345 LOC estimated).**                                                                                                                                                         |     Medium | If slice 4 (E2E) exceeds budget, defer to a follow-up. Slices 1-3 are self-contained.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 10  | **The Tauri `__TAURI_INTERNALS__` import paths in TWM may throw in E2E.**                                                                                                                                                       |        Low | Already wrapped in `try { const { … } = await import('@tauri-apps/api/window'); } catch { return null; }` (TWM:3762-3767). Playwright chromium has no `__TAURI_INTERNALS__`; the catch path runs and the E2E exercises the no-op branch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## §8. Rollback plan

1. **Revert single squash-merge commit** on `feature/session-workspace-restore`. Each slice is a single commit, so a partial revert is possible: `git revert <slice-1-sha>` for visibility-only rollback, etc.
2. **No data migrations, no env var additions, no new dependencies.** The change is pure client-side wiring + a 2-line prompt clause. The new helper files (`zedOpenTerminalFocus.js`, `zedOpenUrlEvent.js`) are additive imports.
3. **The `devhub:zed-open-url` event is additive**: if the listener is removed from `WorkspaceBrowserPane`, the event simply has no consumer; `browser.js` still falls back to `xdg-open`. No caller breaks.
4. **The closure fix is a 1-line change** (`messages.slice(0, -1)` → `messages`). If it surfaces a pre-existing model confusion, reverting restores the old behavior; the user reports "no memory" symptom returns. The system-prompt addition in §3.4 is independent and can be kept (it does not hurt if the slice is reverted).
5. **The re-fire guard** can be disabled by removing the `dispatchedSessionIdsRef` check; the listener fires on every `messages` change (old behavior). To verify, comment out the `if (dispatchedSessionIdsRef.current.has(...)) return;` line in `ChatPanel.jsx`.
6. **Additional point: if the closure fix breaks model behavior** (e.g. the model gets confused by seeing the previous user message in history), revert `ChatPanel.jsx` only (the 1-line `buildZedHistory` change) and re-archive the visibility + `open_url` changes. The system-prompt tweak in §3.4 is also re-archived as part of the visibility commit (it lives in `docs/prompts/asistente/zed-system-prompt.md`, not in `ChatPanel.jsx`, so it survives the `ChatPanel.jsx`-only revert).
7. **Smoke verification after any slice**: send a chat turn containing `open_terminal` and `open_url`; assert the new panel is visible and the browser pane navigates. The E2E in slice 4 covers this.

## §9. Open questions

1. **`asistente-ui` / `asistente-chat` baseline gap (risk #1).** The spec phase already flagged this. The archive step MUST create `openspec/specs/asistente-ui/spec.md` and `openspec/specs/asistente-chat/spec.md` from the deltas (not the usual "delta into existing spec" flow). Apply-phase does not need to do anything special; the archive command in OpenSpec may need a flag or a custom command. This is for the archive phase to verify, not for apply to resolve.

2. **Spec language for `WorkspaceBrowserPane` (risk #2).** The spec uses `commitBrowserNavigation` / `spawnBrowser` / `updateElement` — none of which exist. The design reconciles to `onDockStateChange` + `useRef` of `(url, label)`. Apply should NOT add a "multi-shape browser" abstraction; the codebase has a single in-app browser pane. If the user wants multi-shape later, that is a separate change. The spec maintainer (whoever promotes this change) should reword BBP-001/002/003 to use the actual API names.

3. **`explicitPanelId` field on `devhub:zed-open-terminal`.** The current dispatch (in `ChatPanel.jsx:181-189`) does NOT pass `explicitPanelId` — `resolveZedOpenTerminalPanelId` is called in the listener and falls back to `session_id` via `e.detail.session_id`. The new data contract in §4 includes `explicitPanelId` for the T-029b thread. Apply should NOT change the dispatch shape (keep the current `command, cwd, session_id` detail); the `explicitPanelId` field is documentation-only for future producers. (Verified by reading the existing dispatch site — `command`, `cwd`, `session_id` are the only fields passed today.)

4. **Idempotence key shape (risk #2 follow-up).** The new listener uses `(url, label)` as the idempotence key. If a user dispatches the SAME URL with TWO different labels, the second event will NOT be a no-op (it will navigate again). This matches the spec's "new URL with the same label navigates the existing browser" scenario. If the user wants stronger idempotence (key on URL only), the change is 1 line. Open question for the spec maintainer: should the key be `(url)` or `(url, label)`?

5. **System-prompt clause strength (risk #6 follow-up).** The 2-line addition in §3.4 tells the model to use history for anaphoric resolution. The exploration noted that the existing "After tool execution" section already covers the "do not re-verify" rule. The new clause is additive. If the model STILL re-issues `open_terminal` after the fix, the next escalation is to add a NEGATIVE example ("❌ WRONG: TOOL: open_terminal after a previous open_terminal returned a session_id"). Defer to a follow-up; the design does not add a negative example because the prompt is already 215 lines.

6. **TWM `rightDockState` ref vs. prop.** The new `useEffect` in `WorkspaceBrowserPane` reads `rightDockState?.maximizedView` from props. The dependency array tracks only that field. If TWM is ever refactored to pass `rightDockState` via a ref (not a prop), the dependency array must be updated. Open question for the apply phase: confirm the current prop-passing pattern is stable; if not, use a ref mirror.

7. **The `dispatchZedOpenTerminal` helper is a NEW export on `zedOpenTerminalEvent.js`.** The existing exports (`isValidZedOpenTerminalEvent`, `resolveZedOpenTerminalPanelId`) are tested in `src/components/__tests__/zedOpenTerminalEvent.test.js`. Apply should ADD tests for the new `dispatchZedOpenTerminal` in the same file, not create a separate file. (Per §5, the new test for `dispatchZedOpenUrl` lives in `zedOpenUrlEvent.test.js` because the helper is in a new file.)

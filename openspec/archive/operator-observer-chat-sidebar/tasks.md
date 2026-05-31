# Tasks: Operator Observer Chat Sidebar

**Change:** `operator-observer-chat-sidebar`
**Author:** SDD Phase — tasks
**Status:** Draft
**Created:** 2026-05-30
**Based on:** `design.md` + `spec.md`

---

## Task List

Tasks are ordered by dependency. Each task is one work-unit commit.

| # | Label | File targets | Key acceptance |
|---|---|---|---|
| 1 | `getOperatorSidebarModel()` in swarmControl | `src/lib/operations/swarmControl.js` | Returns typed feed items + progress + watermark |
| 2 | Normalize events API for sidebar | `src/app/api/agenthub/events/route.js` | SSE emits typed feed-item payloads |
| 3 | WorkspaceOperatorObserverPane shell | `src/components/workspace/WorkspaceOperatorObserverPane.jsx` | Mount, initial load, SSE/polling, feed state |
| 4 | OperatorFeedItem — all 6 type renderers | `src/components/workspace/OperatorFeedItem.jsx` | Correct visual per type |
| 5 | OperatorComposer with submit flow | `src/components/workspace/OperatorComposer.jsx` | Enter submit, optimistic append, error banner |
| 6 | Hook up operator tab in WorkspaceRightDock | `src/components/workspace/WorkspaceRightDock.jsx` | Tab switch renders pane |
| 7 | Wire Operator tab in TerminalWorkspacesManager | `src/components/TerminalWorkspacesManager.jsx` | Tab lifecycle (open/close/resize) |
| 8 | Edge cases + integration smoke | `src/components/workspace/WorkspaceOperatorObserverPane.jsx` | Empty session, reconnect, retry, session-end |

---

## Task 1 — `getOperatorSidebarModel()` in swarmControl.js

**File:** `src/lib/operations/swarmControl.js`

**Description:**

Add the `getOperatorSidebarModel()` selector to `swarmControl.js`. It reads the active mission's transcript from `swarmMissions.js`, recent action log entries, and progress step state, normalizes them into the `FeedItem` union type, and returns the full envelope including `watermark` and `hasMore`.

**Implementation details:**

- Accept `{ sessionId, watermark, limit = 200 }` parameters
- Look up the active mission by `sessionId` (or fall back to the single active mission if `sessionId` is null)
- Filter `transcript` messages by role `'operator'` and `'agent'` → map to `operator-prompt` / `agent-reply` items
- Read recent action log entries → map to `action-executed` items with `startedAt`, `completedAt`, `status`, `error`
- Derive `progress` from `swarmMissions.getMissionSteps({ mission_id })` — latest active step → `progress-active`, completed steps → `progress-done`, failed → `progress-failed`
- Sort all items by `occurredAt` ascending
- Compute `watermark` as the last item's `occurredAt`
- Set `hasMore = true` if the total raw items before truncation exceed `limit`
- If no active mission found, return `{ sessionId: null, feedItems: [], progress: null, watermark: null, hasMore: false }`

**Acceptance criteria:**
- Calling with `watermark: null` returns full initial load (up to `limit` items)
- Calling with a `watermark` returns only items newer than that timestamp
- All returned items have an `id`, a `type` in the `FeedItem` union, and an `occurredAt` field
- Empty session returns a valid envelope with empty `feedItems`

---

## Task 2 — Normalize events API for sidebar (SSE)

**File:** `src/app/api/agenthub/events/route.js` (or appropriate route)

**Description:**

Extend the existing events stream to emit SSE events in the typed `FeedItem` schema that `WorkspaceOperatorObserverPane` consumes. When an agent action fires or a step transitions, emit a typed SSE event with `type: 'feed-item'` and the normalized payload.

**Implementation details:**

- Inspect the existing events route to understand its stream format
- Add a new event type `feed-item` that wraps any action-contract update or step transition as a `FeedItem`
- Events must carry `{ type: 'feed-item', payload: FeedItem, occurredAt: string (ISO), sessionId: string }`
- Add `progress-update` type for step-level changes
- Add `session-end` type when the mission completes or fails
- Use the existing SSE infrastructure (response stream with `text/event-stream` content-type)
- Handle the `GET` stream and emit on DB write events (hook into `swarmMissions` insert/update, or poll-refresh the stream buffer)

**Acceptance criteria:**
- SSE clients can subscribe and receive typed `feed-item`, `progress-update`, and `session-end` events
- Payload shape matches the `FeedItem` schema defined in design.md
- SSE connection closes cleanly on client disconnect

---

## Task 3 — WorkspaceOperatorObserverPane (shell + feed state + live updates)

**File:** `src/components/workspace/WorkspaceOperatorObserverPane.jsx`

**Description:**

Build the main pane component. This is the shell task — it wires up the feed state, SSE/polling fallback, initial load via `getOperatorSidebarModel()`, error banner slot, and the composer slot. The sub-components `OperatorFeedItem` and `OperatorComposer` are stubbed or imported and used here.

**Implementation details:**

```jsx
function WorkspaceOperatorObserverPane({ sessionId, onClose }) {
  const [feedItems, setFeedItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const feedEndRef = useRef(null);

  // 1. Initial load on mount
  useEffect(() => {
    const initial = await getOperatorSidebarModel({ sessionId, watermark: null });
    setFeedItems(initial.feedItems);
    // Start SSE or polling here
  }, [sessionId]);

  // 2. SSE connection — open on mount, close on unmount
  // On SSE 'feed-item': setFeedItems(prev => [...prev, payload])
  // On SSE 'progress-update': update or append progress item
  // On SSE 'session-end': disable composer, freeze feed

  // 3. Polling fallback — every 2s, diff with last watermark
  // useEffect with setInterval, clear on SSE open or unmount

  // 4. Auto-scroll
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feedItems]);

  // 5. handleSubmit — calls persistMissionControlComposerMessage,
  //    on success sets submitError(null); on failure sets submitError(msg)

  // 6. handleRetry — re-fires the last failed submit

  return (
    <div className="flex flex-col h-full">
      <OperatorFeed feedItems={feedItems} feedEndRef={feedEndRef} />
      {submitError && <OperatorErrorBanner message={submitError} onRetry={handleRetry} />}
      <OperatorComposer onSubmit={handleSubmit} disabled={isSubmitting} />
    </div>
  );
}
```

- Use `aria-label="Operator session feed"` on the scrollable feed container
- Import `getOperatorSidebarModel` from `swarmControl.js`
- Import `persistMissionControlComposerMessage` for submit
- Auto-scroll is suppressed when user has scrolled up (track `scrollTop > 0`)
- Empty state: when `feedItems.length === 0`, render a placeholder message
- No active session state: render `"No active session. Start a swarm to see the operator feed."`

**Acceptance criteria:**
- Pane mounts and shows initial feed items on tab switch
- New SSE events append to the feed without full re-render
- SSE failure triggers 2s polling with a subtle "reconnecting..." indicator
- Empty session shows placeholder; composer remains functional
- Session end freezes feed and disables composer

---

## Task 4 — OperatorFeedItem — all 6 type renderers

**File:** `src/components/workspace/OperatorFeedItem.jsx`

**Description:**

Type-dispatched renderer for all six `FeedItem` variants: `operator-prompt`, `agent-reply`, `action-executed`, `progress-active`, `progress-done`, `progress-failed`.

**Implementation details:**

Export a single `OperatorFeedItem({ item })` component that `switch`-dispatches on `item.type`.

### TranscriptBubble — `operator-prompt` / `agent-reply`

```
┌──────────────────────────────────────┐
│ role badge  · timestamp              │
│ ───────────────────────────────────  │
│ message text                         │
│ [error icon if item.error]           │
└──────────────────────────────────────┘
```
- Secondary background for operator, primary for agent
- Left-aligned, `role="log"`, `aria-label` with role and timestamp
- Monospace for code blocks inside the message text
- Error icon (red) appears when `item.error === true`

### ActionRow — `action-executed`

```
│ > tool_name — args summary  (spinner | ✓ | ✗)
```
- Full-width, monospace, icon prefix `>`
- Running: animated spinner icon
- Done: green checkmark
- Failed: red X icon + `aria-describedby` pointing to error text
- `tabIndex={0}` on the row for keyboard focus

### ProgressBar — `progress-active`

```
Step 2/5: Implementing design
████████████░░░░░░░░  running
```
- Blue/tinted progress bar with animated fill
- Step N/M label above the bar
- `role="status"`, `aria-label` with full step description

### ProgressDone — `progress-done`

```
✓ Step 2: Implementing design — completed at HH:MM
```
- Green checkmark + step label + completion timestamp
- `role="status"`

### ProgressFailed — `progress-failed`

```
✗ Step 2: Implementing design
Error: <error message>
```
- Red X icon + step label + error message inline
- Error message is expandable/collapsible if long
- `role="alert"`

**Acceptance criteria:**
- Each type renders the correct visual described above
- `role` and `aria-*` attributes are set per accessibility spec
- All timestamps formatted consistently (HH:MM:ss)

---

## Task 5 — OperatorComposer with submit flow

**File:** `src/components/workspace/OperatorComposer.jsx`

**Description:**

Bottom-anchored message composer with auto-grow textarea, submit via `persistMissionControlComposerMessage`, optimistic append, and error banner integration.

**Implementation details:**

```jsx
function OperatorComposer({ onSubmit, disabled, placeholder }) {
  const [text, setText] = useState('');

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) onSubmit(text.trim());
    }
  };

  return (
    <div className="border-t border-[--dock-border] px-3 py-2">
      <div className="flex gap-2 items-end">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none min-h-[36px] max-h-[72px] overflow-y-auto"
          aria-label="Operator message input"
        />
        <button
          onClick={() => text.trim() && onSubmit(text.trim())}
          disabled={disabled || !text.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

- Textarea auto-grows via `rows={1}` + CSS (measure scrollHeight, set rows dynamically) — up to 3 lines then scrolls internally
- `Enter` submits; `Shift+Enter` inserts newline
- Send button is disabled when `disabled === true` or text is empty/whitespace
- Focus ring on textarea
- After submit (caller clears `text` state via a `ref` or `key` reset pattern — coordinate with Task 3)

**Acceptance criteria:**
- `Enter` submits the text and clears the input
- `Shift+Enter` inserts a newline without submitting
- Send button is disabled when input is empty
- Composer is visually pinned at the bottom of the pane

---

## Task 6 — Hook up operator tab in WorkspaceRightDock

**File:** `src/components/workspace/WorkspaceRightDock.jsx`

**Description:**

Add the `operator` branch to the dock's tab rendering and pass the active session ID to `WorkspaceOperatorObserverPane`.

**Implementation details:**

- Find where `activeTab` is read from `dockState` in the dock's render
- Add:
  ```jsx
  const isOperatorActive = dockState.activeTab === 'operator';
  ```
- Add a render branch:
  ```jsx
  {isOperatorActive && (
    <WorkspaceOperatorObserverPane
      sessionId={/* derived from active swarm session — e.g. from workspaceContext or swarm state */}
      onClose={() => onDockStateChange({ activeTab: 'browser' })}
    />
  )}
  ```
- Derive `sessionId` from the existing swarm session context (same source used by other swarm panes)
- No structural changes to the dock shell — only the tab content area changes

**Acceptance criteria:**
- Switching to the Operator tab renders the pane
- Switching away unmounts the pane (SSE/polling cleanup in useEffect)
- Dock resize/maximize controls apply to the operator pane
- Active tab is persisted via existing `rightDockState` logic

---

## Task 7 — Wire Operator tab in TerminalWorkspacesManager

**File:** `src/components/TerminalWorkspacesManager.jsx`

**Description:**

Add the `Operator` entry to the dock tab bar and wire its lifecycle (open, close, resize, maximize) to the same patterns used by existing tabs.

**Implementation details:**

- Find the tab bar definition in `TerminalWorkspacesManager` — add `{ id: 'operator', label: 'Operator' }` alongside existing tabs
- The Operator tab uses the existing window chrome (`[−][□][×]`) consistent with other dock panes
- Wire `onTabClick` to set `dockState.activeTab === 'operator'`
- No badge required for MVP (optional unread count deferred)
- Ensure the tab respects the same resize/maximize controls as other tabs

**Acceptance criteria:**
- Tab bar renders an Operator entry alongside existing tabs
- Clicking the tab triggers the operator pane in `WorkspaceRightDock`
- The tab lifecycle (open/close/resize) follows the existing dock pattern

---

## Task 8 — Edge cases + integration smoke

**Files:**
- `src/components/workspace/WorkspaceOperatorObserverPane.jsx`
- `src/components/workspace/OperatorFeedItem.jsx`

**Description:**

Implement and verify the edge cases documented in design.md section 6.

**Implementation details:**

### Empty session placeholder
- When `feedItems.length === 0` and `sessionId === null`, render:
  ```
  ┌──────────────────────────────────────────┐
  │ No active session                        │
  │ Start a swarm to see the operator feed.  │
  └──────────────────────────────────────────┘
  ```
- Composer remains visible and functional — prompts can be submitted even without a session

### SSE reconnect
- On SSE `error` or `close` event, start 2s polling interval
- Show a subtle "reconnecting..." text in the header row while polling
- On SSE reconnect success, stop polling and resume stream

### Submit failure + retry
- On submit error: append item with `error: true`, show `OperatorErrorBanner` above composer
- `handleRetry` fires the same `persistMissionControlComposerMessage` call with the stored text
- On retry success: replace the error item with a clean item, clear `submitError`

### Load earlier (> 200 items)
- After initial load, if `hasMore === true` from `getOperatorSidebarModel()`, render a `"Load earlier"` button at the top of the feed
- Clicking fetches `getOperatorSidebarModel({ sessionId, watermark: currentWatermark })` and prepends results

### Session end
- On SSE `session-end` event:
  - Disable the composer with placeholder `"Session ended"`
  - Do not append more items after session end
  - Append a final `progress-done` or `progress-failed` item if not already present

### Virtualization
- Implement `useFeedVirtualization` hook (conditionally imports `react-window` only if `feedItems.length > 200`)
- `shouldVirtualize` flag gates whether `VariableSizeList` or the plain map is used
- Measure with `ResizeObserver` on the feed container

**Acceptance criteria:**
- Empty session shows placeholder — composer still works
- SSE failure gracefully falls back to polling with indicator
- Submit failure shows banner with working retry
- "Load earlier" button prepends older items correctly
- Session end freezes feed and disables composer
- Feed with 200+ items virtualizes without jank

# Design: Operator Observer Chat Sidebar

**Change:** `operator-observer-chat-sidebar`
**Author:** SDD Phase — design
**Status:** Draft
**Created:** 2026-05-30

---

## 1. Architecture Overview

### 1.1 Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Feed model | Flat, time-ordered array of typed feed items | Matches the spec requirement of "one ordered narrative"; avoids nested state complexity |
| Live update strategy | Server-Sent Events (SSE) primary, polling fallback | Agent actions and progress updates are push-shaped; SSE avoids polling overhead |
| Optimistic updates | Immediate local append for operator prompts | Keeps the pane responsive; failure is surfaced via error banner |
| Session binding | Active mission + active run (single swarm session) | The spec targets single-session observer, not multi-session overview |
| Composer submission | Existing chat transport (`/api/agenthub/operations/health`) | Reuses `persistMissionControlComposerMessage`; no new endpoint needed |

### 1.2 Component Tree

```
WorkspaceRightDock (modified)
└── <WorkspaceOperatorObserverPane />        ← mounts when tab === 'operator'
    ├── OperatorFeed                          ← scrollable feed, SSE/polling consumer
    │   └── OperatorFeedItem (by type)        ← renders operator-prompt / agent-reply / action-executed / progress-*
    └── OperatorComposer                      ← pinned bottom input + submit
```

### 1.3 Data Flow

```
swarmMissions.js (DB)
       │
       ▼
swarmControl.js ──► getOperatorSidebarModel()
       │                  │
       │                  ▼
       │           ┌─────┴──────┐
       │           │  SSE /     │
       │           │  polling   │
       │           ▼            │
       │    ┌────────────┐       │
       │    │  FlatFeed │◄──────┘
       │    │  atom     │          (local state, SSE/polling source)
       │    └─────┬─────┘
       │          │ render
       │          ▼
       │   ┌──────────────┐
       │   │OperatorFeed │──► OperatorFeedItem (type dispatched)
       │   └──────────────┘
       │
       ▼
OperatorComposer ──► submit ──► /api/agenthub/operations/health
                                              │
                           ┌──────────────────┘
                           ▼
                    mission_messages DB insert
                           │
                           ▼ (SSE event emitted)
                    FlatFeed atom updates
```

---

## 2. State Management

### 2.1 Feed State

The feed is a React `useState` array of feed items, ordered by `occurredAt` ascending (oldest first). The pane manages this state directly — no external state library required for the MVP.

```js
// Feed item union type
type FeedItem =
  | { id, type: 'operator-prompt', role: 'operator', text, timestamp, pending?: boolean, error?: string }
  | { id, type: 'agent-reply',     role: 'agent',   text, timestamp }
  | { id, type: 'action-executed', tool, argsSummary, startedAt, completedAt, status }
  | { id, type: 'progress-active', stepIndex, totalSteps, stepLabel }
  | { id, type: 'progress-done',  stepIndex, totalSteps, stepLabel, completedAt }
  | { id, type: 'progress-failed', stepIndex, totalSteps, stepLabel, error };
```

The state shape:

```js
// WorkspaceOperatorObserverPane local state
{
  feedItems: FeedItem[],       // ordered by occurredAt asc
  isSubmitting: boolean,        // disables composer while pending
  submitError: string | null,  // error banner message above composer
}
```

### 2.2 Live Update Source

`getOperatorSidebarModel()` is called in two modes:

**SSE mode** (primary): The pane opens an SSE connection to `/api/agenthub/events` or the mission-specific stream endpoint. Events are normalized to the feed item schema before being appended to `feedItems`.

**Polling mode** (fallback): When SSE is unavailable, the pane polls `getOperatorSidebarModel()` every 2s. The poll response is a diff — only new items since the last known `watermark` are returned.

### 2.3 Initial Load

On pane mount (tab switch to operator), `getOperatorSidebarModel({ sessionId, watermark: null })` is called once to load the historical transcript and recent actions. The response fills the initial `feedItems` array before SSE/polling begins.

---

## 3. API Surface

### 3.1 `getOperatorSidebarModel()` — swarmControl.js

**Signature:**
```js
export function getOperatorSidebarModel({
  sessionId,      // run_id of the active mission session
  watermark,      // last seen occurredAt; returns only newer items on diff call
  limit = 200,    // max items per load (windowed for large transcripts)
} = {})
```

**Returns:**
```js
{
  sessionId: string,
  feedItems: FeedItem[],   // sorted by occurredAt asc
  progress: {
    currentStep: number,
    totalSteps: number,
    stepLabel: string,
    status: 'running' | 'done' | 'failed',
  },
  watermark: string,       // last item's occurredAt; pass back on next call
  hasMore: boolean,         // true if limit was hit
}
```

**Source:**
- `transcript`: from `swarmMissions.js` `getMissionMessages({ mission_id })` filtered to the active run
- `actions`: from the action-contract read model (`swarmMissions.js` or a separate actions table)
- `progress`: derived from `swarmMissions.js` `getMissionSteps({ mission_id })` or the execution timeline

### 3.2 Events API Normalization

`/api/agenthub/events` (and related) emits SSE with normalized payload for sidebar use:

```js
// SSE event shape for the sidebar
{
  type: 'feed-item' | 'progress-update' | 'session-end',
  payload: FeedItem | ProgressUpdate | SessionEnd,
  occurredAt: string,       // ISO 8601, used as watermark
  sessionId: string,
}
```

The events API reads from `swarmMissions.js` and the action-contract table, normalizing fields to match the `FeedItem` schema defined above.

### 3.3 Composer Submission

Operator prompt submission uses the existing `persistMissionControlComposerMessage` from `swarmControl.js`:

```js
await persistMissionControlComposerMessage({
  recipient_agent_ids: participants.map(p => p.agent_id),
  body_summary: trimmedText,
  fetchImpl: fetch,  // allows test injection
})
```

After a successful submit, the response mission control snapshot is used to emit an SSE event that the pane consumes, appending the new `operator-prompt` item. On failure, the pane catches the exception and sets `submitError` + marks the item with `error: true`.

---

## 4. UI Structure

### 4.1 WorkspaceOperatorObserverPane

```jsx
function WorkspaceOperatorObserverPane({ sessionId, onClose }) {
  const [feedItems, setFeedItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const feedEndRef = useRef(null);  // auto-scroll to bottom

  // SSE connection on mount, cleanup on unmount
  // Polling fallback if SSE unavailable

  return (
    <div className="flex flex-col h-full">
      {/* Feed area — scrollable, flex-1 */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-2 space-y-2">
        {feedItems.map(item => (
          <OperatorFeedItem key={item.id} item={item} />
        ))}
        <div ref={feedEndRef} />
      </div>

      {/* Error banner */}
      {submitError && <OperatorErrorBanner message={submitError} onRetry={handleRetry} />}

      {/* Composer — pinned bottom */}
      <OperatorComposer
        onSubmit={handleSubmit}
        disabled={isSubmitting}
        placeholder="Ask the operator anything about the current session..."
      />
    </div>
  );
}
```

### 4.2 OperatorFeedItem

Type-dispatched renderer:

```jsx
function OperatorFeedItem({ item }) {
  switch (item.type) {
    case 'operator-prompt':
    case 'agent-reply':
      return <TranscriptBubble item={item} />;
    case 'action-executed':
      return <ActionRow item={item} />;
    case 'progress-active':
      return <ProgressBar item={item} />;
    case 'progress-done':
      return <ProgressDone item={item} />;
    case 'progress-failed':
      return <ProgressFailed item={item} />;
    default:
      return null;
  }
}
```

### 4.3 TranscriptBubble

```
┌─────────────────────────────────┐
│ role badge  · timestamp          │
│ ──────────────────────────────  │
│ message text                    │
│ [error icon if item.error]      │
└─────────────────────────────────┘
```
- `operator-prompt`: secondary background, left-aligned
- `agent-reply`: primary background, left-aligned
- Monospace text for code blocks in the message

### 4.4 ActionRow

```
│ > tool_name — args summary  (running spinner | done check | x failed)
```

Full-width, monospace, icon prefix:
- Running: spinner icon + `> tool_name — args_summary`
- Done: green checkmark
- Failed: red X + error tooltip

### 4.5 ProgressBar / ProgressDone / ProgressFailed

```
Step 2/5: Implementing design
████████████░░░░░░░░  running
```
- `progress-active`: blue/tinted progress bar, animated fill
- `progress-done`: green checkmark + step label
- `progress-failed`: red X + step label + error message inline

### 4.6 OperatorComposer

```
┌──────────────────────────────────────────────────┐
│ [textarea: auto-grow, max 3 lines, then scroll] │
└──────────────────────────────────────────────────┘
                              [Send]
```
- Auto-grows up to 3 lines, then scrolls within the textarea
- `Enter` submits; `Shift+Enter` inserts newline
- `Send` button disabled when `isSubmitting === true` or textarea is empty
- Focus ring on textarea

### 4.7 Header Row

The pane renders a minimal header above the feed area (not above the whole dock tab, since the dock already has a tab bar):

```
┌──────────────────────────────────────────┐
│ Operator Observer           [−][□][×]    │  ← window chrome (optional, matches dock pattern)
└──────────────────────────────────────────┘
```

This uses the existing window chrome pattern from other dock panes.

---

## 5. Tab Wiring

### 5.1 WorkspaceRightDock Changes

Add `operator` to the tab check and render `WorkspaceOperatorObserverPane` when `dockState.activeTab === 'operator'`:

```jsx
const isOperatorActive = dockState.activeTab === 'operator';

// in render:
{isOperatorActive && (
  <WorkspaceOperatorObserverPane
    sessionId={/* derived from active swarm session */}
    onClose={() => onDockStateChange({ activeTab: 'browser' })}
  />
)}
```

### 5.2 Tab Bar Entry

The tab bar (managed in `TerminalWorkspacesManager`) receives a new entry:

```
[Topology] [Browser] [Swarm] [Operator 📡]
```

The `Operator` tab badge shows an optional unread count. For MVP, no badge is required.

### 5.3 Persistence

`activeTab` in `dockState` is persisted via `rightDockState.js` (already implemented). No new persistence needed.

---

## 6. Edge Cases and Error Handling

### 6.1 No Active Session

When `getOperatorSidebarModel()` finds no active mission/run, return an empty feed with a placeholder:

```
┌──────────────────────────────────────────┐
│ No active session                        │
│ Start a swarm to see the operator feed.  │
└──────────────────────────────────────────┘
```

The composer is still visible and functional — prompts are queued for the next session.

### 6.2 SSE Connection Failure

- On SSE error/close, the pane falls back to 2s polling
- The `feedItems` state is preserved during the fallback transition
- A subtle "reconnecting..." indicator appears in the header if polling is active

### 6.3 Submit Failure

1. Optimistic item appended with `error: true`
2. Error banner appears above composer with "Failed to send. Retry?" + Retry button
3. `handleRetry` re-fires the submit with the same text
4. On success, the optimistic error item is replaced with a clean item

### 6.4 Large Transcript (> 200 items)

- Initial load uses `limit: 200` with `watermark: null`
- If `hasMore === true`, a "Load earlier" button appears at the top of the feed
- Virtualization (`react-window`) is triggered only if the DOM node count exceeds 200 items in the feed container (measured via `ResizeObserver`)

### 6.5 Session End / Mission Complete

When SSE emits `session-end`:
- The feed is frozen (no new items appended)
- A final `progress-done` or `progress-failed` item is appended
- The composer is disabled with a "Session ended" placeholder

### 6.6 Concurrent Actions

Multiple actions can execute simultaneously. Each produces its own `action-executed` item. They are ordered by `startedAt`. The progress bar always reflects the slowest/active step; completed steps produce `progress-done` items in sequence.

---

## 7. Performance

### 7.1 Fine-grained Feed Updates

When a new `action-executed` item arrives via SSE, only that item is appended:

```js
setFeedItems(prev => [...prev, newItem]);
```

This avoids full re-render of the entire feed. React `key` on each `OperatorFeedItem` ensures minimal DOM reconciliation.

### 7.2 Virtualization

`react-window` is integrated only when needed. A `useFeedVirtualization` hook wraps the feed container:

```js
function useFeedVirtualization(feedItems) {
  const containerRef = useRef(null);
  const shouldVirtualize = feedItems.length > 200;

  return { containerRef, shouldVirtualize };
}
```

When virtualization is active, the feed renders `VariableSizeList` from `react-window` with item size derived from `type`.

### 7.3 Auto-scroll

`feedEndRef` points to an empty div at the bottom of the feed. On each new item:

```js
feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
```

Auto-scroll is suppressed if the user has scrolled up (detected via `scrollTop > 0`).

---

## 8. Accessibility

- `aria-label` on the feed container: `"Operator session feed"`
- Feed items use `role="log"` for transcript bubbles and `role="status"` for progress items
- Composer textarea has `aria-label="Operator message input"`
- Error banner has `role="alert"`
- `tabIndex` on actionable feed items; keyboard navigation within the feed

---

## 9. File Changes Summary

### New Files

| File | Purpose |
|---|---|
| `src/components/workspace/WorkspaceOperatorObserverPane.jsx` | Main pane: feed + composer + SSE/polling |
| `src/components/workspace/OperatorFeedItem.jsx` | Type-dispatched feed item renderer |
| `src/components/workspace/OperatorComposer.jsx` | Bottom composer with auto-grow textarea |

### Modified Files

| File | Change |
|---|---|
| `src/components/workspace/WorkspaceRightDock.jsx` | Add `operator` tab branch, render pane |
| `src/components/TerminalWorkspacesManager.jsx` | Add `Operator` tab to tab bar |
| `src/lib/operations/swarmControl.js` | Add `getOperatorSidebarModel()` function |
| `src/app/api/agenthub/events/route.js` (or related) | Normalize payloads for sidebar; emit SSE with typed feed items |

### Implementation Order

1. `swarmControl.js` — add `getOperatorSidebarModel()`
2. `events/route.js` — normalize payloads, add SSE endpoint
3. `WorkspaceOperatorObserverPane.jsx` — pane shell, feed state, initial load
4. `OperatorFeedItem.jsx` — all 6 type renderers
5. `OperatorComposer.jsx` — composer with submit flow
6. `WorkspaceRightDock.jsx` — add operator tab
7. `TerminalWorkspacesManager.jsx` — add tab to tab bar
8. Integration test: SSE live updates and error scenarios

---

## 10. Rollback

Remove the operator tab from `WorkspaceRightDock` and `TerminalWorkspacesManager`. Delete the 3 new component files. `getOperatorSidebarModel()` and the payload normalization in the events API are backward-compatible read-only additions — they can stay with no harm.

---

## 11. Dependencies

| Dependency | Role |
|---|---|
| `swarmMissions.js` | Source of transcript, actions, progress |
| `swarmControl.js` | `getOperatorSidebarModel()` + `persistMissionControlComposerMessage` |
| `/api/agenthub/events` (SSE) | Live update stream |
| `react-window` | Virtualization for >200 items (conditional import) |
| Existing `rightDockState.js` | Tab persistence |
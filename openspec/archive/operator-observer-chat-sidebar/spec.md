# Spec: Operator Observer Chat Sidebar

**Change:** `operator-observer-chat-sidebar`
**Author:** SDD Phase — spec
**Status:** Draft
**Created:** 2026-05-30

---

## 1. Overview

This spec defines the implementation of a read-first, chat-like operator observer tab inside the existing `WorkspaceRightDock`. The tab presents a single vertical feed mixing transcript bubbles, execution timeline rows, and live progress indicators, with a pinned bottom composer. All data is selector-first and read-mostly — the pane consumes existing and forthcoming action-contract and execution-timeline payloads so the UI explains what the agent said, what it executed, and how far it progressed.

---

## 2. Component Architecture

### 2.1 New Components

| Component | File | Responsibility |
|---|---|---|
| `WorkspaceOperatorObserverPane` | `src/components/workspace/WorkspaceOperatorObserverPane.jsx` | Main sidebar pane — renders the feed and composer |
| `OperatorFeedItem` | (inline in pane, or `src/components/workspace/OperatorFeedItem.jsx`) | Single feed item: prompt bubble, reply bubble, action row, or progress indicator |
| `OperatorComposer` | (inline in pane, or `src/components/workspace/OperatorComposer.jsx`) | Bottom-anchored message composer |

### 2.2 Modified Components

| Component | File | Change |
|---|---|---|
| `WorkspaceRightDock` | `src/components/workspace/WorkspaceRightDock.jsx` | Add operator tab alongside existing tabs; render `WorkspaceOperatorObserverPane` when operator tab is active |
| `TerminalWorkspacesManager` | `src/components/TerminalWorkspacesManager.jsx` | Wire tab trigger, sizing, maximize, and right-dock lifecycle for the operator tab |

---

## 3. UI Structure

### 3.1 Dock Layout

```
WorkspaceRightDock
├── TabBar
│   ├── [Topology]        ← existing
│   ├── [Browser]        ← existing
│   └── [Operator]        ← NEW tab
└── PaneArea
    ├── <TopologyPane />  ← existing
    ├── <BrowserPane />   ← existing
    └── <WorkspaceOperatorObserverPane />  ← NEW; visible when Operator tab active
```

### 3.2 Pane Layout (WorkspaceOperatorObserverPane)

```
┌─────────────────────────────────────────┐
│ Operator Observer            [−][□][×]  │  ← header row
├─────────────────────────────────────────┤
│                                         │
│  [FeedItem] timestamp + role + content │  ← scrollable feed
│  [FeedItem] action row with icon + name │
│  [FeedItem] progress bar + step label  │
│  ...                                    │
│                                         │
├─────────────────────────────────────────┤
│ [Prompt input...]              [Send]  │  ← pinned composer
└─────────────────────────────────────────┘
```

### 3.3 Feed Item Types

| Type | Visual | Content |
|---|---|---|
| `operator-prompt` | Left-aligned bubble, secondary bg | Operator's prompt text + timestamp |
| `agent-reply` | Left-aligned bubble, primary bg | Agent reply text + timestamp |
| `action-executed` | Full-width row, monospace, icon prefix | `> tool_name — args summary` |
| `progress-active` | Inline progress bar + step label | Step N of M: step name |
| `progress-done` | Checkmark icon + step label | Completed step |
| `progress-failed` | X icon + step label + error summary | Failed step + message |

---

## 4. Data Contract

### 4.1 Feed Data Source

The pane SHALL source data from a selector built on top of existing swarm observability state:

- **Current session transcript**: from `swarmMissions.js` active mission read model
- **Recent executed actions**: from action-contract read model exposed via `swarmControl.js`
- **Live progress**: from execution timeline event stream (SSE or polling)

### 4.2 Required Read Model Fields

For each active agent session, the read model SHALL expose:

```js
{
  sessionId: string,
  transcript: [
    { id, role: 'operator' | 'agent', text, timestamp },
    ...
  ],
  actions: [
    { id, tool, argsSummary, startedAt, completedAt, status: 'running'|'done'|'failed', error? },
    ...
  ],
  progress: {
    currentStep: number,
    totalSteps: number,
    stepLabel: string,
    status: 'running' | 'done' | 'failed'
  }
}
```

### 4.3 swarmControl.js Changes

`src/lib/operations/swarmControl.js` SHALL expose a `getOperatorSidebarModel()` function that returns the above shape, reading from the active mission state and action log.

### 4.4 Events API Changes

`src/app/api/agenthub/events` (and related read models) SHALL normalize execution/timeline payloads so they contain `startedAt`, `completedAt`, `status`, and `argsSummary` fields required by the sidebar.

---

## 5. Composer Behavior

### 5.1 Input

- Textarea (auto-grows up to 3 lines, then scrolls)
- Placeholder: `"Ask the operator anything about the current session..."`
- `Enter` submits; `Shift+Enter` inserts newline

### 5.2 Submission

- On submit, dispatch to the existing chat transport endpoint used by the operator
- After submit, append the operator's prompt as a new `operator-prompt` feed item immediately (optimistic)
- Disable input while a response is pending

### 5.3 Error State

- If submission fails, show an inline error banner above the composer: `"Failed to send. Retry?"` with a Retry button
- The failed prompt item remains in the feed with an error indicator

---

## 6. Tab Behavior

### 6.1 Tab Label

- Display: `"Operator"` with an optional eye/observe icon
- Badge: show count of unread items when tab is not active (optional for MVP)

### 6.2 Persistence

- Active tab index SHALL be persisted to the dock state (same pattern as existing tabs)
- On dock reopen, restore the previously active tab

### 6.3 Resize / Maximize

- The operator pane follows the same resize and maximize controls as the existing right-dock tabs
- Maximize toggles the pane to fill the full workspace right area

---

## 7. Scenario Specification (Given/When/Then)

### Scenario 1: Operator opens the sidebar
- **Given** the workspace is loaded and the right dock is visible
- **When** the operator clicks the `Operator` tab in the dock tab bar
- **Then** the `WorkspaceOperatorObserverPane` is rendered, displaying the current session transcript, recent actions, and live progress state
- **And** the composer is pinned at the bottom

### Scenario 2: Agent executes an action
- **Given** the operator tab is open and the agent is running
- **When** the agent executes a tool call
- **Then** a new `action-executed` feed item appears in the feed with icon, tool name, and args summary
- **And** the progress bar updates to reflect the current step

### Scenario 3: Agent completes the current step
- **Given** the operator tab is open and a step is running
- **When** the agent completes the step
- **Then** the `progress-active` item transitions to `progress-done` with a checkmark
- **And** the next `progress-active` item appears for the next step

### Scenario 4: Step fails
- **Given** the operator tab is open
- **When** a running step fails
- **Then** a `progress-failed` feed item appears showing the step label and error message

### Scenario 5: Operator sends a prompt
- **Given** the operator tab is open and the composer is empty
- **When** the operator types a message and presses Enter
- **Then** the prompt is appended as an `operator-prompt` feed item
- **And** the input is cleared
- **And** the agent begins processing the request

### Scenario 6: Prompt submission fails
- **Given** the operator tab is open and the composer is empty
- **When** the operator submits a prompt but the request fails
- **Then** an error banner appears above the composer
- **And** the feed item for the failed prompt shows an error indicator
- **And** clicking Retry re-submits the same prompt text

### Scenario 7: Dock is maximized
- **Given** the operator tab is open
- **When** the operator maximizes the dock
- **Then** the feed area expands to fill the full right area
- **And** the composer remains pinned at the bottom

---

## 8. Non-Functional Requirements

### 8.1 Performance
- Feed SHALL use windowed/virtualized rendering (e.g. `react-window`) if the transcript exceeds 200 items
- Progress updates SHALL NOT cause full re-renders of the entire feed; use fine-grained state updates

### 8.2 Accessibility
- All interactive elements SHALL be keyboard navigable
- Feed items SHALL have appropriate ARIA roles (`log`, `status`)
- Composer textarea SHALL have an associated label

### 8.3 Styling
- Use existing Tailwind CSS 4 patterns from the workspace components
- No new design system tokens required; reuse existing dock and terminal workspace tokens

---

## 9. Testing Requirements

### 9.1 Unit Tests
- `WorkspaceOperatorObserverPane` renders correctly given a populated read model
- Feed item dispatching: correct type is rendered for each data shape
- Composer: submit fires handler with correct text, Enter submits, Shift+Enter inserts newline
- Error state: failed submit shows banner, retry re-fires handler

### 9.2 Integration Tests
- Tab switch to Operator renders the pane without crashing
- Maximize/restore preserves feed content
- Real-time feed updates append items correctly

### 9.3 E2E Tests (Playwright)
- Open workspace → activate Operator tab → verify pane loads
- Submit a prompt → verify it appears in the feed
- Simulate agent action → verify action row appears in feed

---

## 10. File Inventory

| File | Action |
|---|---|
| `src/components/workspace/WorkspaceOperatorObserverPane.jsx` | Create |
| `src/components/workspace/WorkspaceRightDock.jsx` | Modify — add operator tab |
| `src/components/TerminalWorkspacesManager.jsx` | Modify — wire tab lifecycle |
| `src/lib/operations/swarmControl.js` | Modify — add `getOperatorSidebarModel()` |
| `src/app/api/agenthub/events/route.js` (or related) | Modify — normalize action/timeline payloads |

---

## 11. Rollback Plan

Remove the operator tab from `WorkspaceRightDock` and the pane component. The `getOperatorSidebarModel()` function and any payload normalization added to the events API remain backward-compatible as read-only enhancements. No data migration is required.

---

## 12. Dependencies

- **Action contract and permissions slice** — provides the action log entries referenced in the read model
- **Execution timeline/read-model slice** — provides progress step tracking
- **Existing chat transport for composer submissions** — reuses the same endpoint as operator prompt submission

---

## 13. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Event payloads are too coarse for useful progress feedback | Medium | Finalize the required timeline/action fields in the design phase before UI wiring |
| Feed becomes noisy and unreadable | Medium | MVP is read-first: active step, latest 5 actions, and collapsible history |
| Scope drifts toward canvas/voice work | Low | Keep container fixed to right dock; alternate inputs deferred post-MVP |
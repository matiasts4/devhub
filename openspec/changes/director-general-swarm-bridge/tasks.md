# Tasks: Director General Swarm Bridge

## Status

**Change**: director-general-swarm-bridge
**Phase**: tasks
**Artifact store**: openspec
**Author**: SDD orchestrator
**Date**: 2026-05-30
**Depends on**: design.md, spec.md

---

## Phase 1 — Backend API Extensions

### Task 1.1: Extend mission inbox timeline row endpoints

**Target file**: `src/lib/db/swarmMissions.js`

**What**: Add `POST /api/agenthub/missions/:missionId/timeline` (append row) and `GET /api/agenthub/missions/:missionId/timeline` (fetch all rows for a mission) to the mission inbox. Add `director-offline` status response to the mission submission endpoint.

**Acceptance criteria**:
- `appendTimelineRow(missionId, row)` inserts a row into the timeline table without mutating existing rows
- `getTimelineRows(missionId)` returns rows ordered by `timestamp` ascending
- `submitMissionRequest` returns `{ status: "director-offline" }` immediately when Director is unreachable
- Row schema validates all required fields: `id`, `timestamp`, `initiator`, `target`, `action`, `status`, `authority`, `freshness`, `fallback`, `missionId`
- `authority` field is validated against `initiator` (throws on invalid combination per Section 6 DG MUST NOT rules)

---

## Phase 2 — Pure Utility Modules

### Task 2.1: Implement timeline row factory

**Target file**: `src/lib/directorGeneral/timeline.js`

**What**: Export `emitRow(action, status, opts)` — a pure factory that builds a validated timeline row object and immediately POSTs it to the timeline endpoint.

**Acceptance criteria**:
- `emitRow("mission-request", "pending", { missionId, initiator: "operator", target: "swarm-director", authority: "operator-initiated" })` produces a correctly-shaped row and POSTs it
- `emitRow("status-poll", status, opts)` handles all status variants including `failed` with `fallback`
- `emitRow("approval-required", "awaiting-approval", opts)` emits with correct `initiator`/`target`
- `emitRow("mission-result", status, opts)` handles `completed` and `failed`
- Invalid `authority`/`initiator` combination throws a descriptive error (enforces DG MUST NOT rules)
- Returns the row that was written (including server-assigned `id` and `timestamp`)

### Task 2.2: Implement polling loop

**Target file**: `src/lib/directorGeneral/polling.js`

**What**: Export `startPolling(missionId, config, callbacks)` using `AbortController`. Implements the loop described in design Section 5.

**Acceptance criteria**:
- Polling starts after `config.pollIntervalMs` delay (default 1000ms)
- On transient error (5xx): retry up to 3 times with exponential backoff (1s, 2s, 4s), then emit `failed` timeline row and break
- On non-transient error (403, 404): stop polling immediately, emit `failed` row with fallback
- On `director-offline`: emit `failed` row immediately, do not start polling loop
- On terminal state (`completed`, `failed`, `rejected`): emit final timeline row and break
- On `approval-required`: emit timeline row but do NOT break (continue polling)
- Backoff resets to `pollIntervalMs` after a successful poll
- After 30s of no response from Director: mark next row `freshness: "stale"`, continue polling
- `AbortController` cancels in-flight requests on unmount / `stopPolling()` call
- Returns `{ stop }` where `stop()` aborts the loop

---

## Phase 3 — Bridge Module and Mission Inbox Client

### Task 3.1: Implement mission inbox client and composeMissionRequest

**Target file**: `src/lib/directorGeneral/bridge.js`

**What**: Export `submitMissionRequest(intent, config)` — composes and POSTs a `director-general-mission-request` payload; `postApprovalReply(missionId, approvalItemId, decision)` — POSTs approval/rejection; `getMissionStatus(missionId)` — fetches current status; `getMissionTimeline(missionId)` — fetches all timeline rows.

**Acceptance criteria**:
- `submitMissionRequest` builds payload with `type`, `missionId` (UUID), `intent`, `authority: "operator"`, `initiator: "director-general"`, `target: "swarm-director"`, `requestedAt`, `followUpIntervalMs`
- DG NEVER imports or calls `src/lib/swarm/worker*`, `workerSpawn*`, or any worker roster function — verified by grep before commit
- All external calls go exclusively to `/api/agenthub/missions/*`
- Duplicate submission guard: `submitMissionRequest` returns error if `activeMissionId` is already set and non-terminal
- `getMissionStatus` parses `freshness` from response (`updatedAt` within 5s = `just_now`, else `stale`)

### Task 3.2: Module barrel export

**Target file**: `src/lib/directorGeneral/index.js`

**What**: Re-export everything from `bridge.js`, `polling.js`, `timeline.js`, plus `useDirectorGeneralBridge` (Task 4.1).

---

## Phase 4 — React Hook

### Task 4.1: Implement useDirectorGeneralBridge hook

**Target file**: `src/lib/directorGeneral/useDirectorGeneralBridge.js` (or inline in `src/lib/directorGeneral/index.js`)

**What**: React hook encapsulating all DG bridge client state and actions.

**State shape**:
```js
{
  activeMissionId: string | null,       // from localStorage recovery on mount
  timelineRows: TimelineRow[],         // append-only, fetched from GET /timeline on reconnect
  pollingState: 'idle' | 'polling' | 'error',
  currentDirectorStatus: DirectorStatus | null,
  pendingApproval: ApprovalItem | null,
  lastPollAt: number | null,
  error: string | null,
}
```

**Acceptance criteria**:
- On mount: re-hydrate from `localStorage` key `devhub_dg_active_mission:<projectId>` if non-terminal mission exists; call `GET /timeline` to rebuild `timelineRows`; resume polling if needed
- `composeMissionRequest(intent)`: checks `activeMissionId` for in-flight guard; on pass → calls `submitMissionRequest` → calls `emitRow` → sets `activeMissionId` → persists to localStorage → starts polling
- `onApprove(missionId, approvalItemId)`: POSTs `{ decision: "approved" }`; on success emits `approval-required` row with `status: "approved"`; clears `pendingApproval`
- `onReject(missionId, approvalItemId)`: same pattern with `decision: "rejected"`
- On 409 Conflict (approval expired): emits `failed` row with fallback "La aprobacion expiro."; shows error in `DGApprovalGate` with retry
- On Director offline response: emits `failed` row immediately; sets `pollingState: 'error'`; does not start polling
- On terminal state reached: stops polling; clears localStorage `activeMissionId`; sets `pollingState: 'idle'`
- Duplicate submission guard: if `activeMissionId` is non-terminal, `composeMissionRequest` returns early with error `"Hay una mision activa..."` and does not call the bridge
- `resetMission()`: clears all state, removes localStorage key, stops polling — callable from UI

---

## Phase 5 — UI Components

### Task 5.1: Implement DGChainRow visual component

**Target file**: `src/lib/directorGeneral/DGChainRow.jsx` (or inside `DGObserverSidebar.jsx`)

**What**: Single timeline row renderer with the visual states from design Section 3.2.

**Acceptance criteria**:
- Renders initiator badge, action label, status pill, authority + freshness metadata
- Left border color and icon match the status table (pending=yellow/spinner, waiting=gray/clock, in-progress=blue/animated-dot, awaiting-approval=orange/alert, completed=green/check, rejected=red/X, failed=red/warning)
- `fallback` text shown only when `status === "failed"`
- `DGApprovalGate` is rendered inline for `status === "awaiting-approval"` rows

### Task 5.2: Implement DGApprovalGate component

**Target file**: `src/components/control-room/DGApprovalGate.jsx`

**What**: Approve/reject controls for an active approval gate.

**Acceptance criteria**:
- Displays "⚠ El Director requiere aprobacion del Operator" header
- Shows action description from `approvalCheckpoint`
- `[ Aprobar ]` button calls `onApprove(missionId, approvalItemId)`
- `[ Rechazar ]` button calls `onReject(missionId, approvalItemId)`
- Both buttons disabled while submission is in flight (loading state)
- Inline error shown if POST fails (including 409 Conflict with retry option)
- Loading spinner on buttons during in-flight submission

### Task 5.3: Implement DGObserverSidebar component

**Target file**: `src/components/control-room/DGObserverSidebar.jsx`

**What**: The main DG observer panel that renders the full chain and active approval gate.

**Acceptance criteria**:
- Header shows "Director General — <missionId truncated>" + status badge when mission active
- Empty state when no `activeMissionId`: "Sin mision activa — iniciá una desde el Launchpad."
- `DGChainList` renders all `timelineRows` chronologically (timestamp asc)
- Active `pendingApproval` renders `DGApprovalGate` at the bottom of the list
- `DGObserverSidebar` reads `timelineRows`, `pollingState`, `pendingApproval`, `error` from `useDirectorGeneralBridge`
- Panel is collapsible (toggle button)
- Shows "Reconectando..." when `pollingState === 'error'` with transient error
- Shows "Director no responde — persiste esperando." after stale threshold

---

## Phase 6 — Integration Into Existing Surfaces

### Task 6.1: Wire DGObserverSidebar into SwarmControl

**Target file**: `src/views/SwarmControl.jsx`

**What**: Import and render `DGObserverSidebar`. Wire DG state from `useDirectorGeneralBridge`.

**Acceptance criteria**:
- `useDirectorGeneralBridge` is called once at `SwarmControl` level
- `DGObserverSidebar` is rendered as a collapsible panel below `EvidenceTimelinePanel`
- Approval actions (`onApprove`, `onReject`) are wired to the hook

### Task 6.2: Extend EvidenceTimelinePanel for DG rows

**Target file**: `src/components/control-room/EvidenceTimelinePanel.jsx`

**What**: Accept DG timeline rows as an additional data prop. Show authority/freshness badges.

**Acceptance criteria**:
- Accepts `dgTimelineRows?: TimelineRow[]` prop (optional, backward-compatible)
- DG rows render with the same `DGChainRow` visual treatment
- Authority badge (operator / DG / Director) and freshness indicator shown on each row

### Task 6.3: Wire DG approval rows into ApprovalsErrorsPanel

**Target file**: `src/components/control-room/ApprovalsErrorsPanel.jsx`

**What**: Handle DG-authored `awaiting-approval` rows with `authority: "operator"`.

**Acceptance criteria**:
- `ApprovalsErrorsPanel` receives DG `pendingApproval` state from the hook
- DG-authored approval rows render with `DGApprovalGate` controls
- Non-DG rows continue to work as before (no regression)

### Task 6.4: Add operations selector for DG state

**Target file**: `src/lib/operations/swarmControl.js`

**What**: Add `selectDGObservableState(state)` selector mirroring the `selectSwarmObservableState` pattern.

**Acceptance criteria**:
- Selector returns `{ activeMissionId, timelineRows, pollingState, pendingApproval, error }`
- Used by `DGObserverSidebar` instead of direct hook consumption (consistent with existing pattern)
- Backward-compatible: existing selectors unchanged

---

## Phase 7 — Testing

### Task 7.1: Unit tests for timeline row factory

**Target file**: `src/lib/directorGeneral/__tests__/timeline.test.js`

**What**: Test all action/status combinations and authority validation.

**Acceptance criteria**:
- All 4 action types × all valid status values produce correct row shape
- Invalid `authority`/`initiator` combinations throw descriptive errors (per DG MUST NOT rules)
- `fallback` is empty string by default, populated only when required

### Task 7.2: Unit tests for polling loop

**Target file**: `src/lib/directorGeneral/__tests__/polling.test.js`

**What**: Test terminal state exit, backoff, abort signal.

**Acceptance criteria**:
- `completed` / `failed` / `rejected` responses break the loop without retry
- 5xx errors trigger up to 3 retries with exponential backoff (1s, 2s, 4s)
- 4th retry failure calls `onFailure` callback and breaks
- 403/404 breaks immediately without retry
- `stop()` aborts in-flight request and breaks loop
- `director-offline` response does not start polling

### Task 7.3: Unit tests for composeMissionRequest

**Target file**: `src/lib/directorGeneral/__tests__/bridge.test.js`

**What**: Test payload shape, duplicate guard integration.

**Acceptance criteria**:
- `composeMissionRequest` payload has all required fields with correct values
- `activeMissionId` guard blocks duplicate submissions when mission is non-terminal
- `postApprovalReply` sends correct `{ decision, approvalItemId, decidedBy, decidedAt }`

### Task 7.4: Integration test for full mission lifecycle

**Target file**: `src/lib/directorGeneral/__tests__/lifecycle.integration.test.js`

**Acceptance criteria**:
- Start mission → timeline row "pending" written
- Director returns `in-progress` → polling loop fires, row "in-progress" written
- Director returns `approval-required` → row "awaiting-approval" written, gate shown
- Operator clicks approve → reply POSTed, row "approved" written
- Director returns `completed` → row "completed" written, polling stops

### Task 7.5: Integration test for approval timeout (409 Conflict)

**Target file**: `src/lib/directorGeneral/__tests__/approval-timeout.integration.test.js`

**Acceptance criteria**:
- Approval reply POST returns 409 → `failed` timeline row written with correct fallback
- `DGApprovalGate` shows error with retry option

### Task 7.6: E2E smoke test for DG sidebar

**Target file**: `src/components/control-room/__tests__/DGObserverSidebar.test.jsx`

**Acceptance criteria**:
- Mount with no active mission → empty state message
- Mount with active mission → chain rows visible with correct visual states
- Click approve → POST fired → timeline row updated → approval gate removed
- Click reject → POST fired → timeline row updated → approval gate removed

---

## Task Ordering Summary (Dependency Chain)

```
1.1 (API endpoints)
  └─► 2.1 (timeline.js) ─► 2.2 (polling.js)
                              └─► 3.1 (bridge.js + composeMissionRequest)
                                        └─► 3.2 (index.js barrel)
                                                  └─► 4.1 (useDirectorGeneralBridge hook)
                                                            ├─► 5.1 (DGChainRow)
                                                            ├─► 5.2 (DGApprovalGate)
                                                            └─► 5.3 (DGObserverSidebar)
                                                                      ├─► 6.1 (SwarmControl wiring)
                                                                      ├─► 6.2 (EvidenceTimelinePanel extension)
                                                                      ├─► 6.3 (ApprovalsErrorsPanel wiring)
                                                                      └─► 6.4 (operations selector)
                                                                                ├─► 7.1 (timeline unit tests)
                                                                                ├─► 7.2 (polling unit tests)
                                                                                ├─► 7.3 (bridge unit tests)
                                                                                ├─► 7.4 (lifecycle integration)
                                                                                ├─► 7.5 (approval timeout integration)
                                                                                └─► 7.6 (E2E sidebar tests)
```

**All Phase 6 integration tasks (6.1–6.4) can run in parallel** after the hook (4.1) is complete.

**All Phase 7 tests depend on Phase 6** but can be developed alongside implementation (TDD approach).

---

## Work-Unit Commit Map

| Commit | Contents |
|--------|---------|
| `feat(swarm): add DG timeline row endpoints to mission inbox` | Task 1.1 |
| `feat(swarm): implement DG timeline row factory` | Task 2.1 |
| `feat(swarm): implement DG polling loop with backoff and abort` | Task 2.2 |
| `feat(swarm): implement DG bridge client and composeMissionRequest` | Tasks 3.1–3.2 |
| `feat(swarm): add useDirectorGeneralBridge hook` | Task 4.1 |
| `feat(swarm): add DGChainRow and DGApprovalGate components` | Tasks 5.1–5.2 |
| `feat(swarm): add DGObserverSidebar panel` | Task 5.3 |
| `feat(swarm): integrate DG sidebar into SwarmControl and existing panels` | Tasks 6.1–6.4 |
| `test(swarm): add DG bridge unit and integration tests` | Tasks 7.1–7.5 |
| `test(swarm): add DGObserverSidebar E2E smoke tests` | Task 7.6 |

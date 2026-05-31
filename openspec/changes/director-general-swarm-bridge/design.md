# Design: Director General Swarm Bridge

## Status

**Change**: director-general-swarm-bridge
**Phase**: design
**Artifact store**: openspec
**Author**: SDD orchestrator
**Date**: 2026-05-30
**Depends on**: spec.md, proposal.md

---

## Overview

This design describes how the Director General (DG) bridge is implemented as a thin Operator-side layer that wraps `swarm-director` without duplicating its logic. DG sequences mission requests, polls Director state, surfaces approval gates, and writes timeline rows — all via the mission inbox. The existing `swarm-observability` surfaces are extended to display the full DG → Director → worker chain.

---

## 1. Architecture

### 1.1 Component Map

```
Operator View (SwarmControl.jsx)
  └─► DirectorGeneralBridge          [NEW] — sequences requests, manages polling, routes approvals
       ├─► useDirectorGeneralBridge  [NEW] — React hook: polling loop, timeline state, approval actions
       ├─► DGObserverSidebar         [NEW] — renders DG chain rows (extends EvidenceTimelinePanel)
       └─► composeMissionRequest()  [NEW] — pure function: builds inbox payload from operator intent

swarm-director (existing)
  └─► Mission inbox (swarmMissions.js)
       ├─► POST /api/agenthub/missions         — DG writes mission requests
       ├─► GET  /api/agenthub/missions/:id      — DG reads status/result
       └─► POST /api/agenthub/missions/:id/reply — DG posts approval/rejection

Observer surfaces (existing, extended)
  ├─► EvidenceTimelinePanel        — renders DG timeline rows with authority + freshness
  └─► ApprovalsErrorsPanel         — surfaces awaiting-approval DG rows with approve/reject controls
```

### 1.2 Data Flow

**Mission Request Flow**
```
Operator clicks "Launch Mission"
  → useDirectorGeneralBridge.composeMissionRequest(intent)
    → POST /api/agenthub/missions { missionId, intent, authority: "operator-initiated" }
  → write timeline row { action: "mission-request", status: "pending" }
  → start polling loop
  → on status: "in-progress" → write row { action: "status-poll", status: "in-progress" }
  → on status: "approval-required" → write row { action: "approval-required", status: "awaiting-approval" }
    → render approve/reject in DGObserverSidebar
    → operator clicks approve
      → POST /api/agenthub/missions/:id/reply { decision: "approved" }
      → write row { action: "approval-required", status: "approved" }
  → on status: "completed" → write row { action: "mission-result", status: "completed" }
  → on status: "failed" → write row { action: "mission-result", status: "failed", fallback: "<escalation text>" }
  → stop polling loop
```

**Polling Loop**
- Interval: 1 poll per second (max), configurable via `DIRECTOR_GENERAL_POLL_INTERVAL_MS`
- Stops when mission reaches terminal state: `completed`, `failed`, `rejected`
- Stops on API error (non-retryable); continues on transient errors with backoff (max 3 retries, 5s backoff)
- Uses `AbortController` to cancel in-flight requests on unmount

### 1.3 State Management

**Client state** (in `useDirectorGeneralBridge`):
```js
{
  activeMissionId: string | null,
  timelineRows: TimelineRow[],   // append-only per mission
  pollingState: 'idle' | 'polling' | 'error',
  currentDirectorStatus: DirectorStatus | null,
  pendingApproval: ApprovalItem | null,   // active approval gate, if any
  lastPollAt: number | null,
  error: string | null,
}
```

**Timeline rows** are stored server-side in the mission inbox (append-only). The client holds the current session's rows in memory and re-fetches on reconnect. No local persistence required for timeline rows.

**No global state store** — DG bridge state lives in the `DirectorGeneralBridge` component context, consumed by `DGObserverSidebar` and `ApprovalsErrorsPanel`.

### 1.4 Module Structure (New Files)

```
src/lib/directorGeneral/
├── index.js                          # exports: useDirectorGeneralBridge, composeMissionRequest
├── bridge.js                         # DirectorGeneralBridge: request composition, mission inbox client
├── polling.js                        # polling loop with AbortController, backoff, terminal-state detection
└── timeline.js                       # timeline row factory functions per action type

src/components/control-room/
├── DGObserverSidebar.jsx             # new: renders DG chain rows (extends EvidenceTimelinePanel layout)
└── DGApprovalGate.jsx                # new: approve/reject controls for awaiting-approval rows

src/lib/operations/
└── directorGeneral.js               # selector: selectDGTimelineRows, selectActiveMissionDGState
                                       # (mirrors swarmControl.js pattern)
```

### 1.5 Existing Files Modified

| File | Change |
|------|--------|
| `src/views/SwarmControl.jsx` | Import and render `DGObserverSidebar`; pass DG state from `useDirectorGeneralBridge` |
| `src/components/control-room/EvidenceTimelinePanel.jsx` | Accept DG timeline rows; show authority/freshness badges |
| `src/components/control-room/ApprovalsErrorsPanel.jsx` | Handle `authority: "operator"` approval rows from DG |
| `src/lib/operations/swarmControl.js` | Add `selectDGObservableState` selector |
| `src/lib/db/swarmMissions.js` | Extend mission inbox read/write to cover DG timeline row schema |

---

## 2. API Surface

### 2.1 Mission Inbox — DG Write Operations

All DG writes use the existing mission inbox API extended with DG-specific fields.

**POST /api/agenthub/missions** (DG mission request)
```js
// Request body
{
  type: "director-general-mission-request",  // discriminator for DG requests
  missionId: string,                          // UUID generated by DG
  intent: {
    action: "launch-swarm" | "review-artifact" | "recovery" | string,
    params: object,
    humanReadableSummary: string,
  },
  authority: "operator",                    // DG does not claim director authority
  initiator: "director-general",
  target: "swarm-director",
  requestedAt: number,                       // Unix ms
  followUpIntervalMs: number,                // DG polling hint for Director
}
```

**POST /api/agenthub/missions/:missionId/reply** (DG approval reply)
```js
// Request body
{
  type: "director-general-approval-reply",
  missionId: string,
  approvalItemId: string,                   // links to the specific approval checkpoint
  decision: "approved" | "rejected",
  decidedBy: "operator",
  decidedAt: number,                         // Unix ms
  authority: "operator",
}
```

### 2.2 Mission Inbox — DG Read Operations

**GET /api/agenthub/missions/:missionId/status**
```js
// Response
{
  missionId: string,
  status: "pending" | "waiting" | "in-progress" | "approval-required" | "completed" | "failed" | "rejected",
  authority: "director" | "director-escalated",
  freshness: "just_now" | "stale" | "unknown",
  updatedAt: number,
  result: object | null,                    // present when status is terminal
  approvalCheckpoint: object | null,        // present when status is "approval-required"
  timelineRow: TimelineRow,                // current DG-authored row for this mission
}
```

**GET /api/agenthub/missions/:missionId/timeline** (all DG rows for mission)
```js
// Response
{
  missionId: string,
  rows: TimelineRow[],                      // ordered by timestamp asc
}
```

### 2.3 Timeline Row API (append-only)

**POST /api/agenthub/missions/:missionId/timeline** (internal — DG only)
```js
// Request body — TimelineRow schema
{
  id: string,               // UUID
  timestamp: number,       // Unix ms
  initiator: "operator" | "director-general" | "swarm-director",
  target: "director-general" | "swarm-director" | "operator",
  action: "mission-request" | "status-poll" | "approval-required" | "mission-result",
  status: "pending" | "waiting" | "in-progress" | "awaiting-approval" | "completed" | "rejected" | "failed",
  authority: "operator" | "operator-initiated" | "director" | "director-escalated",
  freshness: "just_now" | "stale" | "unknown",
  fallback: string,        // empty string when not applicable
  missionId: string,
}
```

---

## 3. UI Structure

### 3.1 DGObserverSidebar Layout

```
DGObserverSidebar
├── Header: "Director General — <missionId truncated>" + status badge
├── DGChainList (scrollable)
│   └── DGChainRow (per timeline row)
│       ├── initiator badge (operator | DG | Director)
│       ├── action label ("Mission requested", "Polling...", "Approval required", "Result")
│       ├── status pill (pending | in-progress | awaiting-approval | completed | failed)
│       ├── authority + freshness metadata
│       └── fallback text (only when status is "failed")
└── ActiveApprovalGate (shown only when an awaiting-approval row is active)
    ├── approval context text
    ├── [Approve] button → calls onApprove(missionId, approvalItemId)
    └── [Reject] button → calls onReject(missionId, approvalItemId)
```

### 3.2 DGChainRow Visual States

| Status | Visual treatment |
|--------|-----------------|
| `pending` | Yellow left border, spinner icon, "Esperando al Director" |
| `waiting` | Gray left border, clock icon, "En espera" |
| `in-progress` | Blue left border, animated dot, "Ejecutando" |
| `awaiting-approval` | Orange left border, alert icon, renders `DGApprovalGate` inline |
| `completed` | Green left border, check icon, shows result summary |
| `rejected` | Red left border, X icon, "Rechazado por el Operator" |
| `failed` | Red left border, warning icon, shows fallback escalation text |

### 3.3 DGApprovalGate

```
DGApprovalGate
├── "⚠ El Director requiere aprobación del Operator"
├── action description (from approvalCheckpoint)
├── [ Aprobar ]  → POST /api/agenthub/missions/:id/reply { decision: "approved" }
└── [ Rechazar ] → POST /api/agenthub/missions/:id/reply { decision: "rejected" }
```

Disabled while submission is in flight. Error shown inline on failure.

### 3.4 Integration into SwarmControl View

The `DGObserverSidebar` is rendered as a collapsible panel within the existing control room layout, positioned below `EvidenceTimelinePanel` for the current mission context. When no mission is active, the sidebar shows an empty state: "Sin misión activa — iniciá una desde el Launchpad."

The `DGApprovalGate` is also wired into `ApprovalsErrorsPanel` — DG-authored `awaiting-approval` rows with `authority: "operator"` are rendered with the approve/reject controls there, avoiding duplicate rendering.

---

## 4. Edge Cases and Error Handling

### 4.1 Polling Errors

| Scenario | Handling |
|----------|---------|
| Transient HTTP error (5xx) | Retry up to 3 times with exponential backoff (1s, 2s, 4s). Show "Reconectando..." in sidebar. |
| Non-transient error (403, 404) | Stop polling. Display error in sidebar. Log to timeline as `status: "failed"` with fallback. |
| Network timeout | Treat as transient. Retry once immediately, then apply backoff. |
| Director not responding | After 30s of no response, mark `freshness: "stale"`. Continue polling. Show "Director no responde — persiste esperando." |

### 4.2 Duplicate Submission Guard

Before composing a new mission request, `useDirectorGeneralBridge` checks `activeMissionId`. If a mission is already in flight (non-terminal state), the UI blocks submission and shows: "Hay una misión activa — esperá a que finalize o cancelala primero."

### 4.3 Stale State Recovery

On component mount, if a non-terminal mission was persisted (e.g., tab reload), the bridge re-hydrates from `localStorage` key `devhub_dg_active_mission:<projectId>`. It resumes polling from the saved `missionId` and rebuilds the timeline row list from `GET /api/agenthub/missions/:id/timeline`.

### 4.4 Approval Race Condition

If the Operator clicks approve but the Director has already timed out the approval checkpoint:
- DG receives a `409 Conflict` on the reply POST
- Writes a timeline row `{ status: "failed", fallback: "La aprobación expiró. Volvé a intentar desde el Director." }`
- Shows error in `DGApprovalGate` with a retry option

### 4.5 Director Not Running

If the Director is offline when DG submits a mission request:
- The mission inbox returns `{ status: "director-offline" }` immediately
- DG writes `{ status: "failed", fallback: "El Director no está disponible. Verificá que el servicio esté corriendo." }`
- Polling does not start; sidebar shows failure state immediately

### 4.6 Timeline Row Ordering

All timeline rows for a mission are returned in `timestamp` ascending order. The UI renders them chronologically. DG does not reorder rows — it appends new rows and trusts the server's timestamp as the tiebreaker.

---

## 5. Polling Loop Details

```
startPolling(missionId):
  interval = config.pollIntervalMs  // default 1000
  backoff = 1000
  retries = 0

  loop:
    if (abort.signal.aborted) break
    await sleep(interval)
    if (abort.signal.aborted) break

    status = await GET /missions/:missionId/status
    if (status is terminal) {
      writeTimelineRow(status)
      break
    }
    if (status is "approval-required") {
      writeTimelineRow(status)
      // do NOT stop polling — approval may arrive and mission continues
    }
    if (error && transient) {
      retries++
      if (retries <= 3) { backoff *= 2; interval = backoff; continue }
      writeTimelineRow({ status: "failed", fallback: "Error de conexión con el Director." })
      break
    }
    retries = 0
    interval = config.pollIntervalMs  // reset backoff
```

---

## 6. DG MUST NOT — Enforcement Points

| Rule | Implementation enforcement |
|------|---------------------------|
| DG SHALL NOT call worker APIs | `bridge.js` has no import from `src/lib/swarm/worker*`. All calls go through `swarmDirectorClient`. |
| DG SHALL NOT spawn workers | No `workerSpawn*` functions imported or called in bridge module. |
| DG SHALL NOT write to worker roster | Roster writes only via `swarm-director` API (POST to mission inbox). |
| DG SHALL NOT bypass mission inbox | `bridge.js` `submitMissionRequest()` only calls `POST /api/agenthub/missions`. No direct function calls to Director internals. |
| DG SHALL NOT emit authority: "director" for DG-initiated actions | Timeline row factory validates `authority` against `initiator` — throws on invalid combination. |
| DG SHALL NOT emit authority: "director-escalated" for non-Director failures | Only `swarm-director` can emit `director-escalated`; DG emits `failed` with DG-authored fallback. |

---

## 7. Acceptance Criteria Mapping

| Criterion | Implementation artifact |
|-----------|----------------------|
| DG routes all mission requests exclusively through `swarm-director` | `bridge.js` only calls mission inbox endpoints |
| Every DG action emits a timeline row with all required schema fields | `timeline.js` `emitRow(action, status, opts)` validates all fields before POST |
| Observer sidebar displays full DG → Director → worker chain with authority and freshness | `DGObserverSidebar` + `EvidenceTimelinePanel` extension |
| Approval-required rows show approve/reject controls and block forwarding | `DGApprovalGate` + `ApprovalsErrorsPanel` integration |
| Failed rows display fallback text and do not auto-retry | `timeline.js` emits `status: "failed"` + `fallback`; polling loop exits on terminal state |
| DG uses mission inbox exclusively — no side-channel communication | `bridge.js` is the only module; all external calls are to `/api/agenthub/missions/*` |
| Prerequisites (steps 1–4) confirmed before implementation | Guard: implementation begins only after action contract, timeline, observer sidebar, limited operator actions specs are accepted |

---

## 8. Testing Strategy

| Test type | Coverage |
|-----------|---------|
| Unit: `timeline.js` row factory | All action/status combinations; invalid authority throws |
| Unit: `polling.js` loop | Terminal state exit, backoff, abort signal |
| Unit: `bridge.js` composeMissionRequest | Payload shape validation |
| Integration: full mission lifecycle | Start mission → wait for approval → approve → check result row |
| Integration: approval timeout | Submit approval after Director has expired checkpoint → check 409 + error row |
| Integration: stale Director | Mock Director offline → check immediate failure row, no polling loop |
| E2E: SwarmControl renders DG sidebar | Mount with no active mission → empty state; mount with active mission → chain rows |
| E2E: approve/reject flow | Click approve → POST → timeline row updated → approval gate removed |
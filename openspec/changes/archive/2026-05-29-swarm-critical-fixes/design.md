# Design: swarm-critical-fixes

## Architecture

Three bug fixes to DevHub's agent-swarm infrastructure. Each addresses a broken link in the agent lifecycle: heartbeat registration, message delivery, and terminal viewport persistence.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Agent Process                                   │
│  DEVHUB_SUPERVISOR_URL ──► buildAgentLaunchWrapper()                        │
│                              ├─► buildHeartbeatLoopCommand(supervisorUrl)   │
│                              │     └─► curl POST /api/agenthub/presence/    │
│                              │         heartbeat every 30s                  │
│                              └─► buildAgentEnvExports(supervisorUrl)       │
│                                    └─► export DEVHUB_SUPERVISOR_URL          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          route.js:168 (launch)                               │
│  buildAgentLaunchWrapper({                                                    │
│    agentId, missionId, role, workspacePath,                                  │
│    supervisorUrl: process.env.NEXT_PUBLIC_APP_URL + '/api/agenthub'          │
│  })                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    agent_heartbeat handler (route.js:2163)                   │
│                                                                              │
│  1. upsertAgentPresence(...)                                                 │
│  2. query pending_deliveries WHERE recipient_agent_id=? AND status='pending' │
│  3. return { ok, agent_id, mission_id, last_seen_at, pending_deliveries }   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TerminalTTY.jsx (ResizeObserver)                      │
│                                                                              │
│  resizeObserver callback (line 1927):                                        │
│    1. savedViewportY = getTerminalViewportScrollOffset()  ◄─ BEFORE resize  │
│    2. sendResize()  ──► xterm.js fit+resize                                  │
│    3. restoreTerminalViewportScroll(term, savedViewportY)  ◄─ AFTER (120ms) │
│                                                                              │
│  Visibility toggle effect (line 923):                                        │
│    ├─ isVisibleInLayout=true: restore lastViewportYRef.current              │
│    └─ isVisibleInLayout=false: save scroll to lastViewportYRef              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Changes

### 1. `route.js:168` — Pass `supervisorUrl` to `buildAgentLaunchWrapper()`

**Before**:

```js
const wrapper = buildAgentLaunchWrapper({
  agentId: `${launchId}-${roleKey}`,
  missionId: launchId,
  role: roleKey,
  workspacePath,
  tmuxSessionName,
  bootstrapPrompt: programId === 'opencode' ? prompt : '',
  innerCommand,
});
```

**After**:

```js
const supervisorUrl =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_URL
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'http://localhost:3000') + '/api/agenthub';

const wrapper = buildAgentLaunchWrapper({
  agentId: `${launchId}-${roleKey}`,
  missionId: launchId,
  role: roleKey,
  workspacePath,
  tmuxSessionName,
  bootstrapPrompt: programId === 'opencode' ? prompt : '',
  innerCommand,
  supervisorUrl,
});
```

**Key decisions**:

- `supervisorUrl` constructed from env var so agents can reach the correct origin regardless of deployment (local dev, staging, production).
- Fallback to `http://localhost:3000` prevents silent failure if env var is unset during development.
- `agentLaunchWrapper.js` already accepts `supervisorUrl` and exports it as `DEVHUB_SUPERVISOR_URL` env var (line 46) and uses it in `buildHeartbeatLoopCommand()` (line 239). No signature change needed.

**Affected lines**: `route.js:168` — add ~4 lines.

---

### 2. `route.js:2163–2196` — Include `pending_deliveries` in `agent_heartbeat` response

**Before**:

```js
return NextResponse.json({
  ok: true,
  agent_id,
  mission_id,
  last_seen_at: now,
});
```

**After**:

```js
// Query pending deliveries for this agent
const writeDb = dependencies.db || getDb();
const { listPendingDeliveriesForAgent } = require('@/lib/db/swarmMissions');
const pendingDeliveries = listPendingDeliveriesForAgent(writeDb, agent_id, {
  status: 'pending',
  limit: 50,
});

return NextResponse.json({
  ok: true,
  agent_id,
  mission_id,
  last_seen_at: now,
  pending_deliveries: pendingDeliveries.map((d) => ({
    delivery_id: d.delivery_id,
    message_id: d.message_id,
    sender_agent_id: d.sender_agent_id,
    payload: d.payload,
    created_at: d.created_at,
    status: d.status,
  })),
});
```

**Key decisions**:

- Reuse existing `listPendingDeliveriesForAgent()` from `swarmMissions.js` rather than writing raw SQL. Maintains consistency with existing data access patterns.
- Filter `status='pending'` per spec; only undelivered messages are returned.
- Map to a minimal shape (delivery_id, message_id, sender_agent_id, payload, created_at, status) to avoid leaking internal DB fields.
- 50-item cap prevents unbounded response growth when many messages queue up.

**New function call**: `listPendingDeliveriesForAgent(db, agentId, { status, limit })` — verify it exists and has correct signature. If not, implement it in `swarmMissions.js`.

**Affected lines**: `route.js:2163–2196` — add ~15 lines.

---

### 3. `TerminalTTY.jsx` ResizeObserver callback — capture `lastViewportYRef` BEFORE xterm resize

**Before** (lines 1927–1938):

```js
resizeObserverRef.current = new ResizeObserver(() => {
  const rect = containerRef.current?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return;
  logViewportDiagnostic('resize-observer');
  // Preserve scroll position across resize events (e.g., workspace switches)
  const savedViewportY = getTerminalViewportScrollOffset(termRef.current);
  const shouldStickToBottom = isTerminalViewportNearBottom(termRef.current);
  sendResize();
  if (!shouldStickToBottom && savedViewportY != null) {
    restoreTerminalViewportScroll(termRef.current, savedViewportY);
  }
});
```

**After**:

```js
resizeObserverRef.current = new ResizeObserver(() => {
  const rect = containerRef.current?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return;
  logViewportDiagnostic('resize-observer');

  // REQ-4: Capture scroll BEFORE xterm.js resize processes.
  // lastViewportYRef is restored after the 120ms debounce completes,
  // or by reactivateTerminalViewport as fallback.
  const savedViewportY = getTerminalViewportScrollOffset(termRef.current);
  lastViewportYRef.current = savedViewportY;

  const shouldStickToBottom = isTerminalViewportNearBottom(termRef.current);
  sendResize();

  if (!shouldStickToBottom && savedViewportY != null) {
    restoreTerminalViewportScroll(termRef.current, savedViewportY);
  }
});
```

**Key decisions**:

- `lastViewportYRef.current = savedViewportY` added to persist scroll position on resize, not just visibility toggles. This ensures the ref always holds the latest scroll position for the `isVisibleInLayout` effect to restore.
- Existing `savedViewportY` local variable is captured before `sendResize()`, then used both to restore immediately and to store in the ref for the `isVisibleInLayout` effect.
- The immediate restore after `sendResize()` handles the resize-triggered scroll reset; the ref update handles workspace switches where the panel is hidden and then shown again.
- `reactivateTerminalViewport` (line 939) remains unchanged as the fallback safety net for edge cases.

**Affected lines**: `TerminalTTY.jsx:1927–1938` — add 1 line.

---

## Data Flow

### Heartbeat loop (REQ-1 → REQ-3)

```
Agent process starts
  └─► buildAgentLaunchWrapper({ supervisorUrl })
        ├─► buildAgentEnvExports({ supervisorUrl })
        │     └─► export DEVHUB_SUPERVISOR_URL=".../api/agenthub"
        └─► buildHeartbeatLoopCommand({ supervisorUrl, agentId, missionId })
              └─► bash loop: every 30s, POST to ${supervisorUrl}/presence/heartbeat
                    ├─ payload: { agent_id, mission_id, role, cwd, state, status_summary }
                    └─ response: { ok, agent_id, mission_id, last_seen_at, pending_deliveries }
                          └─► Agent parses pending_deliveries from same response (no extra GET)
```

### Pending deliveries (REQ-2)

```
Agent heartbeat POST /api/agenthub/presence/heartbeat
  └─► route.js agent_heartbeat handler
        ├─► upsertAgentPresence(db, { agent_id, mission_id, workspace_id, ... })
        ├─► listPendingDeliveriesForAgent(db, agent_id, { status: 'pending', limit: 50 })
        └─► return { ok, agent_id, mission_id, last_seen_at, pending_deliveries: [...] }
              └─► curl response parsed by agent heartbeat loop
```

### Terminal scroll (REQ-4)

```
Workspace switch → ResizeObserver fires
  └─► callback: savedViewportY = getTerminalViewportScrollOffset()  ◄─ BEFORE
      lastViewportYRef.current = savedViewportY
      sendResize()  ──► xterm.js fit+resize (viewport reset to top attempted)
      restoreTerminalViewportScroll(term, savedViewportY)  ◄─ immediate restore
      │
      └── 120ms debounce (existing) ──► fitAndResize() again + restore
          │
          └── If resize completes before restore ──► reactivateTerminalViewport fallback
```

---

## Testing Strategy

| Layer       | What                                                                                       | How                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Unit        | `buildAgentLaunchWrapper` passes `supervisorUrl` through to env exports and heartbeat loop | Modify `agentLaunchWrapper.test.js`: assert `DEVHUB_SUPERVISOR_URL` in exports output when `supervisorUrl` arg provided |
| Unit        | `agent_heartbeat` handler returns `pending_deliveries` filtered by agent_id                | Add assertion to `route.integration.test.js`: POST heartbeat, assert `pending_deliveries` field exists and is an array  |
| Unit        | ResizeObserver saves `lastViewportYRef` before `sendResize()`                              | Add test: mock ResizeObserver callback, verify `lastViewportYRef.current` is set before `sendResize` call               |
| Integration | Full heartbeat round-trip with pending deliveries                                          | Add test: seed a pending delivery for agent-123, POST heartbeat for agent-123, assert delivery appears in response      |
| Integration | Terminal scroll restoration on workspace switch                                            | Add Playwright test: open terminal, scroll up, switch workspace, switch back, assert scroll position preserved          |

---

## Open Questions

- [ ] `listPendingDeliveriesForAgent(db, agentId, options)` — verify this function exists in `swarmMissions.js` with the correct signature (status filter, limit). If it doesn't exist, implement it. Confirm the exact return shape and whether it handles the `recipient_agent_id` filter natively or needs a wrapper.
- [ ] Agent-side heartbeat loop needs to be verified: confirm it parses `pending_deliveries` from the POST response body rather than issuing a separate GET. If the agent code lives in a separate repo (plyrium/opencode), the fix needs to be communicated there — confirm where the agent heartbeat loop code lives.

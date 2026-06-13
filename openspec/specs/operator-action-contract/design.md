# Operator Action Contract — Design

## Status

Draft. This design implements the contract specified in `spec.md`.

---

## 1. Overview

The contract is enforced across four layers: **Intent Router**, **Policy Layer**, **Adapter Boundary**, and **MCP / Tool Layer**. A React context (`OperatorActionContext`) threads the policy engine through the entire UI. No surface dispatches a tool directly — all calls go through the intent dispatch path.

---

## 2. Architecture

### 2.1 Component Inventory

| File | Responsibility |
|------|----------------|
| `src/lib/operations/action-registry.js` | Canonical action registry: id → class, tier, params schema, label |
| `src/lib/operations/policy-layer.js` | Permission checks, tier resolution, confirmation gating |
| `src/lib/operations/intent-router.js` | Thin classifier — receives dispatch, classifies, calls Policy Layer |
| `src/lib/operations/audit-emitter.js` | Event emission with secret redaction, async flush to store |
| `src/lib/operator/OperatorActionContext.jsx` | React context exposing `dispatchAction()`, role, confirm state |
| `src/components/operator-confirm-dialog/ConfirmDialog.jsx` | Tier 2 one-step confirmation |
| `src/components/operator-confirm-dialog/ExecuteDialog.jsx` | Tier 3 rationale-confirmation |
| `src/components/operator-confirm-dialog/index.js` | Unified dialog shell, routes to Tier 2 or 3 by action tier |

### 2.2 Data Flow

```
UI component
  |
  | dispatchAction({ action_id, params, target, actor_session_id })
  v
OperatorActionContext
  |
  | (sync) Intent Router — classify + policy check
  |   → returns PROCEED | CONFIRM_REQUIRED | DENIED | DEFERRED
  v
  ├─ PROCEED  → Adapter Boundary → MCP Tool → audit emitted
  |
  ├─ CONFIRM_REQUIRED → opens dialog in context state
  |       user confirms → re-enters dispatch path with confirmation receipt
  |       user cancels  → emits DENIED audit, no-op
  |
  ├─ DENIED   → emits DENIED audit, throws PolicyDeniedError (UI catches)
  |
  └─ DEFERRED → emits DEFERRED audit, throws PolicyDeferredError (UI catches)
```

The re-entry path (user confirms → dispatch again) carries the original `action_id`, `params`, `target`, and the newly added `confirmation` object. The intent router detects this and skips the confirmation gate.

### 2.3 State Management

- **No global store dependency.** `OperatorActionContext` uses React `useReducer` internally.
- Dialog state (`open`, `pendingAction`, `confirmationReceipt`) lives in context, not URL or localStorage.
- The confirmation receipt is ephemeral per-dispatch cycle. It is not cached across sessions.
- Actor role is injected by the caller (session context) and passed as `actor_role` in every dispatch call.

### 2.4 Design Decisions

**Decision 1: Policy Layer as injectable singleton.**
The policy engine is a plain JS class (`PolicyEngine`) instantiated once and attached to the context. This allows swapping for testing or future externalized policy services without changing the dispatch contract.

**Decision 2: Intent Router is a pure function (no side effects).**
The router classifies and checks policy but never emits audit events directly. This separation keeps the classification path synchronous and testable without I/O mocking.

**Decision 3: Confirmation receipt is not a token.**
The spec calls for `confirmed: true` and `confirmed_at` in the audit. The re-entry dispatch carries these as plain fields. No JWT or signed token is used — the audit store is append-only and the receipt is validated server-side at the Adapter Boundary.

**Decision 4: Audit is fire-and-forget from the dispatch path.**
`audit-emitter.js` enqueues events in a ring buffer and flushes asynchronously. It never blocks the dispatch return. Events lost due to process crash are acceptable for Tier 0/1; Tier 2/3 events are flushed before the action executes (not after) to guarantee durability for confirmed actions.

**Decision 5: Deny-by-default enforced at the Intent Router.**
Any `action_id` not found in the registry is treated as Tier 4 and returns `DEFERRED`. No silent passthrough.

---

## 3. Action Registry Schema

`src/lib/operations/action-registry.js`

```js
// Shape
{
  'obs_log_tail': {
    class: 'observe',   // obs | nav | mut | orch
    tier: 0,
    label: 'Stream log lines',
    targetTypes: ['session', 'agent'],  // allowed target.type values
    paramsSchema: {
      session_id: { type: 'string', required: true },
      lines:      { type: 'number', default: 50 }
    }
  },
  'nav_terminal': {
    class: 'nav',
    tier: 1,
    label: 'Focus terminal pane',
    targetTypes: ['pane'],
    paramsSchema: { pane_id: { type: 'string', required: true } }
  },
  'mut_session_name': {
    class: 'mutate',
    tier: 2,
    label: 'Rename session',
    targetTypes: ['session'],
    paramsSchema: {
      session_id: { type: 'string', required: true },
      name:       { type: 'string', required: true, maxLength: 128 }
    }
  },
  'orch_spawn_agent': {
    class: 'orchestrate',
    tier: 3,
    label: 'Spawn agent',
    targetTypes: ['session'],
    paramsSchema: {
      session_id:  { type: 'string', required: true },
      agent_type: { type: 'string', required: true }
    }
  },
  'orch_credential_export': {
    class: 'orchestrate',
    tier: 4,  // critical — deferred
    label: 'Export credential',
    targetTypes: ['credential'],
    paramsSchema: {}
  },
  // ... remainder from spec section 2.2
}
```

The registry is a plain frozen object (`Object.freeze`) at module load time. It is not dynamically registered at runtime.

---

## 4. Policy Layer

`src/lib/operations/policy-layer.js`

```js
// Permission matrix (from spec section 3.2)
const PERMISSION_MATRIX = {
  obs:        { observe: 'MAY',        nav: 'MUST_NOT', mut: 'MUST_NOT', orchestrate: 'MUST_NOT' },
  op:         { observe: 'MAY',        nav: 'MAY',       mut: 'MAY',      orchestrate: 'MUST_NOT' },
  dir:        { observe: 'MAY',        nav: 'MAY',       mut: 'MAY',      orchestrate: 'MAY'      },
  sys:        { observe: 'MAY',        nav: 'MAY',       mut: 'MAY',      orchestrate: 'MAY'      }
}

class PolicyEngine {
  check(actionId, actorRole, confirmation) {
    // 1. Lookup action in registry — unknown → DEFERRED
    // 2. Map class to column in PERMISSION_MATRIX
    // 3. If cell === 'MUST_NOT' → DENIED
    // 4. If action.tier === 4 → DEFERRED
    // 5. If action.tier >= 2 AND !confirmation → CONFIRM_REQUIRED
    // 6. Otherwise → PROCEED
  }
}
```

The `confirmation` argument is `null` on first dispatch (pre-confirmation) and a receipt object on re-entry.

---

## 5. Intent Router

`src/lib/operations/intent-router.js`

```js
function routeDispatch({ action_id, params, target, actor_role, actor_session_id, confirmation, devhub_version }) {
  const actionDef = registry[action_id]
  if (!actionDef) {
    return { status: 'DEFERRED', error_detail: `Unknown action: ${action_id}` }
  }

  const result = policy.check(action_id, actor_role, confirmation)
  // result: { status, reason?, confirmed_at?, rationale? }

  if (result.status === 'PROCEED') {
    return { status: 'PROCEED', actionDef, params }
  }

  return result  // CONFIRM_REQUIRED | DENIED | DEFERRED
}
```

### 5.1 Restricted Navigation Check

For `nav_*` actions targeting a restricted pane (configurable set), the router inserts a pre-check:

```js
const RESTRICTED_PANES = new Set(['credential-panel', 'secret-overlay'])

function checkNavigation(actionDef, params) {
  if (actionDef.class === 'nav' && RESTRICTED_PANES.has(params.pane_id)) {
    return { status: 'NAVIGATE_RESTRICTED', error_detail: 'restricted pane' }
  }
  return null
}
```

The restricted pane set is declared in `src/lib/operations/policy-layer.js` as a module-level constant, configurable via environment variable `DH_RESTRICTED_PANES` (comma-separated).

---

## 6. Adapter Boundary

`src/lib/operations/adapter-boundary.js`

Maps canonical `action_id` to MCP tool names and handles secret redaction + audit emission.

```js
const ACTION_TOOL_MAP = {
  obs_log_tail:     'devhub_get_session_logs',
  obs_agent_state:  'devhub_get_agent_state',
  nav_terminal:     null,         // UI-only, no MCP tool
  mut_session_name: 'devhub_rename_session',
  orch_spawn_agent: 'devhub_spawn_agent',
  // ...
}

function executeAction({ action_id, params, auditContext }) {
  const toolName = ACTION_TOOL_MAP[action_id]
  if (toolName === null) {
    // UI-only action — no MCP call; return a synthetic ok
    return { ok: true, uiOnly: true }
  }
  return mcpClient.callTool(toolName, redactSecrets(params))
}
```

### 6.1 Secret Redaction

```js
const SECRET_PATTERNS = [/\bpassword\b/i, /\btoken\b/i, /\bsecret\b/i, /\bkey\b/i]

function redactSecrets(obj) {
  return JSON.parse(JSON.stringify(obj), (k, v) =>
    SECRET_PATTERNS.some(p => p.test(k)) ? '[REDACTED]' : v
  )
}
```

### 6.2 Audit Flush Ordering

For Tier 2 and Tier 3 actions, the adapter boundary:
1. Emits the audit event with `confirmed: true` and `confirmed_at`.
2. Only then calls the MCP tool.

This ensures the audit record is durable even if the MCP call fails (error is then written to a second audit event).

---

## 7. Audit Emitter

`src/lib/operations/audit-emitter.js`

```js
// Ring buffer — 64 slots, flush on every Tier 2/3 dispatch
// and on SIGTERM / window beforeunload for Tier 0/1
const buffer = new Array(64)
let head = 0

function emit(event) {
  buffer[head % 64] = { ...event, _queued_at: Date.now() }
  head++
  if (event.risk_tier >= 2) flush()
}

async function flush() {
  // Writes to existing timeline/audit store endpoint
  // POST /api/audit/events  (new route, append-only)
  await fetch('/api/audit/events', {
    method: 'POST',
    body: JSON.stringify(buffer.slice(0, head % 64)),
    keepalive: true
  })
}
```

The audit store API route (`/api/audit/events`) appends events to a SQLite table via the existing `src/lib/db/schema.js` infrastructure. Schema:

```sql
CREATE TABLE audit_events (
  id          TEXT PRIMARY KEY,
  event_id    TEXT UNIQUE NOT NULL,
  action_id   TEXT NOT NULL,
  action_class TEXT NOT NULL,
  actor_role  TEXT NOT NULL,
  actor_session_id TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  target_label TEXT,
  params      TEXT,          -- JSON, secrets already redacted
  risk_tier   INTEGER,
  confirmed   INTEGER,        -- 1 or 0
  confirmed_at TEXT,
  rationale   TEXT,
  outcome     TEXT NOT NULL,  -- success | denied | error | deferred
  error_detail TEXT,
  devhub_version TEXT,
  received_at TEXT DEFAULT (datetime('now'))
);
```

---

## 8. React Context API

`src/lib/operator/OperatorActionContext.jsx`

```tsx
interface OperatorActionContextValue {
  // Role of the current session (obs | op | dir | sys)
  actorRole: ActorRole

  // Current pending action awaiting confirmation, or null
  pendingAction: PendingAction | null

  // Dismiss the confirmation dialog without acting
  cancelAction: () => void

  // Confirm and re-dispatch (caller does NOT call dispatchAction again)
  confirmAction: (receipt: ConfirmationReceipt) => Promise<void>
}

interface PendingAction {
  actionId: string
  actionDef: ActionDef
  params: Record<string, unknown>
  target: Target
  actorRole: ActorRole
  actorSessionId: string
}

interface ConfirmationReceipt {
  confirmed: true
  confirmed_at: string  // ISO-8601
  rationale?: string     // required for tier 3
}
```

**Usage in a component:**

```tsx
const { dispatchAction } = useOperatorAction()
await dispatchAction({
  action_id: 'mut_session_name',
  params: { session_id: 'abc-123', name: 'debug-session' },
  target: { type: 'session', id: 'abc-123', label: 'session-abc-123' }
})
// If tier >= 2, the dialog opens automatically via context state.
// If tier < 2, the action executes synchronously.
```

**Provider placement:** `OperatorActionProvider` wraps the root layout in `src/app/layout.jsx` so all surfaces have access.

---

## 9. Confirmation Dialogs

### 9.1 ConfirmDialog (Tier 2)

`src/components/operator-confirm-dialog/ConfirmDialog.jsx`

- Title: the action's `label` from the registry
- Body: target label + params table (secrets already redacted by adapter, but params are validated against schema before this render)
- Footer: "Cancel" (secondary) and "Confirm" (primary) buttons
- Closes on: backdrop click (cancels), Escape key (cancels), "Confirm" (dispatches with receipt)
- **No rationale field.** The spec requires rationale only for Tier 3.

```tsx
function ConfirmDialog({ pending, onConfirm, onCancel }) {
  const [params, target, actionDef] = [
    pending.params, pending.target, pending.actionDef
  ]

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{actionDef.label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground">Target:</span>
            <span>{target.label}</span>
          </div>
          <pre className="bg-muted p-2 rounded text-xs overflow-auto">
            {JSON.stringify(params, null, 2)}
          </pre>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### 9.2 ExecuteDialog (Tier 3)

`src/components/operator-confirm-dialog/ExecuteDialog.jsx`

- Title: `actionDef.label` + "(requires confirmation)"
- Body: target + params + a `<Textarea>` for rationale (label: "Reason for this action")
- Rationale validation: `>= 10` characters,实时 character count shown
- "Execute" button: disabled when rationale.length < 10; enabled state turns primary color
- Timeout: 60-second countdown timer displayed below the textarea; on expiry the dialog auto-closes and emits DENIED audit
- All other behavior identical to Tier 2 dialog

```tsx
function ExecuteDialog({ pending, onConfirm, onCancel }) {
  const [rationale, setRationale] = useState('')
  const [countdown, setCountdown] = useState(60)

  useEffect(() => {
    if (rationale.length < 10) return
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { onCancel(); return 60 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [rationale, onCancel])

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      {/* ... same header/body as Tier 2 ... */}
      <div className="space-y-2">
        <Textarea
          value={rationale}
          onChange={e => setRationale(e.target.value)}
          placeholder="Describe why you are performing this action (min. 10 characters)"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{rationale.length} / 10 min</span>
          <span className={countdown <= 10 ? 'text-destructive' : ''}>
            {countdown}s remaining
          </span>
        </div>
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button disabled={rationale.length < 10} onClick={onConfirm}>
          Execute
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
```

### 9.3 Dialog Shell

`src/components/operator-confirm-dialog/index.js`

```tsx
function OperatorConfirmDialog({ pendingAction, onConfirm, onCancel }) {
  if (!pendingAction) return null
  const { tier } = pendingAction.actionDef
  if (tier < 2) return null  // no dialog for Tier 0/1

  return tier === 2
    ? <ConfirmDialog pending={pendingAction} onConfirm={onConfirm} onCancel={onCancel} />
    : <ExecuteDialog pending={pendingAction} onConfirm={onConfirm} onCancel={onCancel} />
}
```

This component is rendered inside `OperatorActionProvider` (or immediately outside the provider, reading `pendingAction` from context) at the layout root so the modal renders above all other UI.

---

## 10. API Surface

### 10.1 Internal Dispatch API

```
POST /api/operator/dispatch  (internal only, not exposed externally)
```

Request:
```jsonc
{
  "action_id": "mut_session_name",
  "params": { "session_id": "abc-123", "name": "debug-session" },
  "target": { "type": "session", "id": "abc-123", "label": "session-abc-123" },
  "actor_role": "op",
  "actor_session_id": "op-456",
  "confirmation": null,          // or { "confirmed": true, "confirmed_at": "...", "rationale": "..." }
  "devhub_version": "0.1.0"
}
```

Response (CONFIRM_REQUIRED):
```jsonc
{ "status": "CONFIRM_REQUIRED", "action_id": "mut_session_name", "tier": 2 }
```

Response (PROCEED):
```jsonc
{ "status": "PROCEED", "result": { ...MCP tool result... } }
```

Response (DENIED):
```jsonc
{ "status": "DENIED", "error_detail": "role not permitted for orch_*" }
```

Response (DEFERRED):
```jsonc
{ "status": "DEFERRED", "error_detail": "POLICY_DENIED: deferred — see operator-action-contract spec" }
```

### 10.2 Audit Store API

```
POST /api/audit/events
```

Request: array of audit event objects (schema from spec section 5)

### 10.3 Action Metadata API

```
GET /api/operator/actions
```

Returns the full action registry (excluding Tier 4 actions, which must not be enumerable by clients). Response:
```jsonc
{
  "actions": [
    { "action_id": "obs_log_tail", "class": "observe", "tier": 0, "label": "Stream log lines" },
    ...
  ]
}
```

This endpoint is used by the UI to render action labels without importing the registry directly.

---

## 11. Integration with Existing Code

### 11.1 DevHub MCP Adapter Boundary

`devhub-mcp/server.js` is updated to accept an optional policy header:

```js
// Inside existing tool handler
if (req.headers['x-dh-action-id']) {
  // Called via operator action contract
  const dispatchResult = await dispatchActionFromAdapter({
    action_id: req.headers['x-dh-action-id'],
    params: req.body,
    actor_role: req.headers['x-dh-actor-role'] ?? 'sys'
  })
  if (dispatchResult.status !== 'PROCEED') {
    return new Response(JSON.stringify(dispatchResult), { status: 403 })
  }
  // fall through to tool execution
}
```

The MCP adapter checks `action_id` before executing any tool. Tools not reachable via an `action_id` remain accessible only through the direct MCP interface (not the operator contract path).

### 11.2 Tauri IPC Integration

The Tauri desktop runtime exposes `dh_dispatch_action` via the command bridge so the Rust host can trigger actions from native controls:

```rust
#[tauri::command]
async fn dh_dispatch_action(action_id: String, params: Value, target: Value) -> Result<Value, String> {
    dispatch_operator_action(action_id, params, target).await
}
```

This lets native menu items and keyboard shortcuts trigger operator actions with the same policy enforcement as UI-initiated actions.

---

## 12. Edge Cases and Error Handling

| Scenario | Behavior |
|----------|----------|
| Unknown `action_id` not in registry | Intent Router returns `DEFERRED`; audit event `outcome: "deferred"` |
| Role not permitted for action class | Policy Layer returns `DENIED`; UI shows inline error toast |
| Tier 3 rationale < 10 chars | Execute button disabled; no dispatch possible |
| 60s Tier 3 timer expires | Dialog auto-closes; audit event `outcome: "denied", error_detail: "timeout"` |
| MCP tool call fails after audit flush | Adapter Boundary emits second audit event `outcome: "error"` with `error_detail` |
| Network failure on audit flush | Ring buffer retains last 64 events; flush retried on next dispatch |
| `window.beforeunload` with unflushed Tier 0/1 events | `keepalive: true` on the fetch call ensures at-least-once delivery |
| Restricted navigation target | Intent Router returns `NAVIGATE_RESTRICTED`; UI shows access-denied inline message |
| Confirmed action replay (duplicate dispatch) | Each dispatch generates a new `event_id`; idempotency is handled at the MCP tool layer |
| Confirmed action re-dispatched with wrong session | Adapter Boundary validates `actor_session_id` matches current session before calling tool |
| Tier 2 action called from Observer role | Policy Layer returns `DENIED`; error detail: "role not permitted for mut_*" |
| `DH_RESTRICTED_PANES` env var malformed | Falls back to hardcoded default set; logs warning to console |

---

## 13. File Map

```
src/
  lib/
    operations/
      action-registry.js       # Canonical action definitions (frozen object)
      policy-layer.js          # PolicyEngine class + permission matrix
      intent-router.js         # routeDispatch() pure function
      adapter-boundary.js      # executeAction() + ACTION_TOOL_MAP + redaction
      audit-emitter.js         # ring buffer + flush()
    operator/
      OperatorActionContext.jsx  # React context + provider
  components/
    operator-confirm-dialog/
      index.js                 # Dialog shell, routes by tier
      ConfirmDialog.jsx        # Tier 2 one-step dialog
      ExecuteDialog.jsx        # Tier 3 rationale + timer dialog
  app/
    api/
      operator/
        dispatch/
          route.js             # POST /api/operator/dispatch
      audit/
        events/
          route.js             # POST /api/audit/events
      operator/
        actions/
          route.js             # GET /api/operator/actions
```

---

## 14. Test Plan

All 8 scenarios from spec section 7 are implemented as integration tests in `src/lib/operations/__tests__/`:

| Test | Covers |
|------|--------|
| `scenario-obs-log-tail.spec.js` | Scenario 7.1 — Observer reads logs |
| `scenario-nav-terminal.spec.js` | Scenario 7.2 — Operator navigates |
| `scenario-nav-restricted.spec.js` | Scenario 7.3 — Operator navigates restricted pane |
| `scenario-mut-session-name.spec.js` | Scenario 7.4 — Operator modifies session name |
| `scenario-orch-spawn-agent.spec.js` | Scenario 7.5 — Director executes agent spawn |
| `scenario-orch-credential-export.spec.js` | Scenario 7.6 — Director attempts Tier 4 deferred action |
| `scenario-role-nav-denied.spec.js` | Scenario 7.7 — Observer attempts navigation (role violation) |
| `scenario-role-orch-denied.spec.js` | Scenario 7.8 — Operator attempts orchestrate (role violation) |

Each test:
1. Instantiates a fresh `PolicyEngine` (no shared state between tests).
2. Calls `routeDispatch` directly with the described inputs.
3. Asserts on `status`, `outcome` in the emitted audit event, and any thrown error type.

Additional unit tests:
- `audit-emitter.redactSecrets.spec.js` — verifies no secret field leaks.
- `action-registry.spec.js` — verifies registry is frozen, all `nav_*` actions are Tier 1, all `orch_*` actions Tier 3 or 4, no unregistered actions.
- `execute-dialog.rationale-min.spec.js` — confirms Execute button disabled below 10 chars.
- `execute-dialog.countdown.spec.js` — confirms auto-close at 0.

---

## 15. Open Issues

| Issue | Decision Needed |
|-------|----------------|
| Should `NAVIGATE_RESTRICTED` emit a DENIED or a custom `NAVIGATE_RESTRICTED` audit outcome? | Audit outcome should be `denied` with `error_detail: "restricted pane"` per scenario 7.3 |
| Does `sys` role require confirmation for Tier 2/3 actions? | Spec says sys bypasses confirmation but emits audit. The adapter boundary MUST still flush the confirmed audit BEFORE executing the tool. |
| How does the 60s Tier 3 timer interact with server-side confirmation receipts? | Timer is client-side UI only. Server-side confirmation receipt is issued immediately on re-dispatch. The server does not enforce a timeout. |
| Should `GET /api/operator/actions` paginate or filter by role? | First cut: return full registry (minus Tier 4); client-side filters by role using the permission matrix. Future: server-side role filtering. |
# Operator Action Contract — Tasks

## Overview

Breakdown into ordered, dependency-aware work units. Each task is one self-contained commit. Prerequisites are listed explicitly.

---

## Task 1: Action Registry

**File target:** `src/lib/operations/action-registry.js`

**Description:** Create the frozen canonical registry mapping every `action_id` to its class, tier, label, allowed target types, and params schema. Populate all actions from spec section 2.2 plus the four documented in design.md (`obs_log_tail`, `nav_terminal`, `mut_session_name`, `orch_spawn_agent`, `orch_credential_export`).

**Acceptance criteria:**
- Registry is a plain frozen object (`Object.freeze` at module load).
- All `obs_*` actions are Tier 0, all `nav_*` are Tier 1, `mut_*` are Tier 2, `orch_*` are Tier 3 or Tier 4.
- `orch_credential_export` is explicitly Tier 4.
- `paramsSchema` includes required fields and defaults for each action.
- Registry exports a `getAction(actionId)` helper and a `listActions()` helper.

**Prerequisites:** None.

---

## Task 2: Audit Emitter with Ring Buffer

**File target:** `src/lib/operations/audit-emitter.js`

**Description:** Implement the ring buffer (64 slots) and async flush. Events are enqueued on every dispatch and flushed synchronously before Tier 2/3 actions execute. Tier 0/1 events flush on next dispatch and on `window.beforeunload` (keepalive fetch).

**Acceptance criteria:**
- `emit(event)` enqueues to ring buffer, calls `flush()` if `risk_tier >= 2`.
- `flush()` POSTs all buffered events to `/api/audit/events` with `keepalive: true`.
- `redactSecrets(obj)` replaces any key matching `password|token|secret|key` (case-insensitive) with `'[REDACTED]'`.
- Unit test `audit-emitter.redactSecrets.spec.js` verifies no secret field leaks.

**Prerequisites:** Task 1.

---

## Task 3: Policy Engine

**File target:** `src/lib/operations/policy-layer.js`

**Description:** Implement `PolicyEngine` with the permission matrix from spec section 3.2. `check(actionId, actorRole, confirmation)` returns `PROCEED | CONFIRM_REQUIRED | DENIED | DEFERRED`. Also define `RESTRICTED_PANES` and support `DH_RESTRICTED_PANES` env-var override.

**Acceptance criteria:**
- `obs` role can only `observe`; `nav`, `mut`, `orch` → `DENIED`.
- `op` role can `observe` and `nav` freely; `mut` → `CONFIRM_REQUIRED`; `orch` → `DENIED`.
- `dir` role can do everything except Tier 4 (→ `DEFERRED`).
- `sys` role same as `dir` but never returns `CONFIRM_REQUIRED`.
- Unknown `action_id` → `DEFERRED`.
- `tier >= 2 && !confirmation` → `CONFIRM_REQUIRED`.
- `DH_RESTRICTED_PANES` env var parsed as comma-separated set; malformed → warn + fallback to defaults.

**Prerequisites:** Task 1.

---

## Task 4: Intent Router

**File target:** `src/lib/operations/intent-router.js`

**Description:** Implement `routeDispatch()` as a pure function. Looks up action in registry, delegates to PolicyEngine, returns status object. Includes `NAVIGATE_RESTRICTED` check for restricted pane targets.

**Acceptance criteria:**
- Unknown `action_id` → `{ status: 'DEFERRED', error_detail: 'Unknown action: {id}' }`.
- `checkNavigation()` returns `NAVIGATE_RESTRICTED` for `nav_*` actions targeting panes in `RESTRICTED_PANES`.
- Returns `{ status: 'PROCEED', actionDef, params }` on success.
- Returns confirmation/denied/deferred result unchanged.
- No side effects (no audit emission, no I/O).

**Prerequisites:** Tasks 1, 3.

---

## Task 5: Audit Events API Route

**File target:** `src/app/api/audit/events/route.js`

**Description:** Implement `POST /api/audit/events` that appends audit events to the SQLite `audit_events` table. Schema matches design.md section 7. Validate required fields; return `201` on success, `400` on malformed payload.

**Acceptance criteria:**
- Endpoint accepts array of event objects.
- Each event gets `received_at` timestamp on insert.
- Returns `201` with count of inserted rows.
- Returns `400` if `event_id` or `action_id` missing.
- Table `audit_events` added to `src/lib/db/schema.js`.

**Prerequisites:** Task 2.

---

## Task 6: Operator Dispatch API Route

**File target:** `src/app/api/operator/dispatch/route.js`

**Description:** Implement `POST /api/operator/dispatch`. Receives dispatch payload, calls `routeDispatch()`, handles confirmation re-entry, calls `executeAction()` from adapter boundary on `PROCEED`, emits audit events. Returns typed response per design.md section 10.1.

**Acceptance criteria:**
- Validates `action_id`, `actor_role`, `actor_session_id` in request body.
- On `PROCEED`: calls `executeAction()`, returns `{ status: 'PROCEED', result }`.
- On `CONFIRM_REQUIRED`: returns `{ status: 'CONFIRM_REQUIRED', action_id, tier }`.
- On `DENIED`: emits audit `outcome: 'denied'`, returns `{ status: 'DENIED', error_detail }`.
- On `DEFERRED`: emits audit `outcome: 'deferred'`, returns `{ status: 'DEFERRED', error_detail }`.
- Re-entry dispatch with confirmation: skips confirmation gate, proceeds directly.

**Prerequisites:** Tasks 3, 4, 5.

---

## Task 7: Adapter Boundary

**File target:** `src/lib/operations/adapter-boundary.js`

**Description:** Implement `executeAction()` with `ACTION_TOOL_MAP`, secret redaction, and Tier 2/3 pre-execution audit flush. UI-only actions (`nav_terminal`, etc.) return `{ ok: true, uiOnly: true }` without MCP call.

**Acceptance criteria:**
- `ACTION_TOOL_MAP` maps every non-UI action to its MCP tool name.
- `null` tool name → UI-only, no MCP call.
- `redactSecrets()` called on params before audit emission.
- Tier 2/3: audit event with `confirmed: true` flushed BEFORE MCP tool call.
- If MCP call fails: emit second audit event with `outcome: 'error'` and `error_detail`.
- Validates `actor_session_id` matches current session before calling tool.

**Prerequisites:** Tasks 2, 4, 6.

---

## Task 8: Operator Actions Metadata API Route

**File target:** `src/app/api/operator/actions/route.js`

**Description:** Implement `GET /api/operator/actions`. Returns full registry minus Tier 4 actions. Client uses this to render action labels without importing the registry directly.

**Acceptance criteria:**
- Returns `{ actions: [...] }` array of `{ action_id, class, tier, label }`.
- Tier 4 actions are excluded from the response.
- Returns `200`.

**Prerequisites:** Task 1.

---

## Task 9: ConfirmDialog (Tier 2)

**File target:** `src/components/operator-confirm-dialog/ConfirmDialog.jsx`

**Description:** One-step confirmation dialog. Shows action label, target label, and params table. No rationale field. Cancel dismisses and emits DENIED audit; Confirm calls `onConfirm` with the confirmation receipt.

**Acceptance criteria:**
- Title is the action's `label` from registry.
- Target label rendered as text; params as formatted JSON (no secrets).
- "Cancel" (secondary) and "Confirm" (primary) buttons in footer.
- Closes on backdrop click (cancels), Escape key (cancels).
- Calls `onCancel()` or `onConfirm({ confirmed: true, confirmed_at: ISO-8601 })`.

**Prerequisites:** Tasks 1, 7 (params sanitized upstream).

---

## Task 10: ExecuteDialog (Tier 3)

**File target:** `src/components/operator-confirm-dialog/ExecuteDialog.jsx`

**Description:** Rationale-confirmation dialog. Shows same base info as Tier 2 plus a textarea. Rationale must be >= 10 chars before Execute button enables. 60-second countdown; on expiry auto-closes and calls `onCancel()`.

**Acceptance criteria:**
- Textarea label: "Reason for this action".
- Execute button disabled when `rationale.length < 10`; enabled at 10+.
- Live character count displayed (`{n} / 10 min`).
- Countdown displayed below textarea; turns red at `<= 10s`.
- Timer auto-closes at 0: calls `onCancel()`.
- `onConfirm({ confirmed: true, confirmed_at: ISO-8601, rationale })`.

**Prerequisites:** Tasks 1, 7, 9.

---

## Task 11: Dialog Shell

**File target:** `src/components/operator-confirm-dialog/index.js`

**Description:** Unified dialog shell. Reads `tier` from `pendingAction.actionDef` and routes to `ConfirmDialog` (tier 2) or `ExecuteDialog` (tier 3). Returns `null` for `tier < 2` or no pending action.

**Acceptance criteria:**
- Renders `ConfirmDialog` when `pendingAction.actionDef.tier === 2`.
- Renders `ExecuteDialog` when `pendingAction.actionDef.tier === 3`.
- Returns `null` for Tier 0/1 or `pendingAction === null`.
- All three props (`pending`, `onConfirm`, `onCancel`) wired correctly.

**Prerequisites:** Tasks 9, 10.

---

## Task 12: OperatorActionContext

**File target:** `src/lib/operator/OperatorActionContext.jsx`

**Description:** React context exposing `dispatchAction()`, `actorRole`, `pendingAction`, `cancelAction`, `confirmAction`. Uses `useReducer` internally. `dispatchAction()` is async and drives the full dispatch flow: Intent Router → dialog or execute → audit emit.

**Acceptance criteria:**
- `dispatchAction({ action_id, params, target })` returns a Promise.
- `actorRole` and `actorSessionId` injected by the provider (passed as props).
- `PROCEED` result: calls `executeAction()` via API route, emits audit.
- `CONFIRM_REQUIRED`: sets `pendingAction` in context state, opens dialog.
- `DENIED`/`DEFERRED`: throws `PolicyDeniedError`/`PolicyDeferredError` (UI catches and shows toast).
- `confirmAction(receipt)`: clears `pendingAction`, re-enters dispatch with receipt.
- `cancelAction()`: emits DENIED audit, clears `pendingAction`.
- Provider wraps root layout in `src/app/layout.jsx`.

**Prerequisites:** Tasks 6, 7, 11.

---

## Task 13: DevHub MCP Adapter Boundary Update

**File target:** `devhub-mcp/server.js`

**Description:** Update the MCP server to check `x-dh-action-id` header. When present, validate via the operator action contract before executing the tool. Falls through to normal tool execution when header absent.

**Acceptance criteria:**
- Checks `x-dh-action-id` header on every tool call.
- Calls `dispatchActionFromAdapter()` with `action_id`, `params`, `actor_role`.
- Returns `403` with dispatch result if status is not `PROCEED`.
- Tools without the header are unaffected.
- `actor_role` defaults to `'sys'` if header absent.

**Prerequisites:** Tasks 6, 7.

---

## Task 14: Tauri IPC Bridge

**File target:** `src-tauri/src/lib.rs` (or relevant Tauri command file)

**Description:** Expose `dh_dispatch_action` Tauri command so native host can trigger operator actions with policy enforcement. Calls through the same dispatch path as UI-initiated actions.

**Acceptance criteria:**
- `dh_dispatch_action(action_id, params, target)` command registered.
- Calls `dispatch_operator_action()` async function.
- Returns dispatch result JSON to Rust caller.
- Native menu items and keyboard shortcuts can invoke this command.

**Prerequisites:** Tasks 6, 7.

---

## Task 15: Integration Tests

**Files targets:**
- `src/lib/operations/__tests__/scenario-obs-log-tail.spec.js`
- `src/lib/operations/__tests__/scenario-nav-terminal.spec.js`
- `src/lib/operations/__tests__/scenario-nav-restricted.spec.js`
- `src/lib/operations/__tests__/scenario-mut-session-name.spec.js`
- `src/lib/operations/__tests__/scenario-orch-spawn-agent.spec.js`
- `src/lib/operations/__tests__/scenario-orch-credential-export.spec.js`
- `src/lib/operations/__tests__/scenario-role-nav-denied.spec.js`
- `src/lib/operations/__tests__/scenario-role-orch-denied.spec.js`
- `src/components/operator-confirm-dialog/__tests__/execute-dialog.rationale-min.spec.js`
- `src/components/operator-confirm-dialog/__tests__/execute-dialog.countdown.spec.js`

**Description:** Implement all 8 scenario specs from spec.md section 7 plus the two dialog unit tests. Each scenario test instantiates a fresh `PolicyEngine`, calls `routeDispatch()` directly, and asserts on status and audit event fields.

**Acceptance criteria:**
- All 8 scenario tests pass.
- `audit-emitter.redactSecrets.spec.js` passes (no secret leaks).
- `execute-dialog.rationale-min.spec.js` confirms Execute disabled < 10 chars.
- `execute-dialog.countdown.spec.js` confirms auto-close at 0.

**Prerequisites:** Tasks 1, 3, 4, 9, 10.

---

## Task Ordering Summary

```
1  action-registry.js
2  audit-emitter.js         ← depends on 1
3  policy-layer.js          ← depends on 1
4  intent-router.js         ← depends on 1, 3
5  audit events route       ← depends on 2
6  operator dispatch route  ← depends on 3, 4, 5
7  adapter-boundary.js      ← depends on 2, 4, 6
8  operator actions route   ← depends on 1
9  ConfirmDialog            ← depends on 1
10 ExecuteDialog            ← depends on 1, 9
11 Dialog shell             ← depends on 9, 10
12 OperatorActionContext    ← depends on 6, 7, 11
13 MCP adapter update       ← depends on 6, 7
14 Tauri IPC bridge         ← depends on 6, 7
15 Integration tests        ← depends on 1, 3, 4, 9, 10
```

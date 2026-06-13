# Operator Action Contract — Specification

## 1. Scope and Goals

This specification defines the **canonical Operator action contract** for all DevHub surfaces:
Timeline, Observer UI, Operator mode, and Director General orchestration.

Every action that changes state, grants access, or delegates work inside DevHub MUST be classified, permissioned, audited, and confirmable through this contract. No surface may invent its own action taxonomy, permission model, or confirmation semantics.

**Non-goals:**
- This spec does NOT implement Timeline UI, Observer UI, Operator mode, or Director General orchestration.
- This spec does NOT cover voice, canvas/pizarra, or standalone products outside DevHub.
- This spec does NOT define per-command shell allowlists or prompt wording.

---

## 2. Action Taxonomy

Every DevHub Operator action belongs to one of four classes. Each class maps to a risk tier and a set of allowed actor roles.

### 2.1 Action Class Definitions

| Class | ID prefix | Description | Auto-run eligible |
|-------|-----------|-------------|-------------------|
| **Observe** | `obs_*` | Read-only inspection of state, logs, or metadata | Yes |
| **Navigate** | `nav_*` | Focus, pane, or tab changes that do not alter state | Yes |
| **Mutate** | `mut_*` | Bounded environment changes, config writes, session edits | No |
| **Orchestrate** | `orch_*` | Execution, delegation, agent spawning, cross-workspace ops | No |

### 2.2 Canonical Action Registry

All actions listed below are **normative**. Future Operator/Director features MUST register new actions here before use.

```
observe_*          — read-only
  obs_log_tail     — stream last N log lines for a session/agent
  obs_log_search   — search logs by pattern, time range, agent id
  obs_session_list — list active sessions with metadata
  obs_agent_state  — read current state snapshot of an agent/worker
  obs_swarm_status — read current swarm mission + worker states

nav_*              — focus/navigation, no state mutation
  nav_terminal     — focus a terminal pane / bring pane to front
  nav_editor       — focus the editor pane
  nav_dock         — toggle or focus the right dock
  nav_browser      — focus the browser/iframe pane
  nav_layout       — switch between saved layout presets

mut_*              — bounded changes; confirmation required for risk >= medium
  mut_env_write    — write to process environment (not shell rc)
  mut_config_patch — patch DevHub runtime config (non-credential)
  mut_session_name — rename an active session
  mut_layout_save  — save current layout as a named preset
  mut_kill_agent   — terminate a running agent process (owned session)

orch_*             — execution, delegation, spawning; confirmation required
  orch_spawn_agent   — spawn a new agent in the current session
  orch_delegate_task — hand off a task to a swarm worker
  orch_submit_mission — submit a new swarm mission
  orch_exec_tool    — invoke a named MCP tool with given params
  orch_credential_use — use a stored credential for outbound request (denied: first cut)
```

---

## 3. Actor Roles

### 3.1 Role Definitions

| Role | Abbreviation | Description |
|------|--------------|-------------|
| **Observer** | `obs` | Read-only; may trigger `observe_*` actions only |
| **Operator** | `op` | May trigger `observe_*` and `nav_*` actions freely; `mut_*` with confirmation |
| **Director** | `dir` | May trigger all four classes including `orch_*` |
| **System** | `sys` | Internal DevHub machinery; bypasses confirmation but emits full audit trail |

### 3.2 Role Permission Matrix

| Action Class | Observer | Operator | Director | System |
|-------------|----------|----------|----------|--------|
| `observe_*` | MAY | MAY | MAY | MAY |
| `nav_*` | MUST NOT | MAY | MAY | MAY |
| `mut_*` | MUST NOT | MAY (w/ confirmation) | MAY (w/ confirmation) | MAY (w/ confirmation) |
| `orch_*` | MUST NOT | MUST NOT | MAY (w/ confirmation) | MAY (w/ confirmation) |

> **Interpretation:** "MAY" means the role CAN perform the action given correct confirmation and audit conditions. "MUST NOT" means the policy layer MUST block the request even if the user interface allows the gesture.

---

## 4. Risk Tiers and Confirmation Policy

### 4.1 Tier Definitions

| Tier | Label | Confirmation | Auto-run |
|------|-------|-------------|----------|
| 0 | **Inspect** | None | Yes |
| 1 | **Navigate** | None | Yes |
| 2 | **Modify** | One-step, in-app | Yes, after ack |
| 3 | **Execute** | Explicit human confirmation + rationale field | No |
| 4 | **Critical** | Denied: deferred to future policy | N/A |

### 4.2 Confirmation Requirements by Tier

**Tier 0 — Inspect** (`obs_*`):
- Confirmation: NONE REQUIRED.
- Audit: MUST emit.

**Tier 1 — Navigate** (`nav_*`):
- Confirmation: NONE REQUIRED.
- Audit: MUST emit.
- Policy note: If the navigation target is a restricted pane (e.g., a panel showing credentials), the adapter layer MUST return `NAVIGATE_RESTRICTED` before the navigation fires.

**Tier 2 — Modify** (`mut_*`):
- Confirmation: One-step in-app confirmation dialog showing:
  - Action ID and human-readable label
  - Target (e.g., "session abc-123")
  - Params (sanitized — no secret values)
  - "Confirm" / "Cancel" buttons
- Auto-run: MAY proceed after user acknowledgement.
- Audit: MUST emit with confirmed flag.

**Tier 3 — Execute** (`orch_*`):
- Confirmation: Explicit confirmation dialog showing:
  - Action ID and human-readable label
  - Full params including target
  - Rationale field: user MUST type a reason (min 10 characters) before "Execute" is enabled
  - Timeout: 60 seconds; if not confirmed, action is silently dropped.
- Auto-run: NEVER.
- Audit: MUST emit with rationale text and timestamp.

**Tier 4 — Critical** (flagged actions, first cut):
- Actions with `risk: critical` in the registry MUST return `POLICY_DENIED: deferred` at the intent router.
- Examples: credential export, cross-workspace state writes, shell rc modifications.
- These are explicitly OUT until a future policy spec addresses them.

---

## 5. Audit Payload Schema

Every action (regardless of tier) MUST emit an audit event with the following schema:

```jsonc
{
  "event_id": "uuid-v4",          // Required: unique event identifier
  "action_id": "obs_log_tail",   // Required: canonical action id
  "action_class": "observe",     // Required: obs | nav | mut | orch
  "actor_role": "operator",      // Required: obs | op | dir | sys
  "actor_session_id": "uuid-v4",  // Required: operator session making the call
  "target": {                    // Required: describes what the action affects
    "type": "session",           // session | agent | swarm | config | layout
    "id": "uuid-v4",              // target resource id
    "label": "session-abc-123"   // human-readable label
  },
  "params": {},                  // Action parameters (secrets redacted by adapter)
  "risk_tier": 0,                // 0 | 1 | 2 | 3 | 4
  "confirmation": {               // Present only for tiers 2 and 3
    "required": true,
    "confirmed": true,
    "confirmed_at": "ISO-8601",
    "rationale": "checking startup errors" // tier 3 only; tier 2 omitted
  },
  "outcome": "success",          // success | denied | error | deferred
  "error_detail": null,          // string or null
  "timestamp": "ISO-8601",
  "devhub_version": "semver"      // e.g., "0.1.0"
}
```

**Adapter redacts secrets:** Before emitting `params`, the adapter layer MUST replace any field matching credential patterns (`*password*`, `*token*`, `*secret*`, `*key*`) with `[REDACTED]`.

**Deferred actions:** When a Tier 4 action is intercepted at the intent router, the audit event MUST have `"outcome": "deferred"` and `"error_detail": "POLICY_DENIED: deferred — see operator-action-contract spec"`.

---

## 6. Component Boundary

```
User / UI                     Intent Router
  |                              |
  |  action_id + params          |  classify, check role, route
  v                              v
Confirmation UI  <----  Policy Layer
                              |
                              |  allow / deny / deferred
                              v
                         Adapter Boundary
                              |
                              |  emit audit, redact secrets
                              v
                       MCP / Tool Layer
                       (existing devhub-mcp)
```

### 6.1 Intent Router

- Receives raw action requests from the UI.
- Classifies by action class and resolves action_id from the registry.
- Checks actor role against permission matrix.
- Routes to Policy Layer.

### 6.2 Policy Layer

- Enforces confirmation thresholds per tier.
- Blocks `MUST NOT` role+class combinations.
- Intercepts Tier 4 actions and returns `POLICY_DENIED`.
- Returns one of: `PROCEED`, `CONFIRM_REQUIRED`, `DENIED`, `DEFERRED`.

### 6.3 Confirmation UI

- Renders confirmation dialogs for Tier 2 and Tier 3 actions.
- Does NOT render for Tier 0 and 1.
- Passes confirmation receipt back to Policy Layer.

### 6.4 Adapter Boundary

- Translates canonical action ids to MCP tool names.
- Redacts secrets before emitting audit.
- Emits audit event to audit store.
- Forwards to MCP / Tool Layer.

### 6.5 MCP / Tool Layer

- Existing `devhub-mcp/server.js` adapters.
- MUST NOT silently expand the public MCP surface based on internal `orch_*` actions.
- Public MCP contract is unaffected by this spec unless explicitly extended.

---

## 7. Scenario Specifications

### 7.1 Observer reads logs

**Given** an Observer role session is active
**When** the UI calls `obs_log_tail` with `{ session_id: "abc-123", lines: 50 }`
**Then** the Intent Router classifies it as `observe` / Tier 0
**And** the Policy Layer returns `PROCEED`
**And** the Adapter Boundary redacts no params (no secrets in log tail)
**And** an audit event is emitted with `{ action_id: "obs_log_tail", outcome: "success" }`

### 7.2 Operator navigates to terminal pane

**Given** an Operator role session is active
**When** the UI calls `nav_terminal` with `{ pane_id: "main" }`
**Then** the Intent Router classifies it as `nav` / Tier 1
**And** the Policy Layer returns `PROCEED`
**And** an audit event is emitted with `{ action_id: "nav_terminal", outcome: "success" }`

### 7.3 Operator attempts restricted navigation

**Given** an Operator role session is active
**And** the target pane is marked restricted
**When** the UI calls `nav_terminal` with `{ pane_id: "credential-panel" }`
**Then** the Intent Router returns `NAVIGATE_RESTRICTED`
**And** an audit event is emitted with `{ action_id: "nav_terminal", outcome: "denied", error_detail: "restricted pane" }`
**And** the UI displays an access denied message

### 7.4 Operator modifies session name (Tier 2)

**Given** an Operator role session is active
**When** the UI calls `mut_session_name` with `{ session_id: "abc-123", name: "debug-session" }`
**Then** the Intent Router classifies it as `mutate` / Tier 2
**And** the Policy Layer returns `CONFIRM_REQUIRED`
**And** the Confirmation UI renders with action label, target, and params
**When** the user clicks "Confirm"
**Then** the audit event includes `{ confirmation: { confirmed: true, confirmed_at: "..." } }`
**And** the action proceeds

### 7.5 Director executes agent spawn (Tier 3)

**Given** a Director role session is active
**When** the UI calls `orch_spawn_agent` with `{ session_id: "abc-123", agent_type: "worker" }`
**Then** the Intent Router classifies it as `orchestrate` / Tier 3
**And** the Policy Layer returns `CONFIRM_REQUIRED`
**And** the Confirmation UI renders with rationale field
**When** the user types "Spawning worker to process background tasks"
**And** clicks "Execute"
**Then** the Execute button becomes active (rationale >= 10 chars)
**And** the audit event includes `{ confirmation: { confirmed: true, rationale: "Spawning worker to process background tasks" } }`
**And** the action proceeds

### 7.6 Director submits a critical action (Tier 4 — deferred)

**Given** a Director role session is active
**When** the UI calls `orch_credential_export` (registered as Tier 4)
**Then** the Intent Router returns `POLICY_DENIED: deferred`
**And** an audit event is emitted with `{ outcome: "deferred", error_detail: "POLICY_DENIED: deferred — see operator-action-contract spec" }`
**And** the UI displays "This action is not available in the current release"

### 7.7 Observer attempts to navigate (role violation)

**Given** an Observer role session is active
**When** the UI calls `nav_terminal`
**Then** the Policy Layer returns `DENIED` (Observer + nav_* = MUST NOT)
**And** an audit event is emitted with `{ outcome: "denied", error_detail: "role not permitted for nav_*" }`

### 7.8 Operator attempts orchestrate action (role violation)

**Given** an Operator role session is active
**When** the UI calls `orch_spawn_agent`
**Then** the Policy Layer returns `DENIED` (Operator + orch_* = MUST NOT)
**And** an audit event is emitted with `{ outcome: "denied", error_detail: "role not permitted for orch_*" }`

---

## 8. Deny-by-Default Posture

The policy layer operates on **deny-by-default**: any action not present in the canonical registry is treated as Tier 4 (deferred) and MUST be blocked.

**Consequence:** Future surfaces (Timeline, Observer UI, Operator mode, Director General) cannot introduce new actions without registering them in this contract. Unregistered actions will not execute.

This posture is intentional. It forces every new action through the taxonomy review process before shipping.

---

## 9. Rollback and Versioning

This spec is versioned at `semver 1.0.0`. Any addition or modification to the action registry (new action_id, changed tier, changed confirmation policy) is a **breaking change** that requires a new minor version bump.

Rollback of a dependent slice: If a future implementation (e.g., Timeline UI) depends on this contract and the contract must change, the change MUST be backward-incompatible only through the versioning gate. No slice may hard-code action tiers in a way that bypasses the intent router.

---

## 10. Dependencies

- Action registry stored in `src/lib/operations/action-registry.js` (new file).
- Policy layer in `src/lib/operations/policy-layer.js` (new file).
- Confirmation UI component: `src/components/operator-confirm-dialog/` (new dir).
- Audit store: extends existing log/timeline infrastructure.
- DevHub MCP adapter boundary: `devhub-mcp/server.js` updated to route via policy layer.

---

## 11. Success Criteria

| # | Criterion |
|---|-----------|
| 1 | Every planned Operator/Director action (see proposal) is classifiable by taxonomy, actor, risk tier, and confirmation policy using this spec. |
| 2 | Timeline, Observer UI, Operator mode, and Director General planning can reuse the same canonical `action_id` values and audit schema without modification. |
| 3 | The plan keeps the Operator inside DevHub and defers canvas/voice/standalone expansion. |
| 4 | All 8 scenario specifications in Section 7 are testable against the implementation. |
| 5 | Unregistered actions are blocked by the intent router (deny-by-default). |
| 6 | Tier 4 (critical) actions return `POLICY_DENIED: deferred` with a reference to this spec. |
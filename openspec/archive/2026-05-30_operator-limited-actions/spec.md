# Spec: Operator Limited Actions

## Metadata

| Field        | Value                                                          |
|--------------|----------------------------------------------------------------|
| Change       | operator-limited-actions                                       |
| Type         | feature                                                        |
| Status       | draft                                                          |
| Owner        | DevHub Team                                                    |
| Started      | 2026-05-30                                                     |
| Depends on   | observer sidebar / right dock shell (existing)                |
| Blocks       | future task mutation, agent delegation, swarm orchestration    |

---

## Glossary

| Term                    | Definition                                                              |
|-------------------------|------------------------------------------------------------------------|
| Action                  | A discrete, named, parameterized operation dispatched by the Operator  |
| Action contract         | Validation layer that checks verb, params, target surface, risk tier   |
| Execution card          | Inline UI component showing a single action request → result lifecycle |
| Operator action         | Any action dispatched from the observer shell via the allowlist        |
| Risk tier               | Classification label (low / medium / high / forbidden) per action verb |
| Confirmation dialog     | Inline human gate before the adapter runs                              |
| Timeline entry          | Immutable log record for a single action lifecycle event               |

---

## 1. Problem Statement

The Operator must have a low-risk, human-gated mutation surface before shell commands, task mutations, or swarm delegation can exist. Currently there is no confirmation boundary, no execution visibility, and no audit trail for operator-dispatched actions.

---

## 2. Goals

1. Enforce a hard allowlist of operator action verbs — nothing outside v1 scope executes.
2. Require explicit inline human confirmation with visible target, params, and risk label before every dispatch.
3. Render execution cards inside the right dock shell that narrate `requested → confirmed → dispatched → completed | failed | cancelled`.
4. Record every lifecycle transition in the timeline as immutable entries.
5. Keep the observer sidebar / right dock as the single host surface — no new control plane.

---

## 3. Non-Goals

- `terminal.run`, file writes, git mutation, task/project updates, or approvals mutation.
- `agent.create`, `agent.delegate`, `swarm.launch`, or any swarm delegation.
- Bulk approvals, remembered approvals, hidden retries, or parallel action orchestration.

---

## 4. Architecture

```
Operator Intent
      │
      ▼
Action Contract (validate verb + params + target + risk tier)
      │
      ▼
Confirmation Gate (inline human approval)
      │
      ▼
Action Adapter (executes only if contract + confirmation both pass)
      │
      ▼
Execution Card (status: dispatched / completed / failed / cancelled)
      │
      ▼
Timeline Entry (immutable lifecycle record)
```

### 4.1 Components

| Component                   | Location                                        | Role                                         |
|-----------------------------|-------------------------------------------------|---------------------------------------------|
| `actionContract.js`         | `src/lib/operator/actionContract.js`            | Allowlist enforcement, risk tier, params    |
| `useOperatorActions.js`     | `src/components/workspace/hooks/useOperatorActions.js` | Hook: dispatch, confirm, cancel       |
| `OperatorActionCard.jsx`    | `src/components/workspace/OperatorActionCard.jsx` | Execution card UI inside right dock         |
| `ConfirmationDialog.jsx`    | `src/components/workspace/ConfirmationDialog.jsx` | Inline confirm-before-run dialog            |
| `actionTimeline.js`         | `src/lib/operator/actionTimeline.js`           | Immutable timeline entry recording          |
| `TerminalWorkspacesManager` | `src/components/TerminalWorkspacesManager.jsx` | Modified: wire request/confirmation/card    |
| `WorkspaceRightDock`        | `src/components/workspace/WorkspaceRightDock.jsx` | Modified: host execution cards in dock     |

---

## 5. Action Allowlist — v1

All verbs below are classified `low` risk. No verb outside this list is valid in v1.

| Verb                  | Target Surface | Risk | Params                           |
|-----------------------|----------------|------|----------------------------------|
| `terminal.open`       | terminal pane  | low  | `{ workspaceId }`               |
| `terminal.focus`      | terminal pane  | low  | `{ workspaceId }`               |
| `browser.open`        | right dock     | low  | `{ url, label? }`               |
| `browser.navigate`    | right dock     | low  | `{ url }`                       |
| `browser.focus`       | right dock     | low  | `{}`                            |
| `dock.switch_tab`     | right dock     | low  | `{ tabId }`                     |

Any action with a verb not in this list MUST be rejected by the contract with `error: 'E_ACTION_NOT_ALLOWLISTED'`.

---

## 6. Action Contract

### 6.1 Signature

```js
// src/lib/operator/actionContract.js

/**
 * @param {object} action - { verb: string, params: object, target: string }
 * @returns {{ valid: boolean, tier: string|null, error: string|null }}
 */
export function validateAction(action) { ... }
```

### 6.2 Validation Steps

1. **Verb check**: `ALLOWED_VERBS` array must include `action.verb`. If not → `{ valid: false, error: 'E_ACTION_NOT_ALLOWLISTED' }`.
2. **Params check**: Required params for the verb (per the table above) MUST be present. If any missing → `{ valid: false, error: 'E_MISSING_PARAMS' }`.
3. **Risk tier**: Return the configured tier for the verb. No risk scoring logic in v1 — tier is static per allowlist entry.

The contract does NOT execute the action. It only validates.

---

## 7. Confirmation Gate

### 7.1 Flow

1. Operator code calls `dispatchAction({ verb, params, target })` via `useOperatorActions`.
2. `useOperatorActions` calls `validateAction(...)`. If invalid, action is rejected immediately; no card created.
3. If valid, an execution card is created with status `requested` and the confirmation dialog is rendered inline within the card.
4. Human clicks **Confirm** or **Cancel**. No action executes without an explicit human click.
5. On **Confirm**: card status → `dispatched`, adapter runs.
6. On **Cancel**: card status → `cancelled`, no adapter runs.

### 7.2 Confirmation Dialog — UI Contract

The dialog rendered inside the execution card MUST show:
- Action verb and human-readable label
- Target surface (e.g., "right dock browser")
- Params summary (e.g., `url: https://...`)
- Risk tier badge: `low` (green), `medium` (amber), `high` (red) — v1 only shows `low`
- Two buttons: **Confirm** (primary) and **Cancel** (secondary / destructive-style)

No silent execution. No auto-confirm. No retry without a new confirmation cycle.

---

## 8. Execution Card — Data Model

```js
// Stored in React state (useOperatorActions) and mirrored to timeline
{
  id: string,           // uuid v4
  verb: string,         // e.g. 'browser.navigate'
  params: object,      // exact params passed
  target: string,       // e.g. 'right-dock'
  tier: 'low',          // from contract
  status: 'requested' | 'dispatched' | 'completed' | 'failed' | 'cancelled',
  createdAt: number,   // Date.now() at creation
  confirmedAt: number | null,
  completedAt: number | null,
  result: object | null,   // adapter return value on success
  error: string | null,     // adapter error message on failure
}
```

---

## 9. Timeline Entry Format

Each lifecycle transition writes one immutable entry:

```js
{
  id: string,          // uuid v4
  actionId: string,   // matches execution card id
  event: 'requested' | 'confirmed' | 'dispatched' | 'completed' | 'failed' | 'cancelled',
  timestamp: number,
  actor: 'human' | 'operator',
  detail: object | null,
}
```

Entries are written once and never mutated. `confirmed` events are written only on human confirmation (not on auto-dispatch).

---

## 10. Adapter Layer

Each verb has a dedicated adapter function. Adapters MUST:
- Receive the full `action` object (verb + params + target)
- Return `{ success: true, data: object }` or throw `{ success: false, error: string }`
- Be idempotent where possible
- Log result/error back to the execution card state

| Verb               | Adapter file                              | Implementation                    |
|--------------------|-------------------------------------------|-----------------------------------|
| `terminal.open`    | `src/lib/operator/adapters/terminal.js`   | Calls workspace open hook         |
| `terminal.focus`   | `src/lib/operator/adapters/terminal.js`   | Focuses existing terminal pane    |
| `browser.open`     | `src/lib/operator/adapters/browser.js`    | Sets browser URL in right dock    |
| `browser.navigate` | `src/lib/operator/adapters/browser.js`   | Navigates existing browser pane  |
| `browser.focus`    | `src/lib/operator/adapters/browser.js`    | Focuses browser iframe            |
| `dock.switch_tab`  | `src/lib/operator/adapters/dock.js`        | Switches right dock tab via controller |

Adapters MUST NOT be called unless `validateAction` returned `valid: true` AND the human confirmed.

---

## 11. Integration Points

### 11.1 `TerminalWorkspacesManager.jsx`

- Import `useOperatorActions` hook.
- Expose `handleOperatorAction(verb, params)` that runs `dispatchAction`.
- Pass `executionCards` state and `onCardAction` handler to `WorkspaceRightDock`.

### 11.2 `WorkspaceRightDock.jsx`

- Receive `executionCards` prop (array of execution card objects).
- Render each card inside the right dock below existing content.
- Cards are stacked chronologically (newest at top or bottom — configurable, default: newest at top).
- Each card renders `ConfirmationDialog` when status is `requested`.
- Each card renders result/error when status is `completed`, `failed`, or `cancelled`.

### 11.3 `useRightDockController.js`

- No behavioral change to existing state management.
- Dock state (which tab, maximized, etc.) is unaffected by operator cards.
- Cards do not change dock mode — they coexist alongside existing dock content.

---

## 12. Component Specifications

### 12.1 `OperatorActionCard.jsx`

**Props**: `card: ExecutionCard`, `onConfirm: () => void`, `onCancel: () => void`

**States**:
- `requested`: shows confirmation dialog (verb, params, target, risk badge, Confirm/Cancel buttons)
- `dispatched`: shows spinner / "Running..." indicator with action summary
- `completed`: shows green check, result summary, timestamp
- `failed`: shows red error icon, error message, timestamp
- `cancelled`: shows gray cancel icon, "Cancelled by user", timestamp

**Styling**: Tailwind, consistent with existing right-dock card patterns. Risk badge colors:
- `low` → `bg-green-100 text-green-800`
- `medium` → `bg-amber-100 text-amber-800`
- `high` → `bg-red-100 text-red-800`

### 12.2 `ConfirmationDialog.jsx`

**Props**: `card: ExecutionCard`, `onConfirm: () => void`, `onCancel: () => void`

**Layout**: Inline card expansion (not a modal overlay). Shows:
- Header: `[Verb] on [target]` with tier badge
- Body: params list (key: value, one per line)
- Footer: `Confirm` (primary button) + `Cancel` (secondary)

### 12.3 `useOperatorActions.js`

```js
// Returns
{
  executionCards: ExecutionCard[],
  dispatchAction: (verb: string, params: object, target: string) => void,
  cancelCard: (cardId: string) => void,
  confirmCard: (cardId: string) => void,
}
```

- `dispatchAction` calls `validateAction` first. Rejects with error if invalid.
- `confirmCard` sets card status to `dispatched` and runs the adapter.
- `cancelCard` sets card status to `cancelled`.
- Adapter result/error updates the card in place (status + result/error fields).

---

## 13. Rollback Plan

If the feature must be reverted:

1. Remove `useOperatorActions` import and usage from `TerminalWorkspacesManager.jsx`.
2. Remove `<OperatorActionCard>` rendering from `WorkspaceRightDock.jsx`.
3. Disable the action entrypoint in the operator wrapper.
4. The right dock returns to read-only observer state.

No database migration required — execution cards are ephemeral (in-memory React state). Timeline entries written to the existing timeline table are left as-is (historical records).

---

## 14. Success Criteria

| # | Criterion                                                                              |
|---|----------------------------------------------------------------------------------------|
| 1 | Only verbs from the v1 allowlist can be dispatched                                     |
| 2 | Every action shows a confirmation dialog before executing                              |
| 3 | No action executes without an explicit human click on Confirm                           |
| 4 | Execution cards reflect correct status: `requested` → `dispatched` → `completed`/`failed`/`cancelled` |
| 5 | Timeline entries are written for each lifecycle transition                              |
| 6 | Adapter errors render as `failed` status with error message in the card                |
| 7 | Cancelled actions do not trigger any adapter call                                      |

---

## 15. Testing Requirements

| Layer      | Scope                                                                                     |
|------------|------------------------------------------------------------------------------------------|
| Unit       | `actionContract.js`: valid/invalid verb, missing params, edge cases                     |
| Unit       | `useOperatorActions.js`: dispatch/confirm/cancel state machine                           |
| Unit       | Each adapter: happy path + error throwing                                                |
| Integration| `TerminalWorkspacesManager` + `WorkspaceRightDock` + hook wiring                        |
| E2E        | Full flow: dispatch action → confirm dialog → execution card status → timeline entry    |

---

## 16. File Manifest

```
src/lib/operator/
  actionContract.js          # allowlist + validateAction()
  actionTimeline.js          # writeTimelineEntry()
  adapters/
    terminal.js              # terminal.open, terminal.focus
    browser.js               # browser.open, navigate, focus
    dock.js                  # dock.switch_tab

src/components/workspace/
  hooks/
    useOperatorActions.js    # dispatch, confirm, cancel, cards state
  OperatorActionCard.jsx     # card UI component
  ConfirmationDialog.jsx     # inline confirm gate UI

src/components/
  TerminalWorkspacesManager.jsx   # modified: wire hook
  workspace/
    WorkspaceRightDock.jsx        # modified: host cards
    hooks/
      useRightDockController.js    # no changes
```

---

*Last updated: 2026-05-30*
*Spec status: draft — pending review and design phase*
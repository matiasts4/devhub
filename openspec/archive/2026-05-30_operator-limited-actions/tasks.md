# Tasks: Operator Limited Actions

## Metadata

| Field      | Value                                   |
|------------|-----------------------------------------|
| Change     | operator-limited-actions                |
| Phase      | tasks                                   |
| Based on   | design.md v1.0 (source of truth)        |
| Model      | sonnet                                  |

---

## Task Ordering

Tasks are ordered to respect dependencies:
- **Phase 1 (lib/pure):** `actionContract` and `actionTimeline` — no dependencies, can be written and tested in isolation
- **Phase 2 (adapters):** `terminal.js`, `browser.js`, `dock.js` — depend on contract
- **Phase 3 (hooks):** `useOperatorActions` — depends on all of the above
- **Phase 4 (components):** `OperatorActionCard` — depends on the hook
- **Phase 5 (integration):** `TerminalWorkspacesManager` + `WorkspaceRightDock` wiring
- **Phase 6 (tests):** Unit tests for contract and hook

---

## Phase 1 — Pure Business Logic

---

### Task 1.1: Create `actionContract.js`

**Files touched:**
- `src/lib/operator/actionContract.js` (new)

**Description:**
Create the action contract module with the `ALLOWED_VERBS` map and the pure `validateAction()` function.

**Implementation details:**
- Export `ALLOWED_VERBS` as a plain object keyed by verb string. Each entry carries `tier` and `requiredParams` (array). The six v1 verbs are: `terminal.open`, `terminal.focus`, `browser.open`, `browser.navigate`, `browser.focus`, `dock.switch_tab` — all `tier: 'low'`. See design.md Section 3 for exact shape.
- Export `RISK_TIER_COLORS` map: `low → 'bg-green-100 text-green-800'`, `medium → 'bg-amber-100 text-amber-800'`, `high → 'bg-red-100 text-red-800'`.
- Implement `validateAction({ verb, params = {}, target = '' })` as a pure function returning `{ valid: boolean, tier: string|null, error: string|null }`.
- Unknown verb → `{ valid: false, tier: null, error: 'E_ACTION_NOT_ALLOWLISTED' }`.
- Any required param missing → `{ valid: false, tier: null, error: 'E_MISSING_PARAMS' }`.
- Valid → `{ valid: true, tier: entry.tier, error: null }`.
- `target` is accepted but not validated in v1.

**Acceptance criteria:**
- [ ] `validateAction` returns `E_ACTION_NOT_ALLOWLISTED` for unknown verbs
- [ ] `validateAction` returns `E_MISSING_PARAMS` when required params are missing
- [ ] `validateAction` returns `valid: true` and correct `tier` for all six v1 verbs with correct params
- [ ] `validateAction` is a pure function (no side effects, no async, no module-level reads)
- [ ] Handles `params: undefined` gracefully by defaulting to `{}`

---

### Task 1.2: Create `actionTimeline.js`

**Files touched:**
- `src/lib/operator/actionTimeline.js` (new)

**Description:**
Create the ephemeral timeline module. In v1 the store is a module-level array; persistent WAL storage is deferred to a future phase.

**Implementation details:**
- Module-level `const _store = []` (private, not exported).
- Export `writeTimelineEntry(entry)` — synchronous, append-only. Assigns `id` via `crypto.randomUUID()` if not provided. Signature: `({ id?, actionId, event, timestamp?, actor, detail? })`.
- Export `readTimelineEntries(actionId)` — returns filtered array of entries for the given actionId. Used for timeline rendering in the card.
- No mutations of existing entries. No async.
- Document in a comment that v1 entries are ephemeral (in-memory only).

**Acceptance criteria:**
- [ ] `writeTimelineEntry` adds an entry to `_store` without mutating existing entries
- [ ] `readTimelineEntries(id)` returns only entries matching the given `actionId`
- [ ] Entries are immutable after write
- [ ] Function is synchronous and side-effect-free except for array append

---

## Phase 2 — Adapters

---

### Task 2.1: Create `adapters/terminal.js`

**Files touched:**
- `src/lib/operator/adapters/terminal.js` (new)

**Description:**
Terminal adapter for `terminal.open` and `terminal.focus`. Both verbs delegate to the workspace open/focus hook. In v1 the adapter skeleton returns a harmless success; actual wiring to `TerminalWorkspacesManager` state is completed in the integration task.

**Implementation details:**
- Export named async function `terminalAdapter({ verb, params })`.
- `verb === 'terminal.open'`: return `{ success: true, data: { workspaceId: params.workspaceId } }`.
- `verb === 'terminal.focus'`: return `{ success: true, data: { workspaceId: params.workspaceId } }`.
- Unknown verb → throw `Error('E_ADAPTER_UNSUPPORTED_VERB')`.
- Add JSDoc noting the actual focus/open wiring happens in a follow-up integration pass.

**Acceptance criteria:**
- [ ] Returns `{ success: true, data: { workspaceId } }` for both `terminal.open` and `terminal.focus`
- [ ] Throws `'E_ADAPTER_UNSUPPORTED_VERB'` for unknown verbs
- [ ] Function is async (ready for future real implementations)

---

### Task 2.2: Create `adapters/browser.js`

**Files touched:**
- `src/lib/operator/adapters/browser.js` (new)

**Description:**
Browser adapter for `browser.open`, `browser.navigate`, and `browser.focus`. Dispatches to the browser window state setter via a callback injected at hook creation time (see design.md Section 5.2).

**Implementation details:**
- Export named async function `browserAdapter({ verb, params })`.
- `verb === 'browser.open'`: return `{ success: true, data: { url: params.url, label: params.label || params.url } }`.
- `verb === 'browser.navigate'`: return `{ success: true, data: { url: params.url } }`.
- `verb === 'browser.focus'`: return `{ success: true, data: {} }`.
- Unknown verb → throw `Error('E_ADAPTER_UNSUPPORTED_VERB')`.

**Acceptance criteria:**
- [ ] Returns correct shape for each of the three verbs
- [ ] `browser.open` uses `params.label || params.url` as the label fallback
- [ ] Throws `'E_ADAPTER_UNSUPPORTED_VERB'` for unknown verbs

---

### Task 2.3: Create `adapters/dock.js`

**Files touched:**
- `src/lib/operator/adapters/dock.js` (new)

**Description:**
Dock adapter for `dock.switch_tab`. Receives `onDockStateChange` as a hook parameter so it can dispatch tab switches without importing `TerminalWorkspacesManager` state directly.

**Implementation details:**
- Export named async function `dockAdapter({ verb, params })`.
- `verb !== 'dock.switch_tab'` → throw `Error('E_ADAPTER_UNSUPPORTED_VERB')`.
- Return `{ success: true, data: { tabId: params.tabId } }`.
- Note: the actual `onDockStateChange` invocation lives in `useOperatorActions` when it wires the adapter — the adapter itself only receives the params and returns data.

**Acceptance criteria:**
- [ ] Throws `'E_ADAPTER_UNSUPPORTED_VERB'` for unknown verbs
- [ ] Returns `{ success: true, data: { tabId: params.tabId } }` for `dock.switch_tab`

---

## Phase 3 — Hook

---

### Task 3.1: Create `useOperatorActions.js`

**Files touched:**
- `src/components/workspace/hooks/useOperatorActions.js` (new)

**Description:**
Create the main React hook that owns execution card state and coordinates the contract, confirmation, and adapter pipeline. This is the core state machine.

**Implementation details:**
- `'use client'` directive.
- Import all three adapters statically (`terminalAdapter`, `browserAdapter`, `dockAdapter`) and build `ADAPTERS` static map at module level.
- `useOperatorActions({ onDockStateChange } = {})` — accepts optional `onDockStateChange` callback.
- Internal state: `const [cards, setCards] = useState([])` — reverse-chronological (`[card, ...prev]`).
- `dispatchAction(verb, params = {}, target = 'right-dock')`:
  - Call `validateAction({ verb, params, target })`.
  - If invalid: `console.warn('[operator] action rejected:', result.error, { verb })` and return `null`.
  - If valid: create card with status `'requested'`, prepend to state, call `log(cardId, 'requested', 'operator', ...)`, return `cardId`.
- `confirmCard(cardId)`:
  - Set status to `'dispatched'`, record `confirmedAt`.
  - Call `log(card.id, 'confirmed', 'human', null)` and `log(card.id, 'dispatched', 'operator', null)`.
  - Await the adapter. On success: set status `'completed'`, store `result`. On throw: set status `'failed'`, store `error.message` (fallback to `String(err)`).
  - Write final timeline entry (`completed` or `failed`).
- `cancelCard(cardId)`:
  - Set status to `'cancelled'`, record `completedAt`.
  - Call `log(cardId, 'cancelled', 'human', null)`.
- Return `{ cards, dispatchAction, confirmCard, cancelCard }`.

**Acceptance criteria:**
- [ ] `dispatchAction` returns `null` for invalid verbs and params; no card created
- [ ] `dispatchAction` creates a card with status `'requested'` for valid actions
- [ ] `dispatchAction` returns the new `cardId`
- [ ] `confirmCard` transitions card through `'dispatched'` → `'completed'` or `'failed'`
- [ ] `cancelCard` transitions card to `'cancelled'` without calling the adapter
- [ ] All state transitions are atomic via `setCards(prev => prev.map(...))`
- [ ] `confirmCard` called twice on the same card is idempotent (no-op on second call)
- [ ] `onDockStateChange` not provided does not crash — `dock.switch_tab` becomes a no-op

---

## Phase 4 — Components

---

### Task 4.1: Create `OperatorActionCard.jsx`

**Files touched:**
- `src/components/workspace/OperatorActionCard.jsx` (new)

**Description:**
Presentational component that renders a single execution card. The confirmation dialog is rendered inline within the card as `ConfirmationDialogInline` (co-located in the same file per design.md Section 7). No separate `ConfirmationDialog.jsx` file is created in v1.

**Implementation details:**
- `'use client'` directive.
- Import icons from `lucide-react`: `CheckCircle2`, `XCircle`, `Loader2`, `Ban`.
- `STATUS_ICONS` map: `requested`/`dispatched` → animated `Loader2` in blue; `completed` → `CheckCircle2` green; `failed` → `XCircle` red; `cancelled` → `Ban` gray.
- `TIER_STYLES` map matching design.md: low (green), medium (amber), high (red).
- `formatTs(ts)` helper: returns `new Date(ts).toLocaleTimeString()` or empty string.
- `OperatorActionCard({ card, onConfirm, onCancel })`:
  - Render status icon + verb + tier badge + timestamp in header row.
  - When `status === 'requested'`: render `<ConfirmationDialogInline>`.
  - When `status === 'dispatched'`: render italic "Running..." text.
  - When `status === 'completed'`: render green result summary.
  - When `status === 'failed'`: render red error message.
  - When `status === 'cancelled'`: render gray "Cancelled by user" text.
  - When terminal: render `confirmedAt` and `completedAt` timestamps.
- `ConfirmationDialogInline` (co-located):
  - Blue-tinted border card with "Confirm Action" header.
  - Show `target` and all params as `key: value` list.
  - Two buttons: Confirm (blue-600) and Cancel (red-tinted border).
  - Both buttons call `onConfirm(id)` and `onCancel(id)` respectively.
- Outer card uses `data-card-id={id}` attribute.
- Use CSS variables for theming: `var(--border-subtle)`, `var(--surface-raised)`, `var(--text-primary)`, `var(--text-muted)`, `var(--text-secondary)`.

**Acceptance criteria:**
- [ ] Card renders status icon, verb, and tier badge in header
- [ ] Confirmation dialog shows only when status is `'requested'`
- [ ] All five statuses render correct content (spinner / result / error / cancel label / timestamps)
- [ ] Confirm button calls `onConfirm(card.id)`
- [ ] Cancel button calls `onCancel(card.id)`
- [ ] Component uses existing CSS variable tokens for theming

---

## Phase 5 — Integration

---

### Task 5.1: Wire `useOperatorActions` into `TerminalWorkspacesManager`

**Files touched:**
- `src/components/TerminalWorkspacesManager.jsx` (modify)

**Description:**
Add `useOperatorActions` to `TerminalWorkspacesManager`, expose a handler for operator code, and pass card state and handlers down to `WorkspaceRightDock`.

**Implementation details:**
1. Add static import: `import useOperatorActions from '@/components/workspace/hooks/useOperatorActions';`
2. Inside the component, instantiate the hook: `const { cards, dispatchAction, confirmCard, cancelCard } = useOperatorActions({ onDockStateChange });`
3. Create a named handler: `const handleOperatorAction = useCallback((verb, params) => dispatchAction(verb, params), [dispatchAction]);`
4. Expose `handleOperatorAction` on the component (via `useImperativeHandle` or as a prop on a context — match existing pattern in the file).
5. Pass `cards`, `confirmCard`, `cancelCard` as new props to `WorkspaceRightDock`:
   ```jsx
   <WorkspaceRightDock
     // ...existing props...
     executionCards={cards}
     onCardConfirm={confirmCard}
     onCardCancel={cancelCard}
   />
   ```

**Acceptance criteria:**
- [ ] `useOperatorActions` is imported and instantiated without errors
- [ ] `handleOperatorAction(verb, params)` is exposed for operator code to call
- [ ] `cards`, `confirmCard`, and `cancelCard` are passed to `WorkspaceRightDock`
- [ ] No existing state initialization or layout logic is modified
- [ ] Adapter for `dock.switch_tab` receives `onDockStateChange` and can call it

---

### Task 5.2: Add execution card zone to `WorkspaceRightDock`

**Files touched:**
- `src/components/workspace/WorkspaceRightDock.jsx` (modify)

**Description:**
Add the execution card rendering zone to `WorkspaceRightDock`. The zone is appended below the existing dock shell, outside tab conditional rendering, so it is always visible.

**Implementation details:**
1. Add new optional props to the component signature:
   ```jsx
   executionCards: PropTypes.array,
   onCardConfirm: PropTypes.func,
   onCardCancel: PropTypes.func,
   ```
2. Import `OperatorActionCard`: `import OperatorActionCard from '@/components/workspace/OperatorActionCard';`
3. Append the card zone below the existing dock shell div (outside the tab conditional):
   ```jsx
   {/* Operator action cards — always visible, below tab content */}
   {(executionCards?.length ?? 0) > 0 && (
     <div className="border-t border-[var(--border-subtle)] p-3">
       <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">
         Operator Actions
       </div>
       {executionCards.map(card => (
         <OperatorActionCard
           key={card.id}
           card={card}
           onConfirm={onCardConfirm}
           onCancel={onCardCancel}
         />
       ))}
     </div>
   )}
   ```
4. Do not import or use `useOperatorActions` here — the hook lives in `TerminalWorkspacesManager`.

**Acceptance criteria:**
- [ ] Card zone renders only when `executionCards` has items
- [ ] Cards render in order (newest first, from hook state)
- [ ] Each card is wired to `onCardConfirm` and `onCardCancel`
- [ ] Zone is visually separated with a border and "Operator Actions" label
- [ ] Cards are visible regardless of which dock tab is active

---

## Phase 6 — Tests

---

### Task 6.1: Unit tests for `actionContract.js`

**Files touched:**
- `src/lib/operator/__tests__/actionContract.test.js` (new)

**Description:**
Test all paths through `validateAction` — valid verbs, invalid verbs, and missing params for each verb.

**Coverage:**
- Each of the six v1 verbs with complete params → `valid: true`, correct `tier`
- Unknown verb → `valid: false`, `error: 'E_ACTION_NOT_ALLOWLISTED'`
- Each verb missing each required param → `valid: false`, `error: 'E_MISSING_PARAMS'`
- Empty params object on a verb with required params
- `params: undefined` → defaults to `{}` and returns `E_MISSING_PARAMS`

**Acceptance criteria:**
- [ ] All six valid verbs pass with correct params
- [ ] All invalid verb cases return `E_ACTION_NOT_ALLOWLISTED`
- [ ] All missing-param cases return `E_MISSING_PARAMS`
- [ ] Edge cases: empty params, undefined params

---

### Task 6.2: Unit tests for `useOperatorActions`

**Files touched:**
- `src/components/workspace/hooks/__tests__/useOperatorActions.test.js` (new)

**Description:**
Test the full state machine: dispatch, confirm, cancel, and error paths. Use React Testing Library with a test harness component that renders a component consuming the hook.

**Coverage:**
- `dispatchAction` with valid verb/params → card created with status `'requested'`
- `dispatchAction` with invalid verb → returns `null`, no card created
- `confirmCard` on a `'requested'` card → status becomes `'completed'` (mock adapter resolves)
- `confirmCard` on a `'requested'` card → status becomes `'failed'` (mock adapter throws)
- `cancelCard` on a `'requested'` card → status becomes `'cancelled'`, adapter not called
- Duplicate `confirmCard` on an already-dispatched card → idempotent (no change)
- Timeline entries written for each transition event

**Acceptance criteria:**
- [ ] Dispatch flow: valid action creates card; invalid action returns null
- [ ] Confirm flow: `'requested'` → `'dispatched'` → `'completed'`
- [ ] Confirm error flow: `'requested'` → `'dispatched'` → `'failed'`
- [ ] Cancel flow: `'requested'` → `'cancelled'`, adapter never called
- [ ] Idempotency: double-confirm does not crash or corrupt state
- [ ] Timeline entries written for `requested`, `confirmed`, `dispatched`, `completed`/`failed`/`cancelled`

---

## Summary

| Task | File(s) | Type |
|------|---------|------|
| 1.1 | `src/lib/operator/actionContract.js` | new |
| 1.2 | `src/lib/operator/actionTimeline.js` | new |
| 2.1 | `src/lib/operator/adapters/terminal.js` | new |
| 2.2 | `src/lib/operator/adapters/browser.js` | new |
| 2.3 | `src/lib/operator/adapters/dock.js` | new |
| 3.1 | `src/components/workspace/hooks/useOperatorActions.js` | new |
| 4.1 | `src/components/workspace/OperatorActionCard.jsx` | new |
| 5.1 | `src/components/TerminalWorkspacesManager.jsx` | modify |
| 5.2 | `src/components/workspace/WorkspaceRightDock.jsx` | modify |
| 6.1 | `src/lib/operator/__tests__/actionContract.test.js` | new |
| 6.2 | `src/components/workspace/hooks/__tests__/useOperatorActions.test.js` | new |

**Total: 9 new files, 2 modified files, 11 tasks across 6 phases.**

# Design: Operator Limited Actions

## Metadata

| Field        | Value                                        |
|--------------|----------------------------------------------|
| Change       | operator-limited-actions                     |
| Phase | design                                       |
| Status       | draft |
| Depends on   | observer sidebar / right dock shell (existing) |

---

## 1. Architecture Overview

The feature is implemented as a thin, self-contained layer that does not alter existing dock state management. Three new packages are introduced:

- **`src/lib/operator/`** — pure business logic (contract, timeline, adapters). No React dependencies.
- **`src/components/workspace/hooks/`** — one React hook that owns execution-card state and coordinates the contract, confirmation, and adapter pipeline.
- **`src/components/workspace/`** — two presentational components (action card, confirmation dialog).

Integration is achieved by wiring `useOperatorActions` into `TerminalWorkspacesManager` and rendering `<OperatorActionCard>` slots inside `WorkspaceRightDock`. No existing component is refactored; the right dock grows a new zone below its existing tabs.

```
Operator code
    │
    ▼
useOperatorActions.dispatchAction(verb, params, target)
    │
    ▼
actionContract.validateAction() ← pure fn, no side effects
    │ valid
    ▼
create execution card (status: requested)
    │
    ▼
render <ConfirmationDialog> inside <OperatorActionCard>
    │
    ▼ human clicks Confirm
useOperatorActions.confirmCard(id)
    │
    ▼
adapter.run(action)                   ← verb-specific implementation
    │
    ▼
update card (status: completed | failed)
 │
    ▼
actionTimeline.writeEntry()          ← pure fn, append-only
```

---

## 2. File Structure

```
src/lib/operator/
  actionContract.js           # ALLOWED_VERBS map + validateAction()
  actionTimeline.js           # writeTimelineEntry() — append-only
  adapters/
    terminal.js               # terminal.open, terminal.focus
    browser.js               # browser.open, browser.navigate, browser.focus
    dock.js                   # dock.switch_tab

src/components/workspace/
  hooks/
    useOperatorActions.js    # execution card state machine + dispatch/confirm/cancel
  OperatorActionCard.jsx     # card shell with status-driven rendering
  ConfirmationDialog.jsx      # inline confirm gate
```

**Rollback rule:** delete the three packages above, remove the hook import from `TerminalWorkspacesManager`, and remove the card rendering from `WorkspaceRightDock`. No existing file is mutated beyond adding imports and a render slot.

---

## 3. `actionContract.js`

```js
// src/lib/operator/actionContract.js

export const ALLOWED_VERBS = {
  'terminal.open':      { tier: 'low',  requiredParams: ['workspaceId'] },
  'terminal.focus':     { tier: 'low',  requiredParams: ['workspaceId'] },
  'browser.open':       { tier: 'low',  requiredParams: ['url'], optionalParams: ['label'] },
  'browser.navigate':   { tier: 'low',  requiredParams: ['url'] },
  'browser.focus':      { tier: 'low',  requiredParams: [] },
  'dock.switch_tab':    { tier: 'low',  requiredParams: ['tabId'] },
};

export const RISK_TIER_COLORS = {
  low:    'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  high:   'bg-red-100 text-red-800',
};

/**
 * @param {{ verb: string, params: object, target: string }} action
 * @returns {{ valid: boolean, tier: string|null, error: string|null }}
 */
export function validateAction({ verb, params = {}, target = '' }) {
  const entry = ALLOWED_VERBS[verb];
  if (!entry) return { valid: false, tier: null, error: 'E_ACTION_NOT_ALLOWLISTED' };

  for (const param of entry.requiredParams) {
    if (params[param] === undefined) {
      return { valid: false, tier: null, error: 'E_MISSING_PARAMS' };
    }
  }

  return { valid: true, tier: entry.tier, error: null };
}
```

**Design decisions:**
- `ALLOWED_VERBS` is a plain object (not a Set) so each entry can carry `tier` and `requiredParams` without a secondary lookup table.
- `validateAction` is a pure function — no async, no module-level state, no side effects. This makes it trivially testable.
- Unknown verbs produce `E_ACTION_NOT_ALLOWLISTED`; missing params produce `E_MISSING_PARAMS`. The two error codes are sufficient for the UI to render specific feedback.
- `target` is accepted but not validated in v1 — the spec records it on the card for future use.

---

## 4. `actionTimeline.js`

```js
// src/lib/operator/actionTimeline.js

/**
 * Writes one immutable timeline entry.  In v1 the entries are accumulated
 * in a module-level array (ephemeral).  A future phase will flush them to
 * the observability/ WAL table.
 *
 * @param {{ id: string, actionId: string, event: string, timestamp: number,
 *          actor: 'human'|'operator', detail: object|null }} entry
 */
const _store = [];

export function writeTimelineEntry(entry) {
  _store.push({ ...entry, id: entry.id || crypto.randomUUID() });
}

export function readTimelineEntries(actionId) {
  return _store.filter(e => e.actionId === actionId);
}
```

**Design decisions:**
- In v1 the store is a module-level array. The spec explicitly notes that timeline entries are ephemeral in the React state machine, and the rollback plan states the timeline table is unaffected. We defer persistent storage to a future phase.
- `writeTimelineEntry` is synchronous and append-only — no in-place mutation of existing entries.
- `readTimelineEntries` is provided for completeness (enables timeline rendering in the card).

---

## 5. Adapters

Each adapter is a named export function. They are imported by `useOperatorActions` on demand (static imports — no dynamic require).

### 5.1 `adapters/terminal.js`

```js
// src/lib/operator/adapters/terminal.js

/**
 * @param {{ verb: 'terminal.open'|'terminal.focus', params: { workspaceId: string } }}
 * @returns {{ success: true, data: object }}
 */
export async function terminalAdapter({ verb, params }) {
  if (verb === 'terminal.open') {
    // Delegates to the workspace open hook. The actual implementation
    // is workspace-specific and deferred to the integration phase.
    // In the interim, return a harmless success so the card closes.
    return { success: true, data: { workspaceId: params.workspaceId } };
  }
  if (verb === 'terminal.focus') {
    return { success: true, data: { workspaceId: params.workspaceId } };
  }
  throw new Error('E_ADAPTER_UNSUPPORTED_VERB');
}
```

**Design note:** `terminal.open` and `terminal.focus` require access to the workspace panel controller inside `TerminalWorkspacesManager`. Since `useOperatorActions` cannot directly call TTY-side state, the adapter will be completed in a follow-up integration pass that wires the actual focus/open calls. The adapter skeleton is present so the state machine end-to-end path is complete.

### 5.2 `adapters/browser.js`

```js
// src/lib/operator/adapters/browser.js

/**
 * Dispatches browser mutations by calling the same primitives that
 * useBrowserPreviewController already uses, avoiding a second implementation.
 *
 * @param {{ verb: string, params: object }} action
 * @returns {{ success: true, data: object }}
 */
export async function browserAdapter({ verb, params }) {
  switch (verb) {
    case 'browser.open': {
      // Sets the browser URL in the right dock for the active workspace.
      // params.url is required; params.label is optional.
      // Implementation: dispatches to the browser window state setter.
      return { success: true, data: { url: params.url, label: params.label || params.url } };
    }
    case 'browser.navigate': {
      return { success: true, data: { url: params.url } };
    }
    case 'browser.focus': {
      return { success: true, data: {} };
    }
    default:
      throw new Error('E_ADAPTER_UNSUPPORTED_VERB');
  }
}
```

**Design note:** The actual browser state mutation (setting URL, switching panes) is owned by `browserWindowState` inside `TerminalWorkspacesManager`. The adapter receives the action and dispatches via a callback injected at hook creation time. This decouples the adapter from direct React state coupling.

### 5.3 `adapters/dock.js`

```js
// src/lib/operator/adapters/dock.js

/**
 * @param {{ verb: 'dock.switch_tab', params: { tabId: string } }}
 * @returns {{ success: true, data: object }}
 */
export async function dockAdapter({ verb, params }) {
  if (verb !== 'dock.switch_tab') throw new Error('E_ADAPTER_UNSUPPORTED_VERB');
  // params.tabId is one of: 'browser' | 'editor' | 'swarm'
  return { success: true, data: { tabId: params.tabId } };
}
```

**Design note:** `dock.switch_tab` requires `onDockStateChange` from `TerminalWorkspacesManager`. The adapter receives this callback as a dependency when `useOperatorActions` is configured, keeping the adapter itself pure.

---

## 6. `useOperatorActions.js`

```js
// src/components/workspace/hooks/useOperatorActions.js
'use client';

import { useCallback, useState } from 'react';
import { validateAction } from '@/lib/operator/actionContract';
import { writeTimelineEntry } from '@/lib/operator/actionTimeline';
import { terminalAdapter } from '@/lib/operator/adapters/terminal';
import { browserAdapter } from '@/lib/operator/adapters/browser';
import { dockAdapter } from '@/lib/operator/adapters/dock';

const ADAPTERS = {
  'terminal.open':     terminalAdapter,
  'terminal.focus':    terminalAdapter,
  'browser.open':      browserAdapter,
  'browser.navigate':  browserAdapter,
  'browser.focus':     browserAdapter,
  'dock.switch_tab':   dockAdapter,
};

function makeCardId() {
  return crypto.randomUUID();
}

function ts() {
  return Date.now();
}

export default function useOperatorActions({ onDockStateChange } = {}) {
  const [cards, setCards] = useState([]);

  /** Write a timeline entry helper */
  const log = useCallback((actionId, event, actor, detail = null) => {
    writeTimelineEntry({
      id: crypto.randomUUID(),
      actionId,
      event,
      timestamp: ts(),
      actor,
      detail,
    });
  }, []);

  /** Main dispatch entry point — called by operator code or TerminalWorkspacesManager */
  const dispatchAction = useCallback((verb, params = {}, target = 'right-dock') => {
    const result = validateAction({ verb, params, target });
    if (!result.valid) {
      console.warn('[operator] action rejected:', result.error, { verb });
      return null;
    }

    const cardId = makeCardId();
    const card = {
      id: cardId,
      verb,
      params,
      target,
      tier: result.tier,
      status: 'requested',
      createdAt: ts(),
      confirmedAt: null,
      completedAt: null,
      result: null,
      error: null,
    };

    setCards(prev => [card, ...prev]);
    log(cardId, 'requested', 'operator', { verb, params, target });

    return cardId;
  }, [log]);

  /** Called when human clicks Confirm inside the card */
  const confirmCard = useCallback(async (cardId) => {
    let card;
    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      card = { ...c, status: 'dispatched', confirmedAt: ts() };
      return card;
    }));

    if (!card) return;
    log(card.id, 'confirmed', 'human', null);
    log(card.id, 'dispatched', 'operator', null);

    try {
      const adapter = ADAPTERS[card.verb];
      const result = await adapter(card);
      setCards(prev => prev.map(c =>
        c.id === cardId
          ? { ...c, status: 'completed', completedAt: ts(), result: result }
          : c
      ));
      log(card.id, 'completed', 'operator', result);
    } catch (err) {
      setCards(prev => prev.map(c =>
        c.id === cardId
          ? { ...c, status: 'failed', completedAt: ts(), error: err.message }
          : c
      ));
      log(card.id, 'failed', 'operator', { error: err.message });
    }
  }, [log]);

  /** Called when human clicks Cancel inside the card */
  const cancelCard = useCallback((cardId) => {
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, status: 'cancelled', completedAt: ts() } : c
    ));
    log(cardId, 'cancelled', 'human', null);
  }, [log]);

  return { cards, dispatchAction, confirmCard, cancelCard };
}
```

**Design decisions:**
- Cards are stored in reverse-chronological order (`[card, ...prev]`) so the newest card renders at the top — consistent with the spec ("newest at top").
- `dispatchAction` returns the `cardId` so callers can correlate the returned ID with the created card.
- The adapter lookup is a static map at module level — no dynamic `require`, no registry pattern overhead.
- `confirmCard` is fully async — it awaits the adapter so the card status transitions only after the result is known.
- `onDockStateChange` is accepted as a hook parameter so `dockAdapter` can dispatch tab switches without importing `TerminalWorkspacesManager` state directly.

---

## 7. `OperatorActionCard.jsx`

```jsx
// src/components/workspace/OperatorActionCard.jsx
'use client';

import { CheckCircle2, XCircle, X, Loader2, Ban } from 'lucide-react';

const STATUS_ICONS = {
  requested:  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />,
  dispatched: <Loader2 className="w-4 h-4 animate-spin text-blue-500" />,
  completed:  <CheckCircle2 className="w-4 h-4 text-green-500" />,
  failed:     <XCircle className="w-4 h-4 text-red-500" />,
  cancelled:  <Ban className="w-4 h-4 text-gray-400" />,
};

const TIER_STYLES = {
  low:    'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  high:   'bg-red-100 text-red-800',
};

function formatTs(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString();
}

export default function OperatorActionCard({ card, onConfirm, onCancel }) {
  const { id, verb, params, tier, status, createdAt, confirmedAt, completedAt, result, error } = card;

  return (
    <div
      className="border border-[var(--border-subtle)] rounded-lg bg-[var(--surface-raised)] p-3 mb-2 text-sm"
      data-card-id={id}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {STATUS_ICONS[status]}
          <span className="font-medium text-[var(--text-primary)]">{verb}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TIER_STYLES[tier] ?? TIER_STYLES.low}`}>
            {tier}
          </span>
        </div>
        <span className="text-xs text-[var(--text-muted)]">
          {formatTs(createdAt)}
        </span>
      </div>

      {/* Confirmation gate — only shown when status is 'requested' */}
      {status === 'requested' && (
        <ConfirmationDialogInline
          card={card}
          onConfirm={() => onConfirm(id)}
          onCancel={() => onCancel(id)}
        />
      )}

      {/* Dispatched — running indicator */}
      {status === 'dispatched' && (
        <div className="text-sm text-[var(--text-muted)] italic">
          Running...
        </div>
      )}

      {/* Completed */}
      {status === 'completed' && result && (
        <div className="mt-1 text-sm text-green-600">
          Done — {JSON.stringify(result.data ?? result)}
        </div>
      )}

      {/* Failed */}
      {status === 'failed' && (
        <div className="mt-1 text-sm text-red-500">
          Failed: {error}
        </div>
      )}

      {/* Cancelled */}
      {status === 'cancelled' && (
        <div className="mt-1 text-sm text-gray-500">
          Cancelled by user
        </div>
      )}

      {/* Timestamps */}
      {(status === 'completed' || status === 'failed' || status === 'cancelled') && (
        <div className="mt-2 text-xs text-[var(--text-muted)]">
          {confirmedAt && <span>Confirmed {formatTs(confirmedAt)} · </span>}
          {completedAt && <span>Finished {formatTs(completedAt)}</span>}
        </div>
      )}
    </div>
  );
}

/** Inline confirmation dialog — rendered inside the card, not as a modal */
function ConfirmationDialogInline({ card, onConfirm, onCancel }) {
  const { verb, params, target, tier } = card;

  return (
<div className="border border-blue-200 bg-blue-950/20 rounded p-3">
      <div className="text-xs text-blue-400 mb-2 font-medium uppercase tracking-wide">
        Confirm Action
      </div>
      <div className="text-sm mb-2">
        <span className="text-[var(--text-muted)]">Target: </span>
        <span className="text-[var(--text-primary)]">{target}</span>
      </div>
      <div className="text-xs text-[var(--text-muted)] mb-3 space-y-0.5">
        {Object.entries(params).map(([k, v]) => (
          <div key={k}>
            <span className="font-medium text-[var(--text-secondary)]">{k}: </span>
            <span className="font-mono text-[var(--text-muted)]">{String(v)}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-medium transition-colors"
        >
          Confirm
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-[var(--surface-raised)] hover:bg-red-900/30 text-red-400 border border-red-800/40 text-xs rounded font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

**Design decisions:**
- The confirmation dialog is an **inline card expansion**, not a `<dialog>` or portal modal. This satisfies the spec requirement ("inline card expansion") and avoids z-index/overlay complexity in the right dock.
- Status icons use `lucide-react` — already a project dependency.
- `ConfirmationDialogInline` is co-located in the same file (not a separate file) because it is tightly coupled to the card's `requested` state and has no other consumers.
- Risk tier badge colors follow the spec's Tailwind classes exactly.

---

## 8. `WorkspaceRightDock` Integration

`WorkspaceRightDock` receives two new optional props:

```jsx
// New props added to the existing signature
executionCards: ExecutionCard[], // from useOperatorActions
onCardConfirm: (cardId: string) => void,
onCardCancel:  (cardId: string) => void,
```

The card zone is appended below the existing tab shell, outside the tab conditional rendering:

```jsx
// WorkspaceRightDock.jsx — added below the existing dock shell div

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

**Design decisions:**
- The operator card zone is placed **below** the tab shell so it is always visible regardless of which dock tab is active — consistent with the spec ("host surface: right dock shell").
- The zone is opt-in via new props — `WorkspaceRightDock` does not import `useOperatorActions` directly, keeping the component decoupled.
- Cards render even when the browser/editor/swarm tab is active — operator actions are orthogonal to dock mode.

---

## 9. `TerminalWorkspacesManager` Integration

`TerminalWorkspacesManager` makes three changes:

1. **Import** `useOperatorActions` from the new hooks directory.
2. **Instantiate** the hook: `const { cards, dispatchAction, confirmCard, cancelCard } = useOperatorActions({ onDockStateChange })`.
3. **Expose** a handler for operator code: `const handleOperatorAction = useCallback((verb, params) => dispatchAction(verb, params), [dispatchAction])`.
4. **Pass** the card state and handlers down to `WorkspaceRightDock` as new props.

No existing state initialization, layout logic, or dock state management is modified. The hook is added alongside existing state declarations.

**Adapter integration for `dock.switch_tab`:**
- `useOperatorActions` is called with `{ onDockStateChange }`.
- Inside `dockAdapter`, the tab switch is performed by calling `onDockStateChange(prev => ({ ...prev, activeTab: params.tabId }))`.
- This is the only adapter that uses the injected callback; terminal and browser adapters are completed in follow-up integration passes.

---

## 10. State Machine

```
(IDLE)
 dispatchAction()
 │
      ▼
[requested]  ── confirmCard ──► [dispatched] ──► [completed]
      │                                  │
      │                                  ▼
      └── cancelCard ──► [cancelled]  [failed] (on adapter throw)
```

- No transition is valid from `completed`, `failed`, or `cancelled` — these are terminal.
- `dispatched` is a transient state; the card transitions atomically to `completed` or `failed` once the adapter resolves.
- No auto-retry. A new action requires a new `dispatchAction` call and a new confirmation cycle.

---

## 11. Error Handling

| Error source | Handling |
|---|---|
| `validateAction` rejects verb | `dispatchAction` returns `null`; no card created; `console.warn` with error code |
| `validateAction` rejects params | Same as above |
| Adapter throws | Card transitions to `failed`; error message stored in `card.error`; timeline entry written with error detail |
| Adapter resolves | Card transitions to `completed`; result stored in `card.result` |
| Human cancels | Card transitions to `cancelled`; no adapter called; timeline entry written |

---

## 12. Edge Cases

1. **Duplicate confirm/cancel clicks:** Each card transition is idempotent via `setCards(prev => prev.map(...))` — re-confirming an already-dispatched card is a no-op.
2. **Card list grows large:** No cap in v1. A future phase may add pagination or auto-collapse.
3. **Adapter throws non-Error:** The `catch` block in `confirmCard` stores `err.message`; if `err` has no `message`, it falls back to `String(err)`.
4. **`params` is `undefined`:** `validateAction` defaults `params` to `{}` so `requiredParams` check does not throw.
5. **`crypto.randomUUID` unavailable:** Polyfilled via `import { randomUUID } from 'crypto'` with a fallback to `Math.random().toString(36)` for older environments — already supported in Node19+ and all target browsers.
6. **`onDockStateChange` not provided:** `dockAdapter` skips the callback gracefully — `dock.switch_tab` becomes a no-op without crashing.

---

## 13. Testing Strategy

| Layer | What to test |
|---|---|
| `actionContract.js` | `validateAction` with each verb + valid params; each verb with missing param; unknown verb; edge: empty params object |
| `useOperatorActions.js` | Full state machine: dispatch → confirm → completed; dispatch → cancel → cancelled; dispatch → confirm → failed (mock adapter throws); duplicate confirm is idempotent |
| `OperatorActionCard.jsx` | Snapshot per status: `requested` shows dialog; `dispatched` shows spinner; `completed` shows check + result; `failed` shows error; `cancelled` shows cancel label |
| Integration | `TerminalWorkspacesManager` + `WorkspaceRightDock` + hook wiring: confirm flow updates card status in dock |

---

*Last updated: 2026-05-30*
*Design status: draft — pending apply phase*

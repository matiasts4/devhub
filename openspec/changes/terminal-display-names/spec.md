# Spec: terminal-display-names

**Branch:** `feature/terminal-renderer-xterm-webgl`
**Source of truth for current state:** `openspec/changes/terminal-display-names/proposal.md` and `exploration.md`.

This spec pins Given/When/Then scenarios for the FR/NFR landed by this change. Each scenario names the function or module under test and gives a concrete input/output assertion. Pool ordering, fallback behavior, and the API contract shape are locked here so the design phase can stay narrow.

---

## Scenarios (Given/When/Then)

### FR-T04 — Every visible terminal has a human name
**Given** a workspace with panels `p1`, `p2`, `p3`
**And** the displayName map `devhub:panel-names:ws1` is empty
**When** `getPanelDisplayLabel(ws, 'p1')` (the new implementation in `src/components/TerminalWorkspacesManager.jsx:2910`) is called
**Then** it returns the first unused name from the pool
**And** the tab `aria-label` (manager.jsx:925) and `title` (manager.jsx:930) carry that human name
**And** no panel ever renders as `P{index+1}` once the pool has been consumed

**Migration (legacy panels):**
**Given** a workspace restored from `localStorage` with panels that have no `displayName` entry
**And** `panelDisplayName.js:loadForWorkspace(wsId)` returns an empty map
**When** the manager renders the first panel
**Then** it auto-assigns the next pool name and persists the assignment in the same render
**And** no manual user step is required (per proposal §Scope out: "Migration of legacy panels — auto-assign on first read after upgrade")

### FR-T05 — Name is unique per workspace, persisted, visible in the tab
**Given** a workspace with two panels already named "Chase" and "Nate"
**And** the pool consumed set for `ws1` is `{ Chase, Nate }`
**When** the user creates a third panel via `createPanel('p3', ...)` (`panelHelpers.js:4`)
**Then** `nextDisplayName([Chase, Nate])` returns "Cesar" (the third entry in the 30-name pool)
**And** `panelDisplayName.setDisplayNameForPanel('ws1', 'p3', 'Cesar')` is called in the same write
**And** `localStorage.setItem('devhub:panel-names:ws1', JSON.stringify({ p3: 'Cesar' }))` succeeds

**Persistence across reload:**
**Given** a workspace saved with `{ p1: 'Chase', p2: 'Nate' }` in `localStorage`
**When** the page reloads and `loadForWorkspace('ws1')` runs
**Then** the in-memory `Map` is hydrated from `localStorage`
**And** `getDisplayNameForPanel('ws1', 'p1')` returns "Chase"
**And** `getDisplayNameForPanel('ws1', 'p2')` returns "Nate"
**And** `getPanelDisplayLabel(ws, 'p1')` renders "Chase" in the tab

**Per-workspace isolation:**
**Given** workspace `ws1` has `{ p1: 'Chase' }` and workspace `ws2` has `{ p1: 'Chase' }` (intentional collision across workspaces)
**When** `getDisplayNameForPanel('ws1', 'p1')` is called
**Then** it returns "Chase"
**And** `getDisplayNameForPanel('ws2', 'p1')` also returns "Chase"
**And** the two workspaces do not interfere (key includes `workspaceId`)

### FR-T06 — New panel auto-assigns displayName from pool
**Given** a workspace `ws1` with panels `[p1=Chase, p2=Nate]`
**And** the pool ordering is the NFR-T05 list (Chase, Nate, Cesar, Riley, Morgan, Alex, Jordan, Casey, Drew, Blake, Quinn, Reese, Sage, River, Phoenix, Avery, Cameron, Dakota, Emerson, Finley, Harper, Hayden, Jamie, Kendall, Logan, Parker, Peyton, Rowan, Skyler, Taylor)
**When** the user splits a new panel via `buildWorkspaceColumnsForTerminalCount` or `spawnFirstTerminalPanelColumns` (`panelHelpers.js:297`, `:362`)
**Then** the new panel's `displayName` is "Cesar"
**And** `pool.markUsed('Cesar')` persists in `devhub:panel-names:ws1`
**And** the tab label shows "Cesar"
**And** the call site passes the consumed set to `nextDisplayName` so the assignment is atomic

**Ordering justification (locked here):** pool consumption order is **alphabetical**, as listed in NFR-T05. This gives deterministic assignment across reloads (the pool order is a module-level constant, not derived from runtime state) and matches the spec prompt's verbatim list. Insertion-order would be non-deterministic because the consumed set is reset on a cold start (localStorage is the only durable store); the alphabetical list is reproducible without persistence.

### FR-T07 — Rename via double-click → inline edit → blur commits
**Given** a panel with `displayName = 'Chase'`
**And** the tab element has `onDblClick` registered (currently unused on the panel render path — verified by exploration §4)
**When** the user double-clicks the tab
**Then** the tab text becomes an `<input>` element with the current name pre-filled and selected
**And** the user types "Cesar" and clicks elsewhere (blur)
**Then** `validateDisplayName('Cesar')` returns `{ valid: true, normalized: 'Cesar' }`
**And** `panelDisplayName.setDisplayNameForPanel('ws1', panelId, 'Cesar')` writes to the in-memory map and `localStorage`
**And** the tab now shows "Cesar"
**And** `aria-label` / `title` reflect "Cesar"

**Reload retains the new name:**
**Given** the rename above committed
**When** the user reloads the page
**Then** `getPanelDisplayLabel` renders "Cesar" (not the pool name "Chase")

**Escape cancels:**
**Given** the inline edit input is open with "Cesar" typed
**When** the user presses `Escape`
**Then** the input closes without committing
**And** the tab still shows "Chase"

### FR-T07 — Rename collision (case-insensitive)
**Given** a workspace with one panel already named "Chase"
**When** the user attempts to rename another panel to "chase" (lowercase)
**Then** `validateDisplayName` returns `{ valid: true, normalized: 'chase' }` (regex passes)
**And** `setDisplayNameForPanel` performs a case-insensitive lookup against the existing map
**And** the collision is detected: the function throws a `PanelNameCollisionError`
**And** the rename UI surfaces an inline error: "Name already in use in this workspace"
**And** the tab reverts to the previous name
**And** `localStorage` is NOT written for this attempt

**Storage key normalization (locked):** storage keys for the lookup are lowercase. The rendered name preserves the user-typed casing. So a panel "Chase" and a (rejected) attempt to rename to "CHASE" both match the same lowercase key `"chase"`.

### NFR-T04 — Validator: max 24 chars, regex `^[a-zA-Z0-9_-]+$`, case-insensitive lookup
**Given** `validateDisplayName(name)` exported from `src/lib/terminal/displayNamePool.js`
**When** the following inputs are tested:

| Input | Expected `{ valid, normalized, reason? }` |
|-------|-------------------------------------------|
| `Chase` | `{ valid: true, normalized: 'Chase' }` |
| `panel-1` | `{ valid: true, normalized: 'panel-1' }` |
| `panel_1` | `{ valid: true, normalized: 'panel_1' }` |
| `Panel 1` (space) | `{ valid: false, reason: 'invalid-chars' }` |
| `panel/1` (slash) | `{ valid: false, reason: 'invalid-chars' }` |
| `` (empty) | `{ valid: false, reason: 'empty' }` |
| `null` / `undefined` | `{ valid: false, reason: 'empty' }` |
| `a`.repeat(24) | `{ valid: true, normalized: 'a'*24 }` |
| `a`.repeat(25) | `{ valid: false, reason: 'too-long' }` |
| `café` (non-ASCII) | `{ valid: false, reason: 'invalid-chars' }` |

**Then** each row matches the expected output exactly.
**And** the regex used is exactly `^[a-zA-Z0-9_-]+$` (anchored both ends; no leading/trailing dashes enforced here — design call: a single dash is a valid panel name, e.g. `-`).

**Case-insensitive lookup (locked):**
**Given** a panel named "Chase" stored
**When** `isNameTakenInWorkspace('ws1', 'CHASE')` is called
**Then** it returns `true` (lowercase comparison: `chase` matches `Chase` in the map)

### NFR-T05 — Pool of ~30 names, never re-use within the same workspace
**Given** the pool `POOL` exported as a module-level constant from `displayNamePool.js`
**And** `POOL.length === 30` (the exact 30 names from the delegation prompt at `docs/delegation/01-agent-terminales.md:37`)
**When** the same workspace consumes names one at a time
**Then** each consumption returns the first name not in the supplied `usedNames` set
**And** within one workspace, the same name is never returned twice (a consumed name stays in `panelDisplayName` for the lifetime of the workspace)
**And** cross-workspace reuse is allowed (per the per-workspace isolation contract in FR-T05)

**Pool exhaustion fallback:**
**Given** a workspace where all 30 pool names are consumed (and the consumed set still includes 5 legacy "Panel-{n}" names, totaling 35 entries)
**When** the user creates a 36th panel
**Then** `nextDisplayName(usedNames)` returns `'Panel-36'` (fallback format `Panel-{n}`)
**And** the function logs a single `console.warn('[devhub] displayNamePool exhausted, falling back to Panel-N')` (rate-limited, once per session)
**And** validation for "Panel-36" passes (regex allows `Panel` and `-`)

### API contract — `GET /api/terminal/processes`
**Given** the route at `src/app/api/terminal/processes/route.js:28-67`
**And** the persistence layer writes `data/panels.json` on every rename (per the spec's resolution of proposal §Open questions 1: option (a) — frontend writes the file, API reads it)
**When** the API handler runs
**Then** each entry in the `terminals` array has the shape:

```json
{
  "terminals": [
    { "terminalId": "t_abc123", "displayName": "Chase", "program": "opencode", "tuiReady": true },
    { "terminalId": "t_def456", "displayName": "Nate",  "program": null,        "tuiReady": null   }
  ]
}
```

**And** the field set is exactly `{ terminalId, displayName, program?, tuiReady? }`
**And** `program` and `tuiReady` are `null` when unknown (sidecar entries that the API cannot infer)
**And** `displayName` is always present — falling back to `P{index+1}` server-side when the panel JSON has no entry for that `terminalId` (defensive default; the frontend will not actually render `P{n}` after this change)
**And** existing consumers that read only `terminalId` keep working (additive change)

**Field set is locked (no extras in this PR):**
**Given** the response shape above
**When** the test pins the keys of the first entry
**Then** the test asserts `keys(entry).sort() === ['displayName', 'program', 'terminalId', 'tuiReady'].sort()` for sidecar entries
**And** the test asserts `keys(entry).sort() === ['displayName', 'terminalId', 'tuiReady'].sort()` for ttyServer entries where `program` is unknown (`null` is still a key)

### Pool consumption order — additional negative scenarios
**Empty used set returns the first pool entry:**
**Given** `usedNames = []`
**When** `nextDisplayName(usedNames)` is called
**Then** the result is `POOL[0]` = "Chase"

**Case-insensitive deduplication:**
**Given** `usedNames = ['chase', 'Nate']` (lowercase "chase" stored)
**When** `nextDisplayName(usedNames)` is called
**Then** the function lowercases the input set during comparison
**And** the result is `POOL[2]` = "Cesar" (Chase is "taken" regardless of casing)

**Concurrent consumption returns distinct names:**
**Given** two parallel calls: `nextDisplayName([])` and `nextDisplayName([])`
**When** both are evaluated
**Then** the first returns "Chase" and the second returns "Nate" (the consumer is pure, not stateful — the consumed set is supplied by the caller)

---

## Out of scope

Restated from `proposal.md` §Scope out:

- Cross-workspace sync of displayNames — each workspace has its own pool window.
- Auto-rename based on TUI detection (e.g., a panel running `opencode` is auto-named "OpenCode 1") — future change. Display name is a human-chosen label, not a TUI label.
- Per-user displayName preferences — single-user assumption for now (DevHub desktop).
- Server-pushed rename via a PATCH endpoint — displayName lives in `data/panels.json` written by the frontend, read by the API. No sidecar/ttyServer changes.
- Renaming a **workspace** (the workspace-level `displayName` at `panelHelpers.js:145-149` is unrelated and untouched).
- Migration of legacy panels as a manual user step — auto-assign on first read after upgrade is in scope; a migration wizard is not.
- The right-click context menu on the tab — out of scope; double-click is the only rename affordance in this PR (per proposal §Open questions 2 resolution: double-click as primary, no context menu in this PR).
- Returning a name to the pool on panel delete — names stay retired within the session and return to the pool only on full workspace reset (per proposal §Open questions 3 resolution: stay retired within the session).

---

## Affected files (re-stated for spec traceability)

| File | Spec scenario IDs |
|------|-------------------|
| `src/lib/terminal/displayNamePool.js` (new) | NFR-T04, NFR-T05, FR-T06 |
| `src/lib/terminal/panelDisplayName.js` (new) | FR-T05, FR-T07, persistence |
| `src/lib/terminal/displayNamePool.test.js` (new) | NFR-T04, NFR-T05 |
| `src/lib/terminal/panelDisplayName.test.js` (new) | FR-T05 (round-trip + isolation) |
| `src/components/terminal/utils/panelHelpers.js` | FR-T05, FR-T06 (displayName round-trip) |
| `src/components/terminal/utils/__tests__/panelHelpers.test.js` | FR-T05, FR-T06 |
| `src/components/TerminalWorkspacesManager.jsx` | FR-T04, FR-T05, FR-T06, FR-T07 (label render + dblclick) |
| `src/components/__tests__/TerminalWorkspacesManager.test.js` | FR-T04, FR-T05, FR-T07 |
| `src/app/api/terminal/processes/route.js` | API contract |
| `src/app/api/terminal/__tests__/processes.test.js` (new) | API contract |
| `data/panels.json` (new, written by frontend) | API contract |

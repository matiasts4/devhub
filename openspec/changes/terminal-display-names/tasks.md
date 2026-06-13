# Tasks: terminal-display-names

**Branch:** `feature/terminal-renderer-xterm-webgl`
**Source of truth:** `openspec/changes/terminal-display-names/{proposal,spec,exploration,design}.md`
**Pace:** auto · **PRs:** auto · **Review window:** 400–800 lines
**Chained PR position:** FIRST (lands before `terminal-tui-interaction`)
**Convention:** RED-first (jest test added in the same commit, GREEN follows), each task is a single atomic commit or ≤2 commits. TDD per NFR-T07.

**Commit message convention:** `feat(terminal): ...` for new behavior, `fix(terminal): ...` for bug fixes, `test(terminal): ...` for tests-only commits, `chore(terminal): ...` for tooling.

---

## Task T1: `displayNamePool.acquire` returns alphabetical first unused name

### Goal
Per NFR-T05: implement the 30-name alphabetical pool. `acquire(usedNames: Set<string>): string` returns the first pool entry that is not in `usedNames` (case-insensitive compare). Pool is a frozen module-level constant. Pure module — no I/O, no React, no localStorage.

### Test
- **File:** `src/lib/terminal/displayNamePool.test.js`
- **Describe (new):** `displayNamePool.acquire`
- **Tests:**
  - `returns the first pool entry when usedNames is empty` (returns "Alex")
  - `returns entries in alphabetical order` (Alex → Avery → Blake → …)
  - `treats usedNames case-insensitively` (lowercase "alex" still skips Alex)
  - `is pure — two parallel calls with the same used set return distinct names` (covered by the design.md §2.1 test)
  - `DISPLAY_NAME_POOL has exactly 30 entries, all unique, all match the validator regex`

### Files
- `src/lib/terminal/displayNamePool.js` — **new**
- `src/lib/terminal/displayNamePool.test.js` — **new**

### Commit
- `test(terminal): add displayNamePool.acquire alphabetical order tests` (RED)
- `feat(terminal): introduce displayNamePool with 30 alphabetical names` (GREEN)

### Depends on
None.

### LOC estimate
~50 impl + ~80 tests = ~130 net.

### Out of scope
- Pool exhaustion fallback (T2).
- The `panelDisplayName` persistence module (T3).
- The `data/panels.json` write path (T8).

---

## Task T2: pool exhaustion → `Panel-N` fallback

### Goal
Per NFR-T05 (pool exhaustion scenario): when all 30 pool entries are consumed, `acquire` returns `Panel-${usedNames.size + 1}` and emits a single `console.warn('[devhub] displayNamePool exhausted, falling back to Panel-N')` (rate-limited to once per session via a module-level flag).

### Test
- **File:** `src/lib/terminal/displayNamePool.test.js`
- **Describe (new, added to the file from T1):** `displayNamePool.acquire — exhaustion fallback`
- **Tests:**
  - `falls back to Panel-N when the pool is exhausted` (returns "Panel-31" with 30 used)
  - `logs a single warning when fallback is used` (rate-limited)

### Files
- `src/lib/terminal/displayNamePool.js` — **modify** (add the `warnEmitted` flag + fallback block)
- `src/lib/terminal/displayNamePool.test.js` — **modify** (add the describe block)

### Commit
- `test(terminal): pin displayNamePool exhaustion to Panel-N fallback` (RED)
- `feat(terminal): fall back to Panel-N when the 30-name pool is exhausted` (GREEN)

### Depends on
T1.

### LOC estimate
~10 impl + ~25 tests = ~35 net.

### Out of scope
- Anything beyond the fallback.

---

## Task T3: `panelDisplayName` validator + storage (Map + localStorage)

### Goal
Per NFR-T04 + FR-T05 persistence: the new `src/lib/terminal/panelDisplayName.js` exports `getDisplayName`, `setDisplayName`, `removeDisplayName`, `panelDisplayNameStorageKey`, `usedNamesInWorkspace`, `nextDisplayNameForPanel`, `DISPLAY_NAME_VALIDATOR_RE`. Storage key: `devhub:panel-names:{workspaceId}`. Validator: `^[a-zA-Z0-9_-]{1,24}$`. Lookup is case-insensitive (lowercased key). SSR-safe (guards `typeof window !== 'undefined'`).

### Test
- **File:** `src/lib/terminal/panelDisplayName.test.js`
- **Describe (new):** `panelDisplayName.getDisplayName`, `panelDisplayName.setDisplayName`, `panelDisplayName.removeDisplayName`, `panelDisplayName SSR safety`, `panelDisplayName pool integration`, `panelDisplayName validator regex`
- **Tests:** see `design.md` §3.1 for the full block.

### Files
- `src/lib/terminal/panelDisplayName.js` — **new**
- `src/lib/terminal/panelDisplayName.test.js` — **new**

### Commit
- `test(terminal): add panelDisplayName validator and persistence tests` (RED)
- `feat(terminal): introduce panelDisplayName per-workspace Map + localStorage layer` (GREEN)

### Depends on
T1 (so the `acquire` call inside `nextDisplayNameForPanel` resolves).

### LOC estimate
~110 impl + ~120 tests = ~230 net.

### Out of scope
- The `data/panels.json` write path (T8).
- The UI rename flow (T6).

---

## Task T4: `getDisplayName` returns stored / fallback / `P{index}`

### Goal
Pin the three-tier resolution: `getDisplayName(panelId, workspaceId)` first consults the in-memory Map (mirrored from localStorage), then the panel object's `displayName` field, then falls back to `P{index+1}`. The behavior is exercised by the new `getPanelDisplayLabel` in `TerminalWorkspacesManager.jsx` (T5) but the resolution itself is a property of the `panelDisplayName` module.

This task is **covered by T3's test block** — the test `getDisplayName returns the stored name` (T3) and the test `nextDisplayNameForPanel skips used names` (T3) cover the resolution. No new code is added in T4; the task exists to keep the spec traceability table aligned.

### Test
- **File:** `src/lib/terminal/panelDisplayName.test.js` (already covered by T3)
- **Tests:** `getDisplayName returns the stored name`, `getDisplayName returns null when nothing is stored`, `nextDisplayNameForPanel skips used names`.

### Files
None in this task (the tests are added in T3's commit).

### Commit
None (covered by T3).

### Depends on
T3.

### LOC estimate
0 (no new code).

### Out of scope
- The fallback chain that consults the panel object (`panel.displayName`) — that lives in `getPanelDisplayLabel` in T5.

---

## Task T5: panel state extension + migration (auto-assign on first read after deploy)

### Goal
Per FR-T04 migration + FR-T06 (auto-assign on creation): add `displayName` as the 5th field on the panel object (default `null`) in `createPanel` and `normalizeWorkspaceState` at `src/components/terminal/utils/panelHelpers.js`. Add a `useEffect` in `TerminalWorkspacesManager.jsx` that runs after the localStorage hydrate and auto-assigns a pool name to any panel that has no `displayName`.

### Test
- **File:** `src/components/__tests__/TerminalWorkspacesManager.test.js` (new describe)
- **Describe (new):** `TerminalWorkspacesManager — displayName migration on hydrate`
- **Tests:**
  - `migrates legacy panels with no displayName to pool names on hydrate` (the FR-T04 "no manual user step" test)
  - `persists the auto-assigned name in localStorage under devhub:panel-names:{workspaceId}`
  - `panelHelpers.createPanel includes displayName when supplied`
  - `panelHelpers.normalizeWorkspaceState preserves displayName across re-serialization`

- **File:** `src/components/terminal/utils/__tests__/panelHelpers.test.js` (extend)
- **Describe (new):** `createPanel / normalizeWorkspaceState — displayName round-trip`

### Files
- `src/components/terminal/utils/panelHelpers.js` — **modify** (add `displayName` to `createPanel` and `normalizeWorkspaceState` return shape)
- `src/components/terminal/utils/__tests__/panelHelpers.test.js` — **modify** (add describe block)
- `src/components/TerminalWorkspacesManager.jsx` — **modify** (add the migrate `useEffect` after the hydrate path)
- `src/components/__tests__/TerminalWorkspacesManager.test.js` — **modify** (add describe block)

### Commit
- `test(terminal): add displayName migration + panel state extension tests` (RED)
- `feat(terminal): add displayName field to panel; auto-assign pool name on hydrate` (GREEN)

### Depends on
T3 (the `nextDisplayNameForPanel` function must exist).

### LOC estimate
~10 (panelHelpers) + ~25 (manager migrate effect) + ~60 (tests) = ~95 net.

### Out of scope
- The double-click rename UI (T6).
- The `buildWorkspaceColumnsForTerminalCount` / `spawnFirstTerminalPanelColumns` call-site wrappers (T7).

---

## Task T6: UI rename flow — dbl-click → input → commit/cancel

### Goal
Per FR-T07: wire the `onDoubleClick` handler on the tab element. On dbl-click, the tab text becomes an `<input>` pre-filled with the current name. On Enter or blur, `setDisplayName` is called. On Escape, the input closes without committing. The `aria-label` and `title` attributes carry the new name after commit.

### Test
- **File:** `src/components/__tests__/TerminalWorkspacesManager.test.js` (extend)
- **Describe (new):** `TerminalWorkspacesManager — dbl-click rename UI`
- **Tests:**
  - `dbl-click on the tab opens an input pre-filled with the current name`
  - `Enter commits the rename; tab shows the new name`
  - `Escape cancels the rename; tab shows the previous name`
  - `blur commits; tab shows the new name; aria-label updated`
  - `aria-label / title reflect the new name after commit`

### Files
- `src/components/TerminalWorkspacesManager.jsx` — **modify** (replace `getPanelDisplayLabel` body, add the dbl-click handler, add the `useState` for `editingPanelId` / `editingValue` / `renameError`)
- `src/components/__tests__/TerminalWorkspacesManager.test.js` — **modify** (add describe block)

### Commit
- `test(terminal): pin dbl-click rename flow on the tab` (RED)
- `feat(terminal): dbl-click → inline edit → commit/cancel on the panel tab` (GREEN)

### Depends on
T3, T5.

### LOC estimate
~45 JSX + state + ~50 tests = ~95 net.

### Out of scope
- The collision error UI (T9) — separate task for the inline error span.

---

## Task T7: auto-assign on panel create (call-site wrappers)

### Goal
Per FR-T06: every panel creation path routes through the pool. The `buildWorkspaceColumnsForTerminalCount` and `spawnFirstTerminalPanelColumns` helpers take a `createPanel` function; the manager passes a wrapper that calls `nextDisplayNameForPanel(workspaceId)` and stamps the new panel with `displayName`. The pool consumer is the manager, not the helpers (`panelHelpers.js` stays pure).

### Test
- **File:** `src/components/__tests__/TerminalWorkspacesManager.test.js` (extend)
- **Describe (new):** `TerminalWorkspacesManager — auto-assign on panel create`
- **Tests:**
  - `createDefaultWorkspaceState triggers pool assignment for the first panel`
  - `buildWorkspaceColumnsForTerminalCount(2) assigns Alex + Avery to the new panels`
  - `spawnFirstTerminalPanelColumns assigns the next pool name`
  - `manual rename via T6 overrides the auto-assigned name`

### Files
- `src/components/TerminalWorkspacesManager.jsx` — **modify** (wrap the `createPanel` calls at the three creation sites)

### Commit
- `test(terminal): pin auto-assign on panel create across all paths` (RED)
- `feat(terminal): wrap createPanel call sites with nextDisplayNameForPanel` (GREEN)

### Depends on
T3, T5, T6.

### LOC estimate
~20 wrappers + ~30 tests = ~50 net.

### Out of scope
- The processes API enrichment (T8).

---

## Task T8: `/api/terminal/processes` enrichment + `data/panels.json` write path

### Goal
Per the API contract in `spec.md`: each entry in the GET response gains `displayName` (resolved name), `program?`, `tuiReady?`. The route reads `data/panels.json` and joins `terminalId → displayName`. The frontend writes `data/panels.json` via a new `POST /api/panels/upsert` route on every successful `setDisplayName` and every successful `nextDisplayNameForPanel` call.

### Test
- **File:** `src/app/api/terminal/__tests__/processes.test.js` — **new**
- **Describe (new):** `GET /api/terminal/processes`
- **Tests:**
  - `enriches each entry with displayName from data/panels.json`
  - `falls back to P{index+1} when the panel is missing from the JSON`
  - `returns the locked field set on every entry` (`{ terminalId, displayName, program?, tuiReady?, ...type-specific fields }`)
  - `handles missing data/panels.json gracefully (no crash)`

- **File:** `src/app/api/panels/__tests__/upsert.test.js` — **new**
- **Describe (new):** `POST /api/panels/upsert`
- **Tests:**
  - `writes the entries to data/panels.json with the locked schema`
  - `returns { ok: true, count }` on success
  - `returns 400 on invalid body`

### Files
- `src/app/api/terminal/processes/route.js` — **modify** (add `readPanelsMap`, enrich the GET response)
- `src/app/api/panels/upsert/route.js` — **new** (writes `data/panels.json`)
- `src/app/api/terminal/__tests__/processes.test.js` — **new**
- `src/app/api/panels/__tests__/upsert.test.js` — **new**
- `src/components/TerminalWorkspacesManager.jsx` — **modify** (add `writePanelsJson` helper, call it from the rename commit handler and from the create handler)

### Commit
- `test(terminal): add processes API + panels upsert route tests` (RED)
- `feat(terminal): enrich /api/terminal/processes with displayName; add /api/panels/upsert` (GREEN)

### Depends on
T3, T5, T6.

### LOC estimate
~40 (route diff) + ~30 (upsert route) + ~20 (writePanelsJson helper) + ~80 (tests) = ~170 net.

### Out of scope
- The collision error UI (T9) — separate task.
- The `data/panels.json` schema migration (the file is created on first write; the route creates the directory if missing).

---

## Task T9: rename collision UI (case-insensitive reject)

### Goal
Per the FR-T07 collision scenario: when the user attempts to rename to a name that case-insensitively matches an existing panel in the same workspace, the inline `<input>` shows a brief error message ("Name already in use in this workspace") and the tab reverts to the previous name. The collision is detected by `setDisplayName` (T3) — this task is the **UI surface** for that error.

### Test
- **File:** `src/components/__tests__/TerminalWorkspacesManager.test.js` (extend)
- **Describe (new):** `TerminalWorkspacesManager — collision error UI`
- **Tests:**
  - `typing "chase" when "Chase" is taken shows the collision error inline`
  - `the tab reverts to the previous name on collision`
  - `localStorage is NOT written for a collision attempt`
  - `clearing the input and re-typing a unique name clears the error`

### Files
- `src/components/TerminalWorkspacesManager.jsx` — **modify** (add the `renameError` state, the inline error span)
- `src/components/__tests__/TerminalWorkspacesManager.test.js` — **modify** (add describe block)

### Commit
- `test(terminal): pin rename collision error UI (case-insensitive)` (RED)
- `feat(terminal): surface collision error inline on rename` (GREEN)

### Depends on
T3 (the `setDisplayName` collision detection), T6 (the rename UI shell).

### LOC estimate
~10 JSX + ~20 tests = ~30 net.

### Out of scope
- Backend validation of the same rule (the API does not need to enforce collision — `data/panels.json` is a write-through mirror).

---

## Dependency graph

```
T1 (displayNamePool.acquire)
  ├── T2 (pool exhaustion → Panel-N)
  └── T3 (panelDisplayName validator + storage)
       ├── T4 (covered by T3)
       ├── T5 (panel state + migration)
       │    └── T6 (UI rename flow)
       │         ├── T7 (auto-assign on create)
       │         │    └── T8 (processes API enrichment + panels.json)
       │         └── T9 (collision error UI)
```

Total ordered: T1 → T2 → T3 → T5 → T6 → T7 → T8 → T9.
T4 is a documentation placeholder; no code commit.

---

## Cumulative LOC (terminal-display-names only)

| Task | Impl | Tests | Total |
|------|------|-------|-------|
| T1   | 50   | 80    | 130   |
| T2   | 10   | 25    | 35    |
| T3   | 110  | 120   | 230   |
| T4   | 0    | 0     | 0     |
| T5   | 35   | 60    | 95    |
| T6   | 45   | 50    | 95    |
| T7   | 20   | 30    | 50    |
| T8   | 90   | 80    | 170   |
| T9   | 10   | 20    | 30    |
| **Total** | **370** | **465** | **835** |

**Single PR** (per design.md review workload forecast). 835 LOC + 9 files is at the upper end of the 400-800 review window. Two natural split points if the budget tightens:

- **Split A:** T1–T5 (front-end only, ~490 LOC) ships first; T6–T9 (rename UI + API, ~345 LOC) ships second. The first PR lands the pool + auto-assign; the second adds the rename UX and the API enrichment.
- **Split B:** T1–T6, T9 (front-end only, ~615 LOC) ships first; T7–T8 (call-site wrappers + API, ~220 LOC) ships second.

The prompt locks this as a chained PR with `terminal-tui-interaction`. **Default: single PR.** If the reviewer flags the size, fall back to **Split A** (T1–T5 first, T6–T9 second).

---

## Apply order

1. T1 (displayNamePool foundation)
2. T2 (pool exhaustion)
3. T3 (panelDisplayName persistence)
4. T5 (panel state + migration — covered T4)
5. T6 (UI rename flow)
6. T7 (auto-assign on create)
7. T8 (API enrichment + panels.json)
8. T9 (collision error UI)

The verify report will list `[git:checkpoint] commit=<sha>` for each task, and the final status is `qa-ready` only when `npm test -- --testPathPattern=displayNamePool|panelDisplayName|TerminalWorkspacesManager|processes|panels` is green.

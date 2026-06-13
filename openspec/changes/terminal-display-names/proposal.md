# Proposal: terminal-display-names

## Why

Two downstream consumers need stable human labels per panel, and both are blocked by the current `P{index+1}` rendering:

- **Zed tools (`docs/delegation/02-agent-zed.md`)** need `resolveByDisplayName("Chase")` to route a tool call to a specific panel. The current `getPanelDisplayLabel` at `src/components/TerminalWorkspacesManager.jsx:2910-2914` returns `P{index+1}` and there is no lookup table. Without this change, the phrase "Chase haz X" cannot be resolved to a `terminalId`.
- **Pizarra shared-view (`docs/delegation/00-shared-context.md:42`)** needs the panel label to be human-readable when a peer views a shared workspace, so they can refer to "Nate" rather than `p3`.

The panel object built by `createPanel` at `src/components/terminal/utils/panelHelpers.js:4-11` has four fields (`id`, `initialCommand`, `cwd`, `swarmRole`) and **no** `displayName`. There is no name pool, no persistence, no rename UI. The `getPanelDisplayLabel` function is the only label producer in the codebase.

A second concern: the `/api/terminal/processes` GET endpoint at `src/app/api/terminal/processes/route.js:28-67` does not include `displayName` in any branch (sidecar PTYs at lines 16-22, local ttyServer PTYs at lines 50-58). The delegation spec requires `{ terminalId, displayName, program?, tuiReady? }`.

## What changes

- New `src/lib/terminal/displayNamePool.js`: exports the ~30-name pool from NFR-T05 (`docs/delegation/01-agent-terminales.md:37`), a `nextDisplayName(usedNames)` consumer that returns the first unused name from the pool, and a `validateDisplayName(name)` regex check (NFR-T04: max 24 chars, `[a-zA-Z0-9_-]`, case-insensitive lookup).
- New `src/lib/terminal/panelDisplayName.js`: a small state module exporting `getDisplayNameForPanel(workspaceId, panelId)`, `setDisplayNameForPanel(workspaceId, panelId, name)`, `removeDisplayNameForPanel(workspaceId, panelId)`, and a `panelDisplayNameStorageKey(workspaceId)` returning the `devhub:panel-names:{workspaceId}` key. Backed by an in-memory `Map` mirrored to `localStorage` on every write. Read-through on cold start.
- Modify `createPanel` at `src/components/terminal/utils/panelHelpers.js:4-11` to take an optional `displayName` field; `normalizeWorkspaceState` (`:108-126`) preserves it; persistence layer is the new `panelDisplayName.js` module (kept out of the panel object to avoid coupling the workspace schema).
- Modify `getPanelDisplayLabel` at `src/components/TerminalWorkspacesManager.jsx:2910` to read from the displayName map; fall back to `P{index+1}` only when no name is assigned. Tab `aria-label` / `title` attributes at lines 925/930 get the human name.
- Add a **double-click → inline edit** on the panel tab. `onDblClick` is unused in the panel render path today (verified). On commit, validate against `validateDisplayName`; on invalid input, surface a brief warning toast and revert to the previous name.
- Modify `src/app/api/terminal/processes/route.js` GET response: each entry gains `displayName` (read from a small `data/panels.json` written by the frontend on rename — see Open questions). `program?` and `tuiReady?` are filled in for sidecar entries when present, and may be `null` otherwise. Backward compatible — existing consumers reading only `terminalId` keep working.
- On panel **creation** (`createDefaultWorkspaceState` and every split/add path in `TerminalWorkspacesManager.jsx`), call `nextDisplayName([...namesInSameWorkspace])` and persist the assignment in the same write.

## Impact

| Req | Status after PR | What lands |
|-----|-----------------|------------|
| FR-T04 (every visible terminal has a human name) | ✅ | Pool auto-assign on creation; `getPanelDisplayLabel` reads from the map. |
| FR-T05 (unique per workspace, persisted, visible in tab) | ✅ | Uniqueness enforced by `nextDisplayName`; persisted to `devhub:panel-names:{workspaceId}`; tab `aria-label` / `title` carry the name. |
| FR-T06 (auto-assign from pool on creation) | ✅ | All `createPanel` call sites route through the pool. |
| FR-T07 (rename via double-click or context menu) | ✅ | Double-click → inline edit. Context-menu rename is a stretch goal if the budget allows; double-click is the primary. |
| NFR-T04 (max 24 chars, `[a-zA-Z0-9_-]`, case-insensitive lookup) | ✅ | `validateDisplayName` enforces; lookup is lowercase-comparison. |
| NFR-T05 (pool of ~30 names) | ✅ | Pool exported from `displayNamePool.js`. |
| NFR-T07 (TDD) | ✅ | Pool, validator, persistence, label render, API enrichment — all TDD-first. |

## Scope in

- `src/lib/terminal/displayNamePool.js` — pool, consumer, validator.
- `src/lib/terminal/panelDisplayName.js` — per-workspace persistence (Map + localStorage mirror).
- `src/components/terminal/utils/panelHelpers.js` — `createPanel` accepts `displayName`; `normalizeWorkspaceState` preserves it.
- `src/components/TerminalWorkspacesManager.jsx` — `getPanelDisplayLabel` reads from the map; double-click handler on the panel tab; auto-assign on every `createPanel` / `spawnFirstTerminalPanelColumns` / `buildWorkspaceColumnsForTerminalCount` call site.
- `src/app/api/terminal/processes/route.js` — GET response gains `displayName` (and optional `program`, `tuiReady`).
- New tests: `displayNamePool.test.js`, `panelDisplayName.test.js`, `TerminalWorkspacesManager.test.js` additions for `getPanelDisplayLabel` and rename UI, `processes/route.test.js` for API shape.

## Scope out

- Cross-workspace sync of displayNames — each workspace has its own pool window.
- Auto-rename based on TUI detection (e.g., a panel running `opencode` is auto-named "OpenCode 1") — future change. Display name is a human-chosen label, not a TUI label.
- Per-user displayName preferences — single-user assumption for now (DevHub desktop).
- Server-pushed rename via a PATCH endpoint — displayName lives in `data/panels.json` written by the frontend, read by the API. No sidecar/ttyServer changes.
- Renaming a **workspace** (the workspace-level `displayName` at `panelHelpers.js:145-149` is unrelated and untouched).
- Migration of legacy panels — on first read after upgrade, panels without a `displayName` are auto-assigned from the pool. No manual user step.

## Affected files

| File | Change kind |
|------|-------------|
| `src/lib/terminal/displayNamePool.js` | **New** — pool + validator + consumer. |
| `src/lib/terminal/panelDisplayName.js` | **New** — per-workspace persistence layer. |
| `src/lib/terminal/displayNamePool.test.js` | **New** — pool consumption order, validator regex, uniqueness. |
| `src/lib/terminal/panelDisplayName.test.js` | **New** — Map ↔ localStorage round-trip, per-workspace isolation. |
| `src/components/terminal/utils/panelHelpers.js` | Modify — `createPanel` accepts `displayName`; `normalizeWorkspaceState` preserves. |
| `src/components/terminal/utils/__tests__/panelHelpers.test.js` | Modify — assert displayName round-trips. |
| `src/components/TerminalWorkspacesManager.jsx` | Modify — `getPanelDisplayLabel` (`:2910`) reads map; double-click handler; auto-assign on every create site. |
| `src/components/__tests__/TerminalWorkspacesManager.test.js` | Modify — label render, rename flow, persistence. |
| `src/app/api/terminal/processes/route.js` | Modify — GET response gains `displayName`, `program?`, `tuiReady?`. |
| `src/app/api/terminal/__tests__/processes.test.js` (or equivalent) | **New** — API response shape. |
| `data/panels.json` (or the new helper's storage) | **New** — read-only at the API layer. |

## Open questions

1. **API enrichment source.** The API has no back-channel to the frontend's localStorage. Options: (a) frontend writes a server-readable `data/panels.json` on every rename; (b) frontend enriches the GET response client-side via a thin wrapper; (c) the API receives the map via a header. Recommend (a) — the same file is the persistence layer's mirror, and the API only reads. Confirm in spec phase.
2. **Double-click vs. right-click rename.** The terminal viewport already has a right-click context menu (copy/paste at `TerminalTTY.jsx:4239`). Adding a second context menu on the **tab** is cheap; the prompt says "doble clic / menú contextual". Recommend: double-click as primary, no context menu in this PR (lower scope, easier to test). Confirm in spec phase.
3. **Display name re-pool after delete.** When a panel is removed, should its displayName be returned to the pool for reuse in the same workspace, or stay retired? Recommend: stay retired within the session (avoids surprise re-use), return to the pool only on full workspace reset. Confirm in spec phase.

## Review workload forecast

≈ 250 net LOC across 7 files (3 new, 4 modified). The two new modules are small and pure (`displayNamePool.js` ~40 lines, `panelDisplayName.js` ~60 lines). The manager changes are dominated by the `getPanelDisplayLabel` rewrite (~20 lines) and the double-click handler (~30 lines). Tests: ~100 lines across the two new test files + ~50 lines added to existing tests. Fits single PR well under the 400-line budget.

## Risk

- **Pool exhaustion.** The pool is 30 names. A workspace with 31+ panels wraps. The pool consumer should fall back to `Panel-{n}` past the pool end (i.e., `Panel-31`, `Panel-32`) so the UX degrades gracefully instead of throwing.
- **localStorage write storm.** Every rename writes to `localStorage` and (if option a in Open questions) to `data/panels.json`. The frontend only renames on explicit user action, so volume is low — no debounce needed.
- **Displayname leak across workspaces.** The persistence key is `devhub:panel-names:{workspaceId}` so workspaces do not collide. Test pins the isolation.
- **API contract drift.** Adding fields is non-breaking. The shape matches the spec hint `{ terminalId, displayName, program?, tuiReady? }`. Test pins the field set.
- **Case-insensitive lookup collision.** Two panels "Chase" and "chase" in the same workspace would both validate. Recommend: `nextDisplayName` is case-insensitive when computing uniqueness; storage key is lowercase; render uses the user-typed casing. Confirm in spec.

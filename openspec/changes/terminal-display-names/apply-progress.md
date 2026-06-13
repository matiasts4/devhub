# terminal-display-names — apply progress

**Branch:** `feature/terminal-renderer-xterm-webgl`
**Last update:** 2026-06-11 23:45

## Status
| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| T1 displayNamePool alphabetical | DONE | `64d95af` | pure module, alphabetical Alex-first |
| T2 Pool exhaustion → Panel-N | DONE | `60b4d12` | rate-limited warn |
| T3 panelDisplayName persistence | DONE | `dd33a10` (RED) + `daffb49` (GREEN) + `b989e6c` (SSR fix) | validator + Map + localStorage |
| T4 doc placeholder | DONE | n/a | covered by T3 tests |
| T5 panel state + migration | DONE | `d7bceb6` (RED) + `af31e5c` (GREEN) + `7e69f34` (fix) | useEffect hydrate assigns pool names |
| T6 UI rename flow | DONE | uncommitted | blur uses `editingValueRef`; dbl-click/Enter/Escape/blur tests green |
| T7 auto-assign on create | DONE | uncommitted | `createPanelWithDisplayName` at createDefaultWorkspaceState, buildWorkspaceColumnsForTerminalCount, spawnFirstTerminalPanelColumns |
| T8 API enrichment | PENDING | — | /api/terminal/processes + POST /api/panels/upsert + data/panels.json |
| T9 collision error UI | DONE | uncommitted | inline error via `renameError`; input reverts; editor stays open on collision |

## Files existing
- src/lib/terminal/displayNamePool.js ✓
- src/lib/terminal/displayNamePool.test.js ✓
- src/lib/terminal/panelDisplayName.js ✓
- src/lib/terminal/panelDisplayName.test.js ✓
- src/components/__tests__/TerminalWorkspacesManager.test.js ✓ (T5 migrate + T6 dbl-click describe)
- src/components/TerminalWorkspacesManager.jsx (modified, uncommitted)
- src/components/terminal/utils/panelHelpers.js (modified — spawnFirstTerminalPanelColumns accepts createPanel)
- src/components/__tests__/panelHelpers.test.js (modified, NOT staged)

## T6 changes (DONE)
In TerminalWorkspacesManager.jsx:
- getPanelDisplayLabel: panel.displayName || getDisplayName(panel.id, workspaceId) || P{index+1}
- useState: editingPanelId, editingValue, renameError
- onDoubleClick on tab → opens input
- onKeyDown Enter → setDisplayName → commit/cancel
- onKeyDown Escape → cancel
- onBlur → `onCommitRename?.(panel)` (no override; uses `editingValueRef.current`)
- aria-label + title reflect new name

## T7 changes (DONE)
In TerminalWorkspacesManager.jsx:
- `createPanelWithDisplayName(workspaceId)` — idempotent pool assign + `setPanelDisplayNameInStore`
- Wrapped at: `createDefaultWorkspaceState`, `buildWorkspaceColumnsForTerminalCount` (createWorkspaceWithTerminalCount), `spawnFirstTerminalPanelColumns` (handleSplit empty-ws path)
- `panelHelpers.spawnFirstTerminalPanelColumns` accepts optional `createPanel` fn

## T8 expected changes
- src/app/api/terminal/processes/route.js: read data/panels.json, enrich response
- src/app/api/panels/upsert/route.js: NEW, writes data/panels.json
- src/components/TerminalWorkspacesManager.jsx: writePanelsJson helper, call from rename/create
- data/panels.json: schema { panels: [{ id, displayName, workspaceId, updatedAt }] }

## T9 changes (DONE)
In TerminalWorkspacesManager.jsx:
- `renameError` state surfaces inline error span (`name-in-use` → "Name already in use in this workspace")
- on collision: revert input to previous name, keep editor open, localStorage unchanged

## Constraints
- DO NOT touch uncommitted files of other agents (see status section in delegation prompts)
- DO NOT touch Agente 2 (zedAnsiStrip, zedChat, zedTerminalResolver, terminal.exec/list/summarize, asistente/tools/terminal.js)
- DO NOT touch Agente 3 (pizarra/, PizarraCanvas)
- DO NOT touch Agente 4 (Ajustes, LLMProviderSettings, ui-shell-views, ProjectHub)
- DO NOT touch src/components/TerminalTTY.jsx, src/lib/terminal/terminalNoiseFilter.js (those are Agente 1 part 2 work)
- localStorage key: devhub:panel-names:{workspaceId}
- Validator: ^[a-zA-Z0-9_-]{1,24}$
- Case-insensitive collision
- Pool: alphabetical, 30 names, fallback Panel-N

## Test command
npm test -- --testPathPattern=displayNamePool|panelDisplayName|panelHelpers|TerminalWorkspacesManager

## TWM regression note (2026-06-11)
- Baseline (without display-name TWM diff): **17 failed**, 135 passed across TerminalWorkspacesManager suites
- With T6–T9 applied: **17 failed**, 136 passed (TerminalWorkspacesManager.test.js fully green)
- Remaining failures are pre-existing on branch (xterm-webgl renderer default, dock bounds %, split-layout handle class, panel-slot double-count DOM, pizarra visibility unmount, swarm binding fetch order) — not introduced by display-name work

## Post-completion
- Verify report in openspec/changes/terminal-display-names/verify-report.md
- Checkpoint comment with commit SHA
- Note to Agente 2 about { terminalId, displayName } shape

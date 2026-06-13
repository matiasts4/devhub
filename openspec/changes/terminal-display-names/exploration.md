# Exploration — terminal-display-names

**Date:** 2026-06-11
**Branch:** `feature/terminal-renderer-xterm-webgl`

Mission context: `docs/delegation/01-agent-terminales.md` — agent 1 must seed a "system of human names for panels (Chase, Nate, Cesar…)" and expose it via processes API.

---

## 1. Panel id/label shape — current state

### 1.1 The panel object (no `displayName` field)

`src/components/terminal/utils/panelHelpers.js:4-11` (the canonical panel factory):

```js
function createPanel(id, initialCommand = null, panelCwd = null, metadata = null) {
  return {
    id,
    initialCommand,
    cwd: panelCwd,
    swarmRole: metadata?.swarmRole || null,
  };
}
```

**Verified fields:** `id` (string, e.g. `"p1"`), `initialCommand` (string|null), `cwd` (string|null), `swarmRole` (object|null). **No `displayName` field.** No label field.

The normalized panel shape after `normalizeWorkspaceState` (panelHelpers.js:108-126):

```js
return {
  id: panelId,
  cwd: panel?.cwd || null,
  initialCommand: panel?.initialCommand || null,
  swarmRole: panel?.swarmRole || null,
};
```

Same four fields, no `displayName`. `normalizeWorkspaceState` does not consult any external label map.

### 1.2 The label rendering — literal "P{index+1}"

`src/components/TerminalWorkspacesManager.jsx:2910-2914`:

```js
const getPanelDisplayLabel = (ws, panelId) => {
  const flatPanels = ws.columns.flatMap((col) => col.panels);
  const index = flatPanels.findIndex((panel) => panel.id === panelId);
  return `P${index + 1}`;
};
```

This is the only function in the codebase that produces a user-facing panel label. It returns a positional label (`P1`, `P2`, `P3`…) and is called once at line 6183 when the panel is rendered into the workspace grid. `panelLabel` is then forwarded to `renderWorkspacePanel` (line 816) and used in `aria-label`/`title` attributes (lines 925, 930).

### 1.3 The semantic header (separate concern, not the tab title)

`src/components/TerminalWorkspacesManager.jsx:726-777` — `derivePanelSemanticMetadata(panel, agentRun)` builds an object with `source`, `primary`, `secondary`, `fullText`, optional `swarmRole`. It is **not** used to label the panel tab. It populates the swarm header badge inside the panel (`panel-semantic-primary` / `panel-semantic-secondary` data-testids at lines 894, 905) and an inbox badge. The `primary` is typically derived from `commandMetadata.primary` (line 727) or `swarmRole.label` — i.e. command-derived, not human-name-derived.

### 1.4 The workspace `displayName` (different thing — do not conflate)

`src/components/terminal/utils/panelHelpers.js:145-149` computes a `displayName` for the **workspace** (not the panel), reading `workspace_label` first and falling back to `name`. This is workspace-level only and has nothing to do with panel names.

### 1.5 Summary of the gap

| Surface | Source | Currently shows |
|---|---|---|
| Panel tab / `aria-label` | `getPanelDisplayLabel` (manager:2910) | `P1`, `P2`, … |
| Panel semantic header inside the panel | `derivePanelSemanticMetadata` (manager:726) | Command-derived (e.g. "OpenCode", "Builder 1") |
| Workspace tab | `displayName` in panelHelpers:145 | Workspace name + label override |

There is no name pool, no rename affordance, no persistence. The panel does not have a `displayName` field anywhere in the state tree.

---

## 2. localStorage keys inventory

`grep -n "devhub:\|devhub_" src/components/TerminalWorkspacesManager.jsx` (the file that owns persistence). Keys actually in use:

| Key | File:line | Purpose |
|---|---|---|
| `devhub_agent_runs` | manager.jsx:269, 653, 1830, 3560, 3702, 3809, 4286, 4308, 4399, 5053 | Agent run metadata keyed by `agent_id` |
| `devhub_agent_task_hints` | manager.jsx:3703 | Task hints per agent |
| `devhub_oc_terminated` | manager.jsx:4405, 4407 | OpenCode terminated-set |
| `devhub_terminal_state` | manager.jsx:1402, 1473, 1577, 1661, 1720 (legacy) | Legacy terminal state (legacy fallback only — current `terminalStateStorageKey` is used) |
| `terminalStateStorageKey` (variable) | manager.jsx:1402, 1473, 1577, 1661, 1720, 5325, 5343, 5405, 5417 | Current canonical key (its value is computed at the top of the file; not in the devhub: namespace) |
| `devhub_terminal_maximized` | manager.jsx:1307, 1458 | Maximize toggle |
| `getSwarmSnapshotStorageKey(projectId)` | manager.jsx:408, 1317, 1329, 1363 | Swarm snapshot per project |
| `restoreManifestStorageKey` | manager.jsx:1607 | Restore manifest |

`grep -rn "devhub:panel-names\|devhub:panelNames\|displayNamePool\|panelDisplayName" src/` → **zero matches**. The key from the delegation prompt's design hint (`devhub:panel-names:{workspaceId}`) is unused.

The component writes to `localStorage` on terminal state changes (manager.jsx:1577, 1661, 1720, 2693, 5405) — a persistence path exists. No schema migration helper is present.

---

## 3. /api/terminal/processes — current payload

`src/app/api/terminal/processes/route.js` (full file, 93 lines).

### 3.1 GET response shape

`GET` (lines 28-67) returns `{ processes: Array<...> }`. The shape of each entry varies by source:

**Sidecar PTYs** (lines 16-22, from `readSidecarSessions`):
```js
{
  terminalId: s.id,         // string
  type: 'sidecar',
  cwd: s.cwd || null,       // string|null
  createdAt: s.createdAt || null,  // string|null
  clients: s.clients || 0,  // number
}
```

**Local ttyServer PTYs** (lines 50-58):
```js
{
  terminalId: s.id,                // string
  sessionId: s.opencodeSessionId || null,  // string|null
  type: s.type || 'pty',
  cwd: s.cwd || null,
  shell: s.shell || null,
  createdAt: s.createdAt || null,
}
```

**Both branches** are missing the `displayName` field the delegation prompt says to expose ("API shape: `{ terminalId, displayName, program?, tuiReady? }`").

### 3.2 POST (line 69-92) closes a ttyServer session by `terminalId`. No rename endpoint.

The route does not import the panel state, the workspace state, or any localStorage helpers. The session data is sourced from the running sidecar (`/sessions` JSON over HTTP) and the in-memory ttyServer (`getAllActiveSessions()`). **A `displayName` is not part of any existing session representation in either backend.**

### 3.3 No back-reference to the workspace/panel state

The sidecar sessions and ttyServer sessions do not carry `workspaceId` or `panelId`. The mapping `terminalId → panel → workspace` lives only in the frontend's React state. The API would have to either:
- Accept that `displayName` is computed server-side from a per-workspace JSON file (parity with how the frontend currently persists), or
- Have the frontend enrich the response by joining against its local panel state, or
- Have the sidecar / ttyServer store the displayName alongside the session and return it.

The current architecture has **no back-channel** for the frontend to push a displayName into a sidecar/ttyServer session.

---

## 4. Existing rename UI affordances — none

`grep -n "rename\|onDblClick\|onContextMenu" src/components/TerminalWorkspacesManager.jsx` (panel render path):
- `onContextMenu` is registered on the body root for the editor, not per panel.
- `onDblClick` is not used on any panel element.
- `onClick` on the tab bar switches panels (line 846) but does not enter rename mode.

The closest affordance is a right-click context menu on the terminal viewport itself (`src/components/TerminalTTY.jsx:4239-4244`, `handleContextMenu`) which offers **copy / paste**, not rename. There is no double-click → inline edit, no three-dot menu, no rename button.

The terminal panel header has buttons for split-right, split-down, focus, close (`panel-split-right`, `panel-split-down`, `panel-focus`, `panel-close` data-testids at lines 943/957/971/989) and the semantic metadata line. **No rename affordance exists.**

---

## 5. NFR-T0X coverage table

| Req | Status | Evidence |
|-----|--------|----------|
| FR-T04 (every visible terminal has a human name) | ❌ missing | Panel object has no `displayName` (panelHelpers.js:4-11). `getPanelDisplayLabel` (manager:2910) returns `P{index+1}`. |
| FR-T05 (name unique per workspace, persisted, visible in tab) | ❌ missing | No uniqueness check, no persistence, the tab shows `P{n}` only. |
| FR-T06 (auto-assign from pool on creation) | ❌ missing | `createPanel` (panelHelpers.js:4) takes no name argument. Pool does not exist. |
| FR-T07 (rename via double-click or context menu) | ❌ missing | No rename UI exists. The terminal viewport's right-click menu is copy/paste only (TerminalTTY.jsx:4239). |
| NFR-T04 (max 24 chars, `[a-zA-Z0-9_-]`, case-insensitive lookup) | ❌ missing | No validator, no lookup function, no regex anywhere in the branch. |
| NFR-T05 (pool of ~30 names) | ❌ missing | No file exports a name pool. `grep -rn "Chase\|Nate\|displayNamePool" src/` returns no matches. |
| NFR-T06 (webgl/canvas split, no crash) | 🟡 partial (out of name scope) | `shouldReleaseWebglRendererOnLayoutHide` (TerminalTTY.jsx:1018), `releaseWebglAddonForInactivePanel` (2156). Not specifically about rename flow. |
| NFR-T07 (TDD mandatory) | — (no tests exist for the missing feature) | New tests must be written before implementation. |

---

## 6. Existing tests — inventory

`grep -rn "displayName\|panelDisplayName\|displayNamePool\|panelNames\|renamePanel" src/components/__tests__ src/lib/__tests__ tests/`:

- `src/components/pizarra/__tests__/PizarraCanvas.wheel.test.jsx:93,97` — `Layer.displayName = 'Layer'` and `Stage.displayName = 'Stage'` (React `displayName` for the mocked components, not the panel feature).
- `src/hooks/useAgentRegistryPolling.test.js:61,136,214,296,304,374` — `agent._displayName` is a property on agent run records, completely unrelated to terminal panel naming. Set in `src/hooks/useAgentRegistryPolling.js:99` as `run.taskTitle || run.promptSummary`.
- UI primitive files (`src/components/ui/*`) — every component sets `.displayName = "..."` for React DevTools. None are the panel feature.

**Conclusion:** zero tests cover panel displayName, label, or rename. The TDD-first approach means all tests in the apply phase are new.

---

## 7. Open questions (for propose phase)

1. **Where does the displayName live?** Options:
   - (a) On the panel object itself (`panel.displayName`) — simplest, persists with `devhub_terminal_state` if added to the serialized payload.
   - (b) Separate localStorage map keyed by `workspaceId:panelId` — allows the panel's `id` (a stable `p{n}`) to remain and displayName to be a presentation concern.
   - The delegation prompt suggests `devhub:panel-names:{workspaceId}` (option b). Option a is more idiomatic React state but couples the panel schema.
2. **How is the displayName exposed in the processes API?** The sidecar and ttyServer do not store displayName. Three paths:
   - Frontend enriches the GET response client-side (no API change).
   - Frontend pushes a PATCH endpoint that sidecar/ttyServer honor (requires backend changes).
   - Persist displayName in a server-readable JSON file the API reads (the route already writes to `data/logs/...` — adding `data/panels.json` is small).
3. **Uniqueness is per-workspace or global?** The delegation prompt says "Nombre único por workspace" (per-workspace). Pool consumption order is then per-workspace. Reassigning after deletion is a separate question.
4. **Name validation UX:** What happens on invalid input? Trim, lowercase, reject empty, fall back to pool name, or surface a warning? The NFR-T04 regex is unambiguous but the UX is not.
5. **Migration:** Existing panels (no displayName) — auto-assign on first render? Or wait for a manual rename? The prompt says "Al crear terminal, asignar nombre del pool automáticamente" — that covers new panels, not legacy ones.

---

## 8. Files in scope for apply phase (per delegation prompt)

- `src/lib/terminal/displayNamePool.js` (new) — pool + validator + assigner.
- `src/lib/terminal/panelDisplayName.js` (new) — per-workspace state shape + persistence helpers.
- `src/components/terminal/**` — context provider for the name map (or hook into the existing workspaces manager state).
- `src/components/TerminalWorkspacesManager.jsx` — read displayName in `getPanelDisplayLabel`; wire rename UI into the panel header; persist.
- `src/app/api/terminal/processes/route.js` — add `displayName` field (frontend-enriched if the backend has no source).
- Tests for each.

Out of scope: `src/lib/asistente/**` (Agent 2), `src/lib/agentLaunchWrapper.js` (Agent 1 is told not to rewrite, only to keep the existing bootstrap gate stable), `src/components/pizarra/**` (Agent 3), `src/app/globals.css` (Agent 4), swarm Phase 1 perf.

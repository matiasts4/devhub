# Design: session-workspace-restore

## Technical Approach

Add a three-class session taxonomy (pty-durable, opencode-durable, shell-ephemeral) to sessionStore.js and teach restoreSessions() in ttyServer.js to respawn shell-ephemeral sessions from saved cwd/shell without requiring a PTY PID. A devhub_restore_in_progress localStorage mutex coordinates backend restore completion before the React startup coordinator dispatches relaunch actions. A new RESTORE_SHELL_EMERGENT coordinator action handles ephemeral dispatch. semanticMetadata.js derives workspace_label from swarmRole/swarmId and panelHelpers.js uses it before falling back to workspace.name. **CRITICAL ADDITION**: Terminal identity state must be cleaned from localStorage on workspace close, panel ID counters must be randomized to prevent stale rebinding, and restore binding must require explicit validity confirmation.

## Architecture Decisions

| Decision                      | Choice                                                                                                | Alternatives                                       | Rationale                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| Session taxonomy              | sessionType field on saved session objects                                                            | Separate store per type, class-tagged JSON wrapper | Minimal schema change; backwards-compatible      |
| Schema versioning             | version: 2 in JSON root, sessionType per session                                                      | Version per field, implicit migration              | Enables one-time migration on load               |
| Shell-ephemeral restore       | createSession() with cwd/shell/title in restoreSessions()                                             | Separate spawnShellEphemeral() path                | Reuses existing session creation pipeline        |
| Mutex timing                  | TTY server sets BEFORE restore, clears AFTER                                                          | React sets it, TTY clears                          | React mounts after TTY server sync startup       |
| RESTORE_SHELL_EMERGENT action | New action in startupRestoreCoordinator.js                                                            | Reuse RESUME_OPENCODE_SESSION                      | Distinct semantic; keeps action space stable     |
| Semantic label storage        | Write sessionType/swarmRole/swarmId into existing devhub_swarm_control_snapshot and devhub_agent_runs | New snapshot key                                   | Already durable                                  |
| Workspace-close unbinding     | Delete devhub_agent_runs for all panel IDs in workspace before React state removal                    | Only clean on startup                              | Immediate isolation; prevents same-session bleed |
| Panel ID collision avoidance  | Randomize panelCounterRef to [1000,10000] on first workspace init                                     | Scope-aware counters, namespacing                  | Salted counters prevent stale entry collision    |
| Restore binding validity      | Validate agentRun against runtimeSnapshot before applying semantic label                              | Always apply, retract on mismatch                  | Two-step validation: presence + active status    |

## Data Flow

### Terminal identity cleanup on workspace close

```
removeWorkspace(wsId)
  → getAllPanelIds(workspaceToRemove.columns)      [all panel IDs in workspace]
  → readAgentRuns(storage)                          [full devhub_agent_runs map]
  → Object.entries(runs).filter(([k,v]) => panelIds.includes(v.panelId))
  → delete runs[taskId] for each match             [OR: filter devhub_agent_runs]
  → storage.setItem('devhub_agent_runs', JSON.stringify(cleanRuns))
  → THEN: closeTerminalSessions(panelIds)          [ Pty sessions closed after cleanup ]
  → THEN: React state removal proceeds
```

**Key invariant**: Cleanup MUST happen before React state removal. If React state is removed first, a new `addWorkspace` could reuse the same panel IDs before cleanup runs, causing a race.

### Panel ID randomization on first workspace init

```
App startup
  → panelCounterRef = Math.floor(Math.random() * 9001) + 1000
  → colCounterRef = Math.floor(Math.random() * 9001) + 1000
  → wsCounterRef = Math.floor(Math.random() * 9001) + 1000
  → Workspace 1 created with panel IDs p{N+1}, p{N+2}, ...
  → Stale devhub_agent_runs entries (p1, p2, p3) never collide with live panels
```

### Restore binding truth vs display naming truth

```
Restore binding truth (where session identity is verified)
├── sessionStore.js (terminal-sessions.json)
│   └── sessionType, ptyPid/opencodeSessionId/cwd+shell
│       └── loadSessions() filters stale via TTL
│       └── restoreSessions() branches on sessionType
│
Display naming truth (where agent identity is read for UI)
├── devhub_agent_runs localStorage
│   └── Per panelId: runId, agentRunId, swarmRole, swarmId, taskTitle, selectedAgent
│       └── readAgentRunsByPanel(storage) → indexed by panelId
│       └── buildRestoreManifestFromWorkspaceState() → agentRunsByPanel passed in
│
Semantic label derivation (consumes both sources)
├── semanticMetadata.js: deriveWorkspaceLabel(workspace)
│   └── workspace.swarmRole → swarm-primary/swarm-coder/etc.
│   └── Falls back to workspace.name
│
├── semanticMetadata.js: derivePanelSemanticMetadata(panel, agentRun)
│   └── agentRun present + active → derive from agentRun (director/coder label)
│   └── agentRun missing or stale → fall back to command-derived label
│
└── panelHelpers.js: normalizeWorkspaceState() — does NOT consume devhub_agent_runs
    └── Renumbers panel IDs for uniqueness, no semantic binding
```

### Restore mutex interaction with workspace hydration

```
Backend (ttyServer.js)
  restoreSessions() begins
    → localStorage.setItem('devhub_restore_in_progress', 'true')
    → restore pty-durable sessions (process.kill check)
    → restore shell-ephemeral sessions (createSession cwd/shell)
    → localStorage.removeItem('devhub_restore_in_progress')

Frontend (TerminalWorkspacesManager.jsx)
  useEffect on mount
    → const inProgress = storage.getItem('devhub_restore_in_progress')
    → if (inProgress) { queue relaunch; do not dispatch }
    → else { dispatch devhub:relaunch-panel for each RESTORE_SHELL_EMERGENT }
```

### Session classification and restore branching

```
loadSessions()
  → readPersistedSessionsFile()
  → filter by TTL (7 days)
  → migrate sessionType-less sessions (version < 2 → reclassify)
  → return fresh sessions with restored: true

restoreSessions(saved)
  → for each session s:
      if s.sessionType === 'opencode-durable': continue  // React handles via opencode --session
      if s.sessionType === 'pty-durable':
          → process.kill(s.ptyPid, 0) ? createSession() : skip
      if s.sessionType === 'shell-ephemeral':
          → createSession({ id, cwd, shell, restored: true })  // NO ptyPid check
```

## File Changes

| File                                                | Action | Description                                                                                                                                                                                                                                                                 |
| --------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/terminal/sessionStore.js`                  | Modify | Add sessionType, version:2, opencodeSessionId, initialCommand, swarmRole, swarmId. Migration for sessionType-less sessions on load. Classify on save.                                                                                                                       |
| `src/lib/terminal/ttyServer.js`                     | Modify | In restoreSessions(): branch on sessionType instead of ptyPid gate. Set devhub_restore_in_progress before restore, clear after.                                                                                                                                             |
| `src/lib/terminal/startupRestoreCoordinator.js`     | Modify | Add RESTORE_SHELL_EMERGENT to RESTORE_ACTION enum. buildStartupRestorePlan() emits RESTORE_SHELL_EMERGENT for shell-ephemeral entries.                                                                                                                                      |
| `src/components/TerminalWorkspacesManager.jsx`      | Modify | (1) Startup: randomize panelCounterRef/colCounterRef/wsCounterRef to [1000,10000]. (2) removeWorkspace: clean devhub_agent_runs for all panel IDs BEFORE state removal. (3) Startup restore useEffect reads devhub_restore_in_progress; queues relaunch until flag cleared. |
| `src/components/terminal/utils/semanticMetadata.js` | Modify | Add deriveWorkspaceLabel(workspace) returning workspace_label. Add readWorkspaceLabel(panel,agentRun).                                                                                                                                                                      |
| `src/components/terminal/utils/panelHelpers.js`     | Modify | normalizeWorkspaceState() does not consume devhub_agent_runs; renumbers for uniqueness only.                                                                                                                                                                                |
| `src/views/SwarmControl.jsx`                        | Modify | Snapshot write includes sessionType, swarmRole, swarmId per agent run. No new storage key.                                                                                                                                                                                  |
| `src/lib/terminal/restoreManifest.js`               | Modify | Add sessionType to normalizeTerminalSessionRecord(). Add workspace_label to workspace records.                                                                                                                                                                              |

**New Test Files:**

- `src/lib/terminal/sessionStore.migration.test.js`: Schema migration v1-v2; classify sessions; TTL eviction.
- `src/lib/terminal/ttyServer.restoreEphemeral.test.js`: restoreSessions() all 3 session types; mutex flag lifecycle.
- `src/lib/terminal/startupRestoreCoordinator.shellEphemeral.test.js`: buildStartupRestorePlan() emits RESTORE_SHELL_EMERGENT.
- `src/components/__tests__/TerminalWorkspacesManager.mutexRestore.test.jsx`: relaunch blocked while flag set; unblocked after clear.
- `src/components/__tests__/TerminalWorkspacesManager.staleIdentity.test.jsx`: **[NEW — stale identity regression]** First and second new workspaces after swarm close show no director/coder label. Verifies TIC-S1, TIC-S2, TIC-S5.
- `src/components/__tests__/panelCounter.randomized.test.js`: Panel counter initialized to random high value; new panels do not collide with stale devhub_agent_runs entries.

## Interfaces / Contracts

### sessionStore.js enriched schema

sessionType values: pty-durable | opencode-durable | shell-ephemeral
New per-session fields: opencodeSessionId (null if ephemeral), initialCommand (set for ephemeral), swarmRole, swarmId
Version bump: version: 1 -> version: 2

### ttyServer.js restoreSessions() branching

```javascript
for (const s of saved) {
  if (s.sessionType === 'opencode-durable') {
    continue;
  } // React handles
  if (s.sessionType === 'pty-durable') {
    // existing: process.kill(s.ptyPid, 0), createSession()
  }
  if (s.sessionType === 'shell-ephemeral') {
    // NO process.kill() call
    createSession({ id: s.id, cwd: s.cwd, shell: s.shell, restored: true });
  }
}
```

### startupRestoreCoordinator.js new action

RESTORE_SHELL_EMERGENT: 'restore-shell-emergent'
buildStartupRestorePlan() branches: !runtimeTerminal && session.sessionType==='shell-ephemeral' -> RESTORE_SHELL_EMERGENT

### semanticMetadata.js label derivation

```javascript
function deriveWorkspaceLabel(workspace) {
  if (workspace?.swarmRole) return `swarm-${workspace.swarmRole}`;
  if (workspace?.swarmId) return `swarm-${workspace.swarmId}`;
  return workspace?.name || 'Workspace';
}
```

### TIC-1: Workspace close unbinding (TerminalWorkspacesManager.jsx removeWorkspace)

```javascript
const removeWorkspace = async (e, idToRemove) => {
  e.stopPropagation();
  const workspaceToRemove = workspaces.find((workspace) => workspace.id === idToRemove);
  if (!workspaceToRemove || workspaces.length <= 1) return;

  // STEP 1: Clean devhub_agent_runs BEFORE anything else
  const panelIdsToClean = getAllPanelIds(workspaceToRemove.columns);
  try {
    const runs = readAgentRuns(storage);
    const cleanedRuns = {};
    Object.entries(runs).forEach(([taskId, run]) => {
      if (!panelIdsToClean.includes(run.panelId)) {
        cleanedRuns[taskId] = run;
      }
    });
    storage.setItem('devhub_agent_runs', JSON.stringify(cleanedRuns));
  } catch { /* localStorage failure */ }

  // STEP 2: Close terminal sessions (PTY)
  await closeTerminalSessions(panelIdsToClean);
  await new Promise((resolve) => setTimeout(resolve, 200));
  await closeWorkspaceBrowserWindow(idToRemove);

  // STEP 3: Remove React state
  setWorkspaces((prev) => { ... });
  // ... rest of state cleanup
};
```

### TIC-2: Panel counter randomization

```javascript
// On first workspace creation or app init:
const RANDOMIZE_TO_HIGH = () => Math.floor(Math.random() * 9001) + 1000;

useEffect(() => {
  if (workspaces.length === 0) return;
  // Only randomize once per session when first workspace appears
  if (panelCounterRef.current <= 100) {
    panelCounterRef.current = RANDOMIZE_TO_HIGH();
    colCounterRef.current = RANDOMIZE_TO_HIGH();
    wsCounterRef.current = RANDOMIZE_TO_HIGH();
  }
}, [workspaces.length]);
```

### TIC-3: Restore binding requires explicit valid binding

```javascript
// In buildStartupRestorePlan — only include agent runs whose panelId
// still exists in the current workspace manifest
const activePanelIds = new Set(normalizedManifest.terminalSessions.map((s) => s.terminalId));
const validAgentRuns = {};
Object.entries(agentRunsByPanel).forEach(([panelId, run]) => {
  if (activePanelIds.has(panelId)) {
    validAgentRuns[panelId] = run; // only if panel is in current workspaces
  }
  // else: orphaned — do NOT include; TIC-S5 satisfied
});
```

## Testing Strategy

| Layer              | What to Test                                                                                | Approach                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Unit               | sessionStore.js classification + migration (sessionStore.migration.test.js)                 | Test v1→v2 migration, sessionType assignment                                                           |
| Unit               | restoreSessions() branching (ttyServer.restoreEphemeral.test.js)                            | Mock process.kill; verify shell-ephemeral skips it                                                     |
| Unit               | buildStartupRestorePlan() action emit (startupRestoreCoordinator.shellEphemeral.test.js)    | Verify RESTORE_SHELL_EMERGENT emitted                                                                  |
| Unit               | deriveWorkspaceLabel() pure function tests                                                  | Snake_case outputs for swarmRole cases                                                                 |
| Integration        | TTY restore sets/clears devhub_restore_in_progress                                          | Check localStorage before/after                                                                        |
| Integration        | TerminalWorkspacesManager mutex guard (mutexRestore.test.jsx)                               | Block/unblock relaunch dispatch                                                                        |
| **E2E regression** | **TIC-S1/TIC-S2: First and second new workspaces after swarm close show NO stale identity** | Playwright: open swarm, close it, create ws1, verify no director/coder label; create ws2, verify clean |
| **E2E regression** | **TIC-S5: New panel with same ID as stale entry does not inherit label**                    | Playwright: manually create devhub_agent_runs:p5 with stale data, create new panel p5, verify no label |
| Unit               | Panel counter randomized (panelCounter.randomized.test.js)                                  | Verify counter > 1000 after init                                                                       |
| Integration        | removeWorkspace cleans devhub_agent_runs (staleIdentity.test.jsx)                           | Mock storage; call removeWorkspace; verify runs cleaned                                                |

## Migration / Rollout

No feature flags needed. Existing sessions without sessionType are reclassified on first load and version bumped to 2. RESTORE_SHELL_EMERGENT ignored by older React builds.

Rollback: revert sessionStore.js to version:1, restore ptyPid gate in ttyServer.js, remove RESTORE_SHELL_EMERGENT, remove mutex logic, remove TIC-1/TIC-2/TIC-3 changes in TerminalWorkspacesManager.jsx.

## Open Questions

- workspace_label vs workspaceLabel field name: spec says workspace_label (snake) but codebase uses camelCase. Confirm: snake in JSON, camel in-memory.
- shell-ephemeral session ID collision: worth a defensive sessions.has(id) check before overwrite in createSession().
- Snapshot sessionType: verify composeControlRoomSnapshot accepts new per-session sessionType field without modification.
- Stale agent run cleanup: verify readAgentRuns() handles empty/malformed devhub_agent_runs gracefully (already has try/catch in semanticMetadata.js but check in removeWorkspace path too).

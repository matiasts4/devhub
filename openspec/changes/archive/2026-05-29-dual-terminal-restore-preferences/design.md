# Design: dual-terminal-restore-preferences — PR #1

## Technical Approach

Implement per-session-type restore policies with independent mutex keys. Sessions get a `restorePolicy` field (`auto | manual | off`). Generic terminal restore (backend `ttyServer.js`) uses `devhub_generic_restore_in_progress`; OpenCode restore (React `startupRestoreCoordinator`) uses `devhub_opencode_restore_in_progress`. Manual sessions skip respawn and their panels render a suspended placeholder. New `restorePreferences.js` module manages workspace-level defaults in localStorage per project.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Preferences storage | localStorage key `devhub_terminal_restore_preferences:{projectId}` | Matches existing localStorage pattern (`terminalStateStorageKey` uses same `{projectId}` suffix); no new backend deps |
| Schema version bump | v2 → v3 in `sessionStore.js` | Versioned file on disk; bumping avoids silent migration failure on downgrade |
| `restorePolicy` default on v2 migration | `auto` | Existing sessions must not change behavior; spec SESS-S10 requires this |
| Dual mutex implementation | Two localStorage keys replaced in both `ttyServer.js` AND `TerminalWorkspacesManager.jsx` | Backend (`ttyServer.js`) sets generic key; React sets opencode key; each clears its own; they never conflict |
| `buildStartupRestorePlan` change | Accept sessions-with-policy from `TerminalWorkspacesManager`, evaluate `restorePolicy === 'manual'` before emitting `RESUME_OPENCODE_SESSION` | Gating at plan-build time keeps action semantics clean; `manual` → `TERMINATED`, `off` → no action |
| Suspended state wiring | `TerminalTTY` accepts `connectionState === 'suspended'` prop; no WS, no xterm boot | Minimal surface — `suspended` only set via explicit prop from parent for PR #1 |

## Data Flow

```
App startup
  ├─ TerminalWorkspacesManager loads workspaces from localStorage
  ├─ startupRestoreCoordinator.buildStartupRestorePlan()
  │    ├─ For each manifest terminalSession:
  │    │    ├─ session.restorePolicy === 'auto' → emit RESUME_OPENCODE_SESSION / RESTORE_SHELL_EMERGENT
  │    │    ├─ session.restorePolicy === 'manual' → emit TERMINATED (no dispatch)
  │    │    └─ session.restorePolicy === 'off' → no action
  │    └─ For RESUME_OPENCODE_SESSION: check devhub_opencode_restore_in_progress mutex
  ├─ ttyServer.restoreSessions() (backend)
  │    ├─ Sets devhub_generic_restore_in_progress = 'true'
  │    ├─ Skips opencode-durable (React handles)
  │    ├─ Restores pty-durable (process.kill(pid,0) check) and shell-ephemeral
  │    └─ Clears devhub_generic_restore_in_progress on finish
  └─ TerminalWorkspacesManager: opencode panels with TERMINATED action → connectionState='suspended'
       └─ TerminalTTY renders suspended overlay (no WS, no xterm)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/terminal/restorePreferences.js` | **Create** | `readTerminalRestorePreferences`, `writeTerminalRestorePreferences`, `sanitizeRestorePreferences`; enum `RESTORE_POLICY = { AUTO, MANUAL, OFF }` |
| `src/lib/terminal/sessionStore.js` | Modify | Bump version 2→3; `saveSessions` writes `restorePolicy`; `loadSessions` migration: missing `restorePolicy` → `'auto'` |
| `src/lib/terminal/startupRestoreCoordinator.js` | Modify | `buildStartupRestorePlan` takes optional per-session `restorePolicy` arg; `manual` → `TERMINATED`, `off` → skipped |
| `src/lib/terminal/ttyServer.js` | Modify | Replace `devhub_restore_in_progress` with `devhub_generic_restore_in_progress` (lines 974–991) |
| `src/components/TerminalTTY.jsx` | Modify | Add `connectionState === 'suspended'` branch: no WS connect, no xterm boot; render suspended placeholder overlay with "Continuar" button stub (logs) |
| `src/components/TerminalWorkspacesManager.jsx` | Modify | Read/write restore preferences; check `devhub_opencode_restore_in_progress` mutex before dispatch; pass `restorePolicy` to plan builder |
| `src/views/Ajustes.jsx` | Modify | Add "Preferencias de restore" section in `prefs` tab: two radio groups (OpenCode, Terminal genérico), each `auto \| manual \| off` |

## Interfaces / Contracts

```typescript
// restorePreferences.js
export const RESTORE_POLICY = Object.freeze({ AUTO: 'auto', MANUAL: 'manual', OFF: 'off' });
export function readTerminalRestorePreferences(projectId: string): { opencode: string, generic: string }
export function writeTerminalRestorePreferences(projectId: string, prefs: { opencode?: string, generic?: string }): void

// sessionStore.js — v3 schema additions
interface SessionV3 {
  id: string;
  restorePolicy: 'auto' | 'manual' | 'off';  // NEW in v3
  sessionType: 'pty-durable' | 'opencode-durable' | 'shell-ephemeral';
  // ... other existing fields
}

// startupRestoreCoordinator.js — action added
RESTORE_ACTION.TERMINATED  // panel stays suspended (no relaunch)
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `sanitizeRestorePreferences`: invalid enum → `'auto'`, unknown key → dropped, partial write → merged | `describe/expect` with `beforeEach` localStorage stub |
| Unit | `loadSessions` migration: v2 session gets `restorePolicy: 'auto'`, v3 passthrough | Mock `fs.readFileSync` with JSON fixtures |
| Unit | `buildStartupRestorePlan`: `manual` session → `TERMINATED` action, `off` session → no action | Pure function test with manifest fixture |
| Unit | `ttyServer.js` mutex key: `devhub_generic_restore_in_progress` NOT `devhub_restore_in_progress` | Grep + integration test stub |
| Integration | Full startup flow: two sessions (opencode manual, shell auto) → correct actions emitted | Mock runtimeSnapshot + storage |
| E2E | Ajustes → prefs tab: change OpenCode to `manual` → localStorage updated | Playwright `userEvent` click + `expect(localStorage.getItem(...))` |

**New test files:**
- `src/lib/terminal/__tests__/restorePreferences.test.js` — unit
- `src/lib/terminal/__tests__/sessionStore.migration.test.js` — v2→v3 migration
- `src/lib/terminal/__tests__/startupRestoreCoordinator.restorePolicy.test.js` — policy gating

## Migration / Rollback

**Migration**: No live data migration required. `loadSessions` applies defaults on every startup. Existing sessions without `restorePolicy` get `'auto'`.

**Rollback** (if needed):
1. Revert `sessionStore.js` version to 2, remove `restorePolicy` from `saveSessions` output
2. Delete `restorePreferences.js`
3. Replace dual mutex keys back to single `devhub_restore_in_progress` in both files
4. Remove `suspended` branch from `TerminalTTY.jsx`
5. Remove restore section from `Ajustes.jsx`
6. Clear both new localStorage keys on startup as cleanup

## Open Questions

- [ ] `sessionStore.js` version field is in the JSON (`{ version: 2, sessions: [] }`). Should it be `SCHEMA_VERSION = 3` constant for clarity, or keep as inline number?
- [ ] `TerminalWorkspacesManager` currently reads `devhub_restore_in_progress` once. For robustness, should it poll this key like the existing poll loop for the single-key case? The dual-key case should be race-free since each side only clears its own key, but a poll is cheap and defensive.
- [ ] PR #2 deferred scope: will the `TerminalSettingsModal` be a new file or inline in `Ajustes.jsx`? Same for the centered CTA in the suspended panel. Confirm before PR #1 lands so the `gear icon` stub in TPS-S5 has a stable signal name.
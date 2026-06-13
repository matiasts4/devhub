# Proposal: dual-terminal-restore-preferences

## Intent

DevHub currently has a single shared restore mutex and no per-terminal-type restore policy. Users with many OpenCode sessions experience RAM pressure on restart because all sessions attempt to relaunch simultaneously. Meanwhile, generic terminal sessions have completely separate restore mechanics (PTY verification + respawn). This change adds independent restore preferences and manual-reveal UX so OpenCode and generic terminals each restore on their own terms, with explicit user control per-type.

## Scope

### In Scope
- Per-session `restorePolicy` field (`auto | manual | off`) on saved sessions in `~/.devhub/terminal-sessions.json`
- New `restorePreferences.js` module: read/write/normalize for project-scoped localStorage preferences
- `startupRestoreCoordinator.js` updated: evaluate `restorePolicy` per session type before dispatching actions
- Two independent mutex keys: `devhub_opencode_restore_in_progress` and `devhub_generic_restore_in_progress`
- Session store schema bump: version 2 → 3; existing sessions default to `restorePolicy: 'auto'`
- Terminal restore preferences section added to `Ajustes.jsx` (Preferencias tab)
- Suspended-panel placeholder state in `TerminalTTY` (visual only, no respawn dispatch)

### Out of Scope
- Full `TerminalSettingsModal` triggered from terminal top bar (deferred to follow-up PR)
- Centered "Continuar sesión" CTA inside suspended panel (deferred to follow-up PR)
- Per-panel policy override UI (workspace-level defaults only in this PR)
- Changes to `classifySession()` behavior

## Capabilities

### New Capabilities
- `terminal-restore-preferences`: Project-scoped localStorage module managing independent `opencode` and `generic` restore policies (`auto | manual | off`). Surfaces in `Ajustes.jsx` Preferencias tab. Reads/writes via `readTerminalRestorePreferences` / `writeTerminalRestorePreferences`.
- `session-restore-policy`: `restorePolicy: 'auto' | 'manual' | 'off'` field on each saved session in `sessionStore.js` v3 schema. Backend `ttyServer.js` skips `opencode-durable` sessions per current behavior; React `startupRestoreCoordinator` gates `RESUME_OPENCODE_SESSION` dispatch on `restorePolicy === 'auto'`.

### Modified Capabilities
- `session-restore`: Add `restorePolicy` field; dual mutex keys replace single `devhub_restore_in_progress`; per-session policy evaluation in `buildStartupRestorePlan()`.

## Approach

1. **New `restorePreferences.js`**: Project-scoped localStorage key `devhub_terminal_restore_preferences:{projectId}`. Enum `RESTORE_POLICY = { AUTO, MANUAL, OFF }`. Functions: `readTerminalRestorePreferences`, `writeTerminalRestorePreferences`, `sanitizeRestorePreferences`.

2. **Schema v3 in `sessionStore.js`**: Add `restorePolicy` to saved sessions. `loadSessions()` applies migration: sessions without `restorePolicy` get `restorePolicy: 'auto'`. `saveSessions()` persists the field.

3. **Dual mutex**: Replace single `devhub_restore_in_progress` with two keys. Generic restore (backend in `ttyServer.js`) uses `devhub_generic_restore_in_progress`. OpenCode restore (React in `startupRestoreCoordinator`) uses `devhub_opencode_restore_in_progress`.

4. **Policy gate in `buildStartupRestorePlan()`**: When `sessionType === 'opencode-durable'` AND `restorePolicy === 'manual'`, emit `TERMINATED` action (panel stays suspended). When `sessionType === 'shell-ephemeral'` AND `restorePolicy === 'manual'`, same. Auto sessions proceed normally.

5. **Ajustes tab**: New "Preferencias de restore" section in `Ajustes.jsx` with two radio-button groups — one for OpenCode, one for Generic Terminal — each with `auto | manual | off` options.

6. **Suspended state in `TerminalTTY`**: New `connectionState === 'suspended'` renders a placeholder overlay with session title and a "Continuar" button stub (button logs for now, full dispatch wired in follow-up PR).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/terminal/sessionStore.js` | Modified | Schema v3: add `restorePolicy` field; `loadSessions` migration |
| `src/lib/terminal/restorePreferences.js` | **New** | Preferences module with read/write/sanitize |
| `src/lib/terminal/startupRestoreCoordinator.js` | Modified | Dual mutex keys; policy gate before RESUME_OPENCODE_SESSION dispatch |
| `src/lib/terminal/ttyServer.js` | Modified | Use `devhub_generic_restore_in_progress` mutex |
| `src/components/TerminalTTY.jsx` | Modified | Add `suspended` connectionState + placeholder overlay |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Read/write restore preferences |
| `src/views/Ajustes.jsx` | Modified | Add terminal restore preferences section |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Schema migration corrupts existing sessions | Low | v3 migration: default missing `restorePolicy` to `'auto'`; corrupted JSON falls back to `[]` |
| Dual mutex race condition | Med | Each type's mutex is independent; backend clears its own key; React clears its own |
| Suspended panel placeholder breaks existing UX | Low | `suspended` state only activated when `restorePolicy === 'manual'`; existing users on `auto` see no change |
| Budget overrun (800 lines) | Med | Modal and CTA deferred to PR #2; this PR covers plumbing + Ajustes tab only |

## Rollback Plan

1. Revert `sessionStore.js` version to 2 — existing sessions reload without `restorePolicy`; behavior defaults to `auto` (current)
2. Remove `restorePreferences.js` and revert `startupRestoreCoordinator` to single mutex
3. Remove new section from `Ajustes.jsx`
4. Revert `TerminalTTY` — remove `suspended` connectionState branch
5. Clear both new localStorage mutex keys on startup as cleanup

## Dependencies

- None external. All changes are in-memory/localStorage + existing session store file.

## Success Criteria

- [ ] Sessions without `restorePolicy` default to `'auto'` after v3 migration load
- [ ] `opencode-durable` sessions with `restorePolicy='manual'` produce `TERMINATED` action, not `RESUME_OPENCODE_SESSION`
- [ ] `shell-ephemeral` sessions with `restorePolicy='manual'` produce `TERMINATED` action, not `RESTORE_SHELL_EMERGENT`
- [ ] Generic restore mutex key is `devhub_generic_restore_in_progress`, not the old shared key
- [ ] OpenCode restore mutex key is `devhub_opencode_restore_in_progress`
- [ ] `Ajustes.jsx` shows two independent radio groups for OpenCode and Generic restore policy
- [ ] `TerminalTTY` renders suspended placeholder overlay when `connectionState === 'suspended'`
- [ ] Suspended panel preserves exact workspace/panel position (layout already persisted separately)
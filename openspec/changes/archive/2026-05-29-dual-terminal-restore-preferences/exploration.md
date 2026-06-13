# Exploration: dual-terminal-restore-preferences

## Current State

### Session Classification (already implemented)
The system already classifies every saved session into exactly one of three types via `sessionType` in `sessionStore.js`:

- **`opencode-durable`**: has `opencodeSessionId` — React frontend handles restore via `opencode --session`
- **`pty-durable`**: has `ptyPid` — backend verifies process alive then respawns
- **`shell-ephemeral`**: neither — backend respawns via `createSession({ cwd, shell, restored: true })`

### Restore flow (already implemented)
- **Backend** (`ttyServer.js:restoreSessions()`): `opencode-durable` sessions are explicitly **skipped** — the backend logs "skipping opencode-durable session — React handles it". The React `startupRestoreCoordinator` dispatches `RESTORE_ACTION.RESUME_OPENCODE_SESSION` for them.
- **Frontend** (`startupRestoreCoordinator.js`): `buildStartupRestorePlan()` produces per-action plans. OpenCode panels get `RESUME_OPENCODE_SESSION`; shell-ephemeral panels get `RESTORE_SHELL_EMERGENT`.
- **Layout persistence**: `terminalStateStorageKey` (project-scoped localStorage) persists workspace/panel layout. Panel IDs are randomized at startup (TIC-2) to avoid stale localStorage collisions.
- **Mutex**: Single `devhub_restore_in_progress` localStorage flag blocks React relaunch while backend restores.

### Renderer preferences (already implemented)
`terminalRendererPreferences.js` manages per-workspace, per-panel renderer mode (`xterm` vs `vte-experimental`), project-scoped. `appearance/page.jsx` exposes the default renderer choice. **No restore policy preferences exist** — only renderer mode.

### Missing pieces relative to request
1. **Independent restore toggles** — no separate OpenCode vs generic-terminal restore policy
2. **Separate settings surface** — no terminal preferences modal with restore controls
3. **Manual per-panel resume CTA** — no centered button inside suspended panels
4. **In-place panel position on resume** — panels already restore in position (layout persisted), but "suspended" state for OpenCode is not visually differentiated
5. **RAM strategy** — OpenCode processes are kept alive by the backend only during the app session; after reboot they are NOT kept alive by PTY (they are skipped). The "RAM explosion" concern is about keeping many OpenCode PTY processes alive simultaneously, which the current `MAX_SESSIONS=50` cap and idle eviction partially address.

---

## Affected Areas

| File | Why affected |
|------|-------------|
| `src/lib/terminal/sessionStore.js` | Storage schema — needs `restorePolicy` field on saved sessions |
| `src/lib/terminal/startupRestoreCoordinator.js` | Needs dual restore action types, dual mutexes, dual restore flows |
| `src/lib/terminal/ttyServer.js` | `restoreSessions()` needs to respect per-session-type restore policies; `MAX_SESSIONS` eviction applies to PTY only (OpenCode doesn't use PTY) |
| `src/components/TerminalWorkspacesManager.jsx` | Needs to render suspended-panel CTA; reads/writes new restore preferences |
| `src/components/TerminalTTY.jsx` | Needs to surface "suspended" visual state and render manual-resume CTA |
| `src/components/terminal/terminalRendererPreferences.js` | Extend to cover restore policy preferences (or create sibling module) |
| `src/views/Ajustes.jsx` / `src/app/settings/appearance/page.jsx` | Terminal settings surfaced in existing settings |
| New: `src/components/terminal/TerminalSettingsModal.jsx` | Dedicated modal opened from terminal top bar with restore toggles |
| `src/lib/terminal/restoreManifest.js` | May need `restorePolicy` field propagation |

---

## Approaches

### Approach 1: Extend renderer-preferences model (same module, new fields)

Add `restorePolicy` to `terminalRendererPreferences.js` alongside the existing `defaultMode`/`panels` structure. A new `TERMINAL_RESTORE_POLICY` enum with values `auto | manual | off` per terminal type (opencode vs generic). New read/write functions `readTerminalRestorePreferences` / `writeTerminalRestorePreferences`. Policy evaluated in `startupRestoreCoordinator`.

**Pros**: Reuses existing project-scoped storage pattern, existing sanitize/read/write infrastructure. Fast to implement.
**Cons**: Mixes renderer-mode preferences with restore policy in same localStorage key — scope inflation. No dedicated settings UX — would bolt onto the existing appearance page or need a new section.
**Effort**: Medium

### Approach 2: Independent preferences module + new TerminalSettingsModal

Create `src/lib/terminal/restorePreferences.js` as a sibling to `terminalRendererPreferences.js`. New localStorage key `devhub_terminal_restore_preferences:{projectId}`. New modal `TerminalSettingsModal` opened from the terminal top bar (gear icon or similar). Separate sections for OpenCode and Generic Terminal restore policies.

**Pros**: Clean separation of concerns. Independent evolution. Dedicated UX surface. Modal is self-contained and doesn't require modifying existing settings pages.
**Cons**: New storage key, new read/write plumbing. Requires new modal component and trigger mechanism from the terminal top bar.
**Effort**: Medium-High

### Approach 3: Add restore policy to sessionStore + dual mutex + modal (most complete)

Extends Approach 2 but also stores `restorePolicy` directly on each saved session in `~/.devhub/terminal-sessions.json` (field `restorePolicy: 'auto'|'manual'|'off'`). This lets the backend make per-session decisions without needing React to supply the policy at restore time. Two separate localStorage mutex flags: `devhub_opencode_restore_in_progress` and `devhub_generic_restore_in_progress`.

**Pros**: Most complete — policy is session-level, survives reboot, backend can make independent decisions per session. Two mutexes prevent cross-type interference. Full separation of OpenCode vs generic restore lifecycle.
**Cons**: Requires schema migration in `sessionStore.js` (`sessionType` already exists, but `restorePolicy` is new). More moving parts. Highest implementation complexity.
**Effort**: High

---

## Recommendation

**Approach 3** for the architecture, **but staged across two PRs** given the 800-line budget.

### Rationale
The user's core complaint is RAM explosion from many OpenCode sessions. The right fix is NOT keeping OpenCode PTYs alive (they already aren't — backend skips them). The right fix is ensuring:
1. OpenCode sessions do NOT auto-resume all at once (they should be `manual` by default for users with many sessions)
2. Generic terminals can auto-resume independently
3. Each session remembers its own policy

The two mutex approach cleanly solves the "independent restore policies" requirement — OpenCode restore and generic restore can happen independently without blocking each other.

### Staged delivery

**PR #1 (this change, within 800 lines)**:
- New `restorePreferences.js` module (read/write/normalize)
- Per-session `restorePolicy` field added to `sessionStore.js` schema (version bump to 3)
- `startupRestoreCoordinator.js` updated to evaluate restore policy per session type
- Two mutex keys instead of one
- Basic `TerminalSettingsModal` (inline in `TerminalWorkspacesManager.jsx` initially — NOT a separate file) with two toggles
- No visual CTA inside suspended panels yet (defer to PR #2)
- Settings surfaced in the existing `Ajustes.jsx` preferences tab (not a separate modal from top bar yet)

**PR #2 (follow-up)**:
- Centered resume CTA inside suspended OpenCode panels
- Full `TerminalSettingsModal` as a proper modal dialog (separate component)
- Triggered from terminal top bar icon
- Any remaining policy nuances

---

## Policy Precedence Analysis

The user asked for explicit analysis of policy conflict resolution.

### Conflict: What if OpenCode restore is `auto` and generic restore is `manual`?

No real conflict — they operate on different session types. Each session's `sessionType` + `restorePolicy` determines its fate independently.

### Conflict: What if a session has `sessionType=opencode-durable` but `restorePolicy=manual`?

Then `startupRestoreCoordinator` should dispatch `RESTUME_OPENCODE_SESSION` only if `restorePolicy === 'auto'`. If `manual`, the session remains in the manifest as "suspended" but no relaunch dispatch fires.

### Conflict: What about backward compatibility?

- **Existing sessions without `restorePolicy`**: Treat as `auto` (current behavior). This is the migration default — existing users experience no change.
- **Schema version bump**: `sessionStore.js` version goes from 2 to 3; `loadSessions()` applies a default `restorePolicy: 'auto'` to any session lacking the field.

### Conflict: Panel position on manual resume

The layout (workspace/panel/position) is already persisted separately in `terminalStateStorageKey`. Even if OpenCode sessions are set to `manual`, the layout structure survives reboot. When the user manually resumes an OpenCode panel, the panel is in the same workspace and panel position — no additional mechanism needed. The panel simply shows a "resume" CTA until manually triggered.

---

## Risks

1. **800-line budget pressure**: Adding preference storage, dual mutex, modal, and per-session policy at once is high-risk for a single PR. Mitigation: Stage as described above.
2. **Schema migration**: `sessionStore.js` version 3 migration needs careful testing — existing sessions with no `restorePolicy` must default to `'auto'`. A corrupted session file should not crash startup.
3. **Mutex timing**: Two async restore flows in parallel (OpenCode via React, generic via backend) need careful sequencing. The mutexes must be per-type to prevent generic restore from blocking OpenCode resume and vice versa.
4. **"Manual resume" UX complexity**: A centered CTA inside a suspended panel requires the panel to render a placeholder UI even when the terminal is not connected. `TerminalTTY` currently expects a WebSocket connection. Extending `TerminalTTY` to render a "suspended" placeholder (with CTA) without a live socket is non-trivial — needs a new state in `connectionState` or a separate `SuspendedPanel` component.
5. **Existing `sessionType` taxonomy**: The classification is already implemented. Adding `restorePolicy` must not change `classifySession()` behavior. `restorePolicy` is orthogonal — it governs whether a session of a given type gets restored, not its classification.
6. **OpenCode `opencode-durable` vs generic `shell-ephemeral`/`pty-durable`**: The current backend skip for `opencode-durable` means the backend never even tries to restore OpenCode — it relies on React dispatching `opencode --session`. If we add `restorePolicy=manual` for OpenCode, this same skip behavior applies (no backend restore attempted), and the manual resume dispatch comes from React. This is consistent.

---

## Edge Cases

- **Session without `restorePolicy` after schema migration**: Default to `'auto'` — current behavior preserved.
- **Session with `restorePolicy='off'`**: Never restored, even if app restarts. User must explicitly change preference to `auto` or `manual`.
- **OpenCode sessions during active app session (no reboot)**: The "suspended" state only applies on restart. During an active session, OpenCode panels that are closed are gone — no suspend/resume within a session.
- **Many OpenCode sessions (20+)**: Setting `restorePolicy='manual'` for all prevents RAM explosion on restart. User manually resumes only the ones they need.
- **Generic terminals during reboot**: PTY processes are verified alive via `process.kill(pid, 0)` — dead PTYs are cleaned as zombies and not restored.
- **Concurrent OpenCode and generic restore on same startup**: Two mutex keys ensure they don't interfere. Generic restore (backend) and OpenCode restore (React) happen concurrently.

---

## Likely Files Changed (PR #1 scope)

1. `src/lib/terminal/sessionStore.js` — version bump, `restorePolicy` field
2. `src/lib/terminal/restorePreferences.js` — **new file**
3. `src/lib/terminal/startupRestoreCoordinator.js` — dual mutex, policy evaluation
4. `src/components/TerminalWorkspacesManager.jsx` — reads restore preferences, renders settings UI in preferences tab
5. `src/views/Ajustes.jsx` — adds terminal restore section to prefs tab

---

## Budget Assessment

**Will not fit in 800-line single PR if full scope is attempted.** Full scope includes:
- New preferences module (~150 lines)
- Schema migration (~50 lines)
- Dual mutex logic (~80 lines)
- Modal component with UI (~250 lines)
- `TerminalTTY` suspended state rendering (~100 lines)
- `Ajustes` integration (~80 lines)
- Tests (~200 lines)

**Recommendation**: Restrict PR #1 to the plumbing (preferences module + dual mutex + settings in Ajustes tab + sessionStore schema). Defer modal UI and suspended-panel CTA to PR #2. Expected PR #1 size: ~650-750 lines. PR #2: ~400-500 lines.

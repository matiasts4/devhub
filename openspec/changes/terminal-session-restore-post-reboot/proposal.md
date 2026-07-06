# Proposal: Terminal Session Restore Post Reboot (Phase 2 — orchestration hardening)

## Intent

Keep the **current product behavior** users like: on app open, DevHub restores workspace layout (panel count, positions) and relaunches agent TUIs (Grok, Kimi, OpenCode, etc.) from persisted commands. Extend that with **reliable session-level resume** where CLIs support it (OpenCode today; Grok/Kimi/KimiCode when verified), and **eliminate double-injection** that crashed live TUIs (e.g. `opencode --session` sent after the TUI was already running).

**Execution branch:** `feature/terminal-decompose` only — no branch switch; coordinate with other agents on the same branch.

## Scope

### In Scope

- **Single-inject orchestration** on cold start: coordinate layout hydrate (path A) and startup restore queue (path B) so each panel receives at most one PTY command inject for the same normalized resume intent.
- **OpenCode** durable resume hardened end-to-end (startup + manual reopen); finish Playwright/Jest contracts for single-launch.
- **TUI taxonomy** in restore manifest/plan: explicit kinds for `opencode`, `grok`, `kimi`, `swarm`, `generic-shell` — fix Kimi misclassification as shell-ephemeral where inappropriate.
- **Provider roadmap** behind `resumableSessionAdapters`: extension slots + persistence hooks for Grok/Kimi/KimiCode session ids when list+resume is verified (Phase B tasks; OpenCode remains mandatory first).
- **Gear settings alignment** (`TerminalRestoreSettingsModal` → Restauración tab): prefs global (`devhub_terminal_restore_prefs`), copy that matches behavior; remove duplicate restore controls from modal “Terminal” tab; align manual/off with suspended UX for non-OpenCode TUIs where policies apply.
- Completed MVP from Phase 1–2: Reopen/History catalog, bounded `/api/opencode/sessions`, shared `useResumableSessionCatalog`.

### Out of Scope

- Master toggle to disable layout hydrate or panel count restore.
- Moving restore settings to global Ajustes (future optional mirror).
- Hermes/Codex/Cloud durable reboot resume without verified CLI list+resume.
- PTY scrollback / framebuffer / exact TUI state continuity.
- Per-project restore prefs (stay global).

## Capabilities

### New Capabilities

- `terminal-startup-inject-orchestration`: Cold-start phase gate per panel — hydrate, runtime probe, inject-once or skip relaunch.
- `terminal-restore-gear`: Terminal gear modal as canonical restore policy UI; behavior-aligned copy and no duplicate controls.

### Modified Capabilities

- `agent-session-reopen`: Add anti-duplicate startup inject; provider-kind resume commands; Grok/Kimi launch vs session resume distinction in requirements.
- `session-restore` (canonical, via delta reference): Policy gating must apply consistently to suspended UI seeds for all policy-governed TUI kinds.

## Approach

1. **Phase A — Orchestration:** Introduce shared cold-start decision (`resolvePanelStartupInjectIntent`) used by `dispatchStartupRestoreQueue` and `useTerminalInitialCommandLifecycle`; wire `REATTACH_LIVE_TERMINAL` / `onPanelLive` to TTY skip path; restrict `#recovery-*` bumps to explicit user/manual revive only.
2. **Phase B — Providers:** For each verified CLI, add adapter + optional API route + session-detected persistence (mirror OpenCode); upgrade `initialCommand` to resume form before inject.
3. **Phase C — Gear:** Split `TerminalSettingsSection` so modal Terminal tab excludes restore block; extend `seedSuspended*` for generic/kimi/grok manual policy where auto-relaunch is suppressed.

Command-based resume remains the contract; sidecar PTY state may be volatile after full reboot.

## Affected Areas

| Area                                                                  | Impact                                                                       |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/lib/terminal/startupRestoreRunner.js`                            | Per-kind resume command builder; skip relaunch when inject already satisfied |
| `src/lib/terminal/startupRestoreCoordinator.js`                       | TUI kind in manifest; plan actions for grok/kimi                             |
| `src/components/workspace/WorkspaceRestoreCoordinator.js`             | Orchestration order; `onPanelLive` → lifecycle flags                         |
| `src/components/terminal/hooks/useWorkspaceBootstrapEffect.js`        | Defer startup restore until inject intent resolvable                         |
| `src/components/terminal/hooks/useTerminalInitialCommandLifecycle.js` | Consult orchestration gate before send                                       |
| `src/lib/terminal/panelInitialCommandLifecycle.js`                    | Cold-load session scope for dispatch records                                 |
| `src/lib/terminal/restorePolicyResolver.js`                           | `inferPanelSessionKind` includes `kimi`                                      |
| `src/components/TerminalRestoreSettingsModal.jsx`                     | Gear UX dedupe + copy                                                        |
| `src/lib/agentSessions/resumableSessionAdapters.js`                   | Provider slots (Phase B)                                                     |
| `tests/e2e/terminal-session-restore-post-reboot.spec.ts`              | Single-inject e2e                                                            |

## Risks

| Risk                                | Likelihood | Mitigation                                                   |
| ----------------------------------- | ---------- | ------------------------------------------------------------ |
| Double-inject regression            | Medium     | RED tests + e2e; log `terminal-session` decision trail       |
| Over-gating blocks manual revive    | Medium     | `#recovery` only on explicit user actions                    |
| Grok session API unknown            | High       | Phase B gated on verified CLI; Phase A keeps `grok` relaunch |
| Branch merge conflicts on TWM/hooks | Medium     | Small PR-sized task slices                                   |

## Rollback Plan

Revert orchestration module and restore prior startup runner behavior; gear UI changes are additive and reversible. OpenCode catalog/Reopen MVP from Phases 1–2 remains intact if orchestration is reverted in isolation.

## Dependencies

- Existing `terminal-decompose` extractions (`WorkspaceRestoreCoordinator`, `useWorkspaceBootstrapEffect`)
- OpenCode CLI list/resume (verified)
- Playwright Chromium for e2e 3.3–3.5 (local CI)

## Success Criteria

- [x] Reopen/History deterministic states (Phases 1–2 shipped)
- [ ] Cold start: each persisted OpenCode panel gets **at most one** `opencode --session` inject
- [ ] Live sidecar reattach: no second inject into running OpenCode/Grok TUI
- [ ] Grok panels still reopen with `grok` on cold start when no session id (current UX preserved)
- [ ] Gear Restauración prefs affect next startup; no duplicate restore UI in modal Terminal tab
- [ ] Kimi panels not incorrectly processed as plain shell-ephemeral respawn without intent
- [ ] E2E `terminal-session-restore-post-reboot.spec.ts` green when Chromium available

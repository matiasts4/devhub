# Proposal: Terminal Multiprovider Session Resume

## Intent

Extend `terminal-session-restore-post-reboot` so **every** verified agent TUI — not just OpenCode — resumes its exact prior conversation after a full machine reboot, per workspace panel. Add a master "restore on reboot" switch plus per-provider policies in the terminal restore settings modal.

## Verified CLI contracts (2026-07-26)

| Provider | Resume by id              | Latest per cwd        | Pre-assign id                | Session store                                     |
| -------- | ------------------------- | --------------------- | ---------------------------- | ------------------------------------------------- |
| opencode | `opencode --session <id>` | —                     | —                            | `/api/opencode/sessions` (shipped)                |
| kimi     | `kimi --session <id>`     | `kimi --continue`     | no                           | `~/.kimi-code/sessions/wd_*/session_*/state.json` |
| grok     | `grok --resume <id>`      | `grok --continue`     | `grok --session-id <uuid>`   | `~/.grok/sessions/<enc-cwd>/<uuid>/summary.json`  |
| codex    | `codex resume <id>`       | `codex resume --last` | —                            | `~/.codex/sessions/` (rollout files)              |
| qodercli | `qodercli --resume <id>`  | `qodercli --continue` | `qodercli --session-id <id>` | `qodercli --list-sessions`                        |
| claude   | not installed here        | —                     | —                            | placeholder adapter                               |

## Scope

### In Scope

- Session-catalog routes + fs/CLI scanners for kimi, grok, codex, qoder (shared handler, same envelope as `/api/opencode/sessions`).
- Durable `resumableSessionAdapters` for kimi/grok/codex/qoder (`buildResumeCommand` + `buildContinueCommand`); Reopen/History catalog gains all providers via `useResumableSessionCatalog`.
- Per-panel session-id binding:
  - pre-assigned ids at launch for grok/qoder (`--session-id <uuid>` in launch presets),
  - generic spawn-time binder in `ttyServer` (`agentSessionBinder.js`) that correlates newly created on-disk sessions to the spawning panel (kimi, codex) and emits `<provider>-session-detected`.
- Restore pipeline generalization: provider-aware kinds in `inferPanelSessionKind`, `RESUME_AGENT_SESSION` plan action (superset of `RESUME_OPENCODE_SESSION`), cwd-discovery → continue fallbacks.
- Swarm post-reboot fix: only emit tmux reattach when the tmux session is actually alive in the runtime snapshot; otherwise policy-gated terminated/suspended (fixes empty-tmux attach; Windows has no tmux at all).
- Settings modal: master `restoreOnReboot` switch (default on) + per-kind policies `{opencode, kimi, grok, codex, qoder, swarm, generic}` in `devhub_terminal_restore_prefs` (back-compatible read of the old 3-key shape).

### Out of Scope

- PTY scrollback / framebuffer persistence (unchanged from previous change).
- Claude durable resume (CLI not installed on the dev machine; placeholder only).
- Per-project restore prefs (stay global).

## Capabilities

### Modified Capabilities

- `agent-session-reopen`: catalog + reopen now spans opencode/kimi/grok/codex/qoder with per-provider resume commands.
- `terminal-restore-gear`: master reboot switch + extended per-kind policy list.
- `session-restore` (delta reference): plan actions are provider-aware; swarm reattach is evidence-gated.

## Approach

1. **Catalog**: `sessionDirScanners.js` (fs, never-throw) + shared `sessionsRouteHandler.js` + thin routes per provider.
2. **Binding**: pre-assign where the CLI supports it; spawn-time fs correlation elsewhere; frontend normalizes `initialCommand` to the provider's resume form (mirrors the OpenCode flow).
3. **Pipeline**: provider spec drives manifest ids, plan actions, and runner relaunch commands; single-inject orchestration unchanged.
4. **Gear**: master switch short-circuits the startup restore queue; per-kind policies keep auto/manual/off semantics.

## Risks

| Risk                                                                      | Mitigation                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Two same-provider panels in one cwd bind to wrong sessions                | 1:1 assignment by spawn order ↔ `createdAt` order; degenerate case falls back to `continue` |
| codex/qoder on-disk formats unverified (no prior sessions on dev machine) | catalogs start best-effort; `--last`/`--continue` resume still works                        |
| Preferences schema migration                                              | back-compatible sanitize; unknown keys dropped as today                                     |

## Success Criteria

- [ ] After reboot, a kimi panel resumes with `kimi --session <id>` (bound id) or `kimi --continue` (fallback).
- [ ] After reboot, a grok panel launched from DevHub resumes with `grok --resume <pre-assigned-id>`.
- [ ] Reopen/History lists kimi + grok sessions alongside opencode.
- [ ] Swarm panel after reboot never attaches to an empty tmux; policy-gated suspended/terminated instead.
- [ ] Master switch off → no automatic restore on next startup; manual revive still works.
- [ ] Targeted Jest suites green (`agentSessions`, routes, restore pipeline, modal).

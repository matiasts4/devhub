# Proposal: Terminal Session Restore Post Reboot

## Intent

Primary goal is resumable agent-session recovery after app close or machine reboot, NOT generic shell resurrection. Verified today: OpenCode already lists sessions through `/api/opencode/sessions` and resumes with `opencode --session <id>`, but the topbar Reopen UX can stay loading. Hermes currently only relaunches `hermes` in the same cwd and keeps session data in volatile React state, so it is not real reboot-safe resume.

## Scope

### In Scope

- Fix the broken topbar Reopen experience so loading, empty, and error states resolve correctly
- Ship OpenCode MVP as mandatory command-based resume after relaunch/reboot
- Make resume/history provider-aware instead of OpenCode-only where durability exists
- Investigate Hermes CLI for a real list/resume token or command flow; implement only if verified
- Leave clean extension points for future Codex/Cloud-style providers

### Out of Scope

- Generic shell/PT Y restoration, scrollback recovery, or pixel-perfect TUI continuation
- Treating `hermes` relaunch-in-same-cwd as valid resume
- Promising Codex/Cloud support in this MVP

## Capabilities

### New Capabilities

- `agent-session-reopen`: Reopen resumable agent CLI sessions after app relaunch or reboot

### Modified Capabilities

- None

## Approach

Use command-based resumability as the contract. Harden OpenCode listing in `src/app/api/opencode/sessions/route.js` with bounded execution and predictable failure semantics, then wire `TerminalWorkspacesManager` and polling around durable resumable sessions. Hermes stays in-scope only if CLI-level discovery proves a real resume primitive; otherwise DevHub must hide or label Hermes as unsupported for reboot resume instead of faking it.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Fix Reopen UX; gate Hermes on verified resume support |
| `src/app/api/opencode/sessions/route.js` | Modified | Prevent hung OpenCode listing from leaving UI stuck |
| `src/hooks/useAgentRegistryPolling.js` | Modified | Generalize virtual resume/history model beyond OpenCode-only assumptions |
| `src/app/api/hermes/sessions/route.js` | New | Add only if Hermes CLI proves durable list/resume support |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Hermes has no real resume command | High | Timebox discovery; ship OpenCode-only MVP |
| CLI list call hangs and blocks UI | Medium | Add timeout, explicit errors, manual refresh |
| Users expect exact prior TUI state | Medium | State clearly that resume is command-based |

## Rollback Plan

Revert to current OpenCode-only behavior, disable provider-aware resume behind a flag, and hide Hermes/Codex/Cloud entries unless their resume commands are verified.

## Dependencies

- OpenCode CLI session list/resume support (verified)
- Hermes CLI list/resume discovery (required before Hermes inclusion)

## Success Criteria

- [ ] Reopen menu no longer spins indefinitely and shows deterministic OpenCode results/errors
- [ ] After relaunch/reboot, OpenCode sessions can be resumed from UI with `opencode --session <id>`
- [ ] Hermes is shown as resumable only when DevHub can invoke a verified Hermes resume flow
- [ ] Codex/Cloud remain explicit follow-on extension points, not broken placeholders

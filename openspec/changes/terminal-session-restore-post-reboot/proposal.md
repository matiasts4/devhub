# Proposal: Terminal Session Restore Post Reboot

## Intent

Primary goal is durable agent-session recovery after relaunch or full machine reboot, NOT generic shell/PTy resurrection. OpenCode is the only verified durable provider today: DevHub can list resumable sessions and resume them with `opencode --session <id>`. Proposal now adds startup auto-resume on app open for persisted durable sessions, alongside fixing the bounded Reopen/History UX.

## Scope

### In Scope

- Fix topbar Reopen/History so loading, empty, and error states resolve deterministically
- Auto-resume persisted durable sessions once on app startup after relaunch/reboot, starting with OpenCode
- Keep manual OpenCode reopen/resume available from UI via command-based resume
- Make durable resume provider-aware only where CLI list+resume is verified
- Leave extension points for future verified durable providers

### Out of Scope

- Generic shell/PTy restoration, scrollback recovery, or exact TUI/framebuffer continuation
- Treating `hermes` relaunch-in-same-cwd as durable reboot resume
- Shipping Hermes/Codex/Cloud reboot resume without a verified CLI list+resume contract

## Capabilities

### New Capabilities

- `agent-session-reopen`: Reopen and startup-resume durable agent CLI sessions after relaunch or reboot

### Modified Capabilities

- None

## Approach

Use command-based resumability as the contract. Persist only durable provider resume commands/tokens, bootstrap them once during app startup, and keep Reopen/History bounded with explicit failure states. OpenCode is mandatory MVP. Hermes remains unsupported for reboot resume unless DevHub verifies a real Hermes CLI list+resume primitive.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Add one-shot startup auto-resume; fix Reopen UX; gate unsupported providers |
| `src/hooks/useResumableSessionCatalog.js` | Modified | Feed both startup auto-resume and manual reopen/history |
| `src/app/api/opencode/sessions/route.js` | Modified | Keep OpenCode session listing bounded and reliable |
| `src/lib/agentSessions/resumableSessionAdapters.js` | Modified | Encode durable-provider contract; keep Hermes excluded unless verified |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Startup bootstrap double-launches sessions | Medium | Add one-shot guard and durable-command validation |
| CLI list call hangs and blocks UI | Medium | Keep timeout, explicit errors, manual refresh |
| Users expect exact prior TUI state | Medium | State clearly that resume is command-based, not PTy restore |

## Rollback Plan

Disable startup auto-resume, fall back to manual OpenCode reopen only, and hide any provider without verified durable resume support.

## Dependencies

- OpenCode CLI session list/resume support (verified)
- Persisted durable session metadata/commands from existing workspace restore flow
- Hermes CLI list+resume verification before any Hermes reboot-resume support

## Success Criteria

- [ ] Reopen/History no longer spins indefinitely and shows deterministic results/errors
- [ ] On app open after reboot or relaunch, persisted durable OpenCode sessions auto-resume once
- [ ] Manual OpenCode reopen still works via `opencode --session <id>`
- [ ] Hermes stays unsupported for reboot resume unless a verified CLI list+resume flow exists

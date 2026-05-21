# Exploration: terminal session restore post reboot

### Current State
DevHub already persists terminal workspace/panel layout in `localStorage`, and `TerminalTTY` auto-sends each panel's `initialCommand` on websocket connect. OpenCode is the only verified durable provider today: `/api/opencode/sessions` lists sessions, `resumableSessionAdapters.js` normalizes them, and `TerminalWorkspacesManager` launches `opencode --session <id>` into a new panel and stores that command for later restore. Production sidecar session state is still in-memory, so reboot-safe behavior is command/token based, not PTY resurrection.

### Affected Areas
- `src/components/TerminalWorkspacesManager.jsx` — owns persisted panel commands and launch/resume behavior; needs startup bootstrap for auto-resume.
- `src/components/TerminalTTY.jsx` — already executes `initialCommand`; likely no core change unless startup flow needs better signaling.
- `src/lib/agentSessions/resumableSessionAdapters.js` — durable provider contract; OpenCode only, Hermes excluded.
- `src/hooks/useResumableSessionCatalog.js` — fetches resumable sessions; can feed startup resume selection.
- `src/app/api/opencode/sessions/route.js` — bounded OpenCode list API already in place.
- `src/lib/terminal/ttyServer.js` / `sidecar-backend/server.js` — live-session transport remains volatile on production sidecar.
- `openspec/changes/terminal-session-restore-post-reboot/*` — current artifacts emphasize reopen/history, not automatic startup resume.

### Approaches
1. **Update existing change in place** — extend current OpenSpec artifacts with an explicit startup auto-resume requirement and implement a minimal startup bootstrap that rehydrates persisted durable commands/tokens and launches them on app open.
   - Pros: reuses existing provider/model work, smallest scope, no duplicate change tracking.
   - Cons: needs careful guardrails to avoid double-launching sessions.
   - Effort: Medium

2. **Split into a new change** — keep reopen/history as-is and create a separate reboot-autostart change.
   - Pros: cleaner scope boundary for a distinct startup behavior.
   - Cons: duplicates much of the same provider/session plumbing; slower and more fragmented.
   - Effort: Medium/High

### Recommendation
Update the existing `terminal-session-restore-post-reboot` change in place. The new goal is a narrow extension of the same durable resume contract: on app startup, detect persisted durable OpenCode session commands/tokens and auto-execute them once, while Hermes remains unsupported until a real CLI list+resume contract is verified.

### Risks
- Duplicate auto-launch if startup hydration runs before persisted state is fully normalized.
- Users may expect exact pre-reboot PTY continuity; DevHub only guarantees command-based resume.
- Production sidecar volatility can still mask failures unless startup errors are explicit.

### Ready for Proposal
Yes — but the proposal/spec should be updated to explicitly require startup auto-resume, not just manual reopen/history.

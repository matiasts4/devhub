# Provider notes: Grok durable resume

**Status:** Not verified — startup uses persisted `grok`/`groc` `initialCommand` (hydrate path) only.

**Phase B checklist:**

- Confirm whether Grok CLI exposes `session list` + resume-by-id (or equivalent).
- If yes: add `GET /api/grok/sessions` (or shared TUI route), adapter with `supportsDurableResume() === true`, persist session id on TUI detection (mirror OpenCode).
- If no: keep relaunch-only; document in gear copy.

**Risk:** Injecting resume into live Grok TUI — mitigated by `startupInjectOrchestrator` on branch `feature/terminal-decompose`.

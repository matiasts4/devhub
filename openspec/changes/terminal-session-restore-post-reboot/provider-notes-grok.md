# Provider notes: Grok durable resume

**Status:** ✅ Verified 2026-07-26 (see `openspec/changes/terminal-multiprovider-session-resume/`).

**Verified CLI contract** (`grok --help`, installed at `~/.grok/bin/grok`):

- `grok -r, --resume [<SESSION_ID>]` — resume by id, or the most recent when omitted.
- `grok -c, --continue` — continue the most recent session for the cwd.
- `grok -s, --session-id <uuid>` — pre-assign a UUID to a **new** session
  (must not already exist) → DevHub launch presets carry the id from birth.
- `grok sessions list|search` subcommand exists.
- On-disk catalog: `~/.grok/sessions/<encodeURIComponent(cwd)>/<uuid>/summary.json`
  with `{ info: { id, cwd }, session_summary, created_at, updated_at }`.

**Risk:** Injecting resume into live Grok TUI — mitigated by `startupInjectOrchestrator`.

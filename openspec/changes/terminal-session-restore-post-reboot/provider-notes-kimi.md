# Provider notes: Kimi / KimiCode durable resume

**Status:** ✅ Verified 2026-07-26 (see `openspec/changes/terminal-multiprovider-session-resume/`).

**Verified CLI contract** (`kimi --help`, v installed at `~/.kimi-code/bin/kimi`):

- `kimi -S, --session [id]` — resume a session by id (interactive picker when omitted).
- `kimi -c, --continue` — continue the most recent session for the working directory.
- On-disk catalog: `~/.kimi-code/sessions/wd_<slug>_<hash>/session_<uuid>/state.json`
  with `{ createdAt, updatedAt, title, workDir, lastPrompt }` — enough for a
  `/api/kimi/sessions` route without invoking the CLI.
- No flag to pre-assign a session id for a new session → id binding uses
  spawn-time fs correlation (`agentSessionBinder.js`).

**Classification:** `inferPanelSessionKind` returns `kimi` (own policy kind);
`isTuiLaunchCommand` includes `kimi` for restore planning.

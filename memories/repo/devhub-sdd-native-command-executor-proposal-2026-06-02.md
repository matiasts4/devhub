# SDD propose — native-command-executor-assistant (2026-06-02)

Engram MCP was unavailable during this propose phase; proposal persisted to
file-based openspec store instead:
`openspec/changes/native-command-executor-assistant/proposal.md`
(intended engram topic_key: `sdd/native-command-executor-assistant/proposal`).

## Key decisions
- **Option B (lightweight CommandBar)** chosen over reusing Director General.
  Single-shot, user-directed, ONE intent → ONE visible native action. NOT an
  autonomous mission/agent loop.
- **Intent router is deterministic first** (rule/keyword + slot extraction);
  `IntentRouter` interface kept as a seam for future LLM tool-calling. Action
  layer stays identical regardless of router.
- **Terminal buffer-read API is a required new enabling piece** — no API exists
  today to read a terminal buffer back as text. Returns structured text
  (string + terminal name + timestamp) so a FUTURE voice/TTS phase can consume
  the same result without reworking the action layer.
- **Voice/TTS explicitly out of scope** this change; architecture must not block
  it (read-back returns structured text).
- **Visibility via Pizarra overlay**; risk noted on auto-placement bounds.

## Phasing (reviewable PRs)
1. CommandBar + open terminal + run command (smallest vertical slice).
2. Browser open + navigate/search.
3. Terminal buffer read-back (text) — implements terminal-buffer-read API.

## Next
`sdd-spec` and `sdd-design` (can run in parallel) read this proposal.

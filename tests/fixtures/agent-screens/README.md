# Agent screen fixtures (herdr parity)

Capture bottom-viewport text from real TUIs or from `.research/herdr` evidence comments.

Used by `scripts/explain-agent-detection.mjs` and detector tests.

Sync manifests: `node scripts/compare-herdr-manifests.mjs`
Rebuild sidecar bundle: `node scripts/build-sidecar-agent-detection.mjs`

### Kimi Code CLI Fixtures

- `kimi-working-footer.txt`: Kimi Code CLI executing a task (progress + spinner + `esc interrupt` hint).
- `kimi-idle-prompt.txt`: Kimi Code CLI prompt waiting for input (`ctrl+p commands` hint, no `esc interrupt`).
- `kimi-blocked-approval.txt`: Kimi Code CLI requesting user permission/approval (`↵ confirm` hint).

### Antigravity Fixtures

- `antigravity-working-spanish.txt`: localized (Spanish) TUI — braille spinner + "⠋ Leyendo", no `esc to cancel`; exercises the locale-robust spinner rule (W9).
- Raw `\r`-overwritten spinner/footer frames (W6 regression) are inlined in
  `src/lib/terminal/__tests__/sessionAgentDetector.test.js` — not stored as
  fixture files, so git CRLF normalization cannot rewrite the bytes.

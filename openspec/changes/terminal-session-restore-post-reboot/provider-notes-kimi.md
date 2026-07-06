# Provider notes: Kimi / KimiCode durable resume

**Status:** Not verified — `kimi` is classified as TUI (excluded from `RESTORE_SHELL_EMERGENT` via `isTuiLaunchCommand`).

**Phase B checklist:**

- Verify Kimi CLI session list and resume flags (path often under `~/.kimi-code/bin/kimi`).
- Session detection already partially wired via `kimiReadyMarker.js` for TUI readiness, not session id persistence.
- Adapter registration in `resumableSessionAdapters.js` placeholder exists; enable only after CLI contract is documented.

**Classification:** `inferPanelSessionKind` keeps `generic` for prefs lookup; `isTuiLaunchCommand` includes `kimi` for restore planning.

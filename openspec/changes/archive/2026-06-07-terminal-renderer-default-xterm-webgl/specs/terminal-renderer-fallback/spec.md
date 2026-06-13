# Delta Spec: terminal-renderer-fallback

## Type: DELTA

This delta preserves the explicit user choice of `'vte-experimental'` during the soft roll-out of the new `xterm-webgl` default. The app MUST NOT run a one-time migration that overwrites a stored `'vte-experimental'` value on first load, and the read path MUST surface the stored value as the default. All existing term-02 readiness-gated fallback scenarios remain intact.

## ADDED Requirements

### Requirement: TRF-DELTA-1 — Stored `vte-experimental` Default Preservation

The system MUST read `devhub_terminal_renderer_default_mode` from localStorage and return the stored value verbatim when present, including `'vte-experimental'`. The system MUST NOT include any code path that overwrites a stored `'vte-experimental'` value on first load or on app open as part of this change. Stored values are the user's explicit choice and take precedence over the new default.

#### Scenario: TRF-DELTA-S1 — Stored `vte-experimental` is preserved

- GIVEN the user has `devhub_terminal_renderer_default_mode = 'vte-experimental'` in localStorage
- WHEN the app reads the default at boot
- THEN the read returns `'vte-experimental'`
- AND that value is used as the default for new panels created without a per-panel override

#### Scenario: TRF-DELTA-S2 — No migration code overwrites the stored value

- GIVEN the user has `'vte-experimental'` stored in localStorage
- WHEN the app loads and any first-load or app-open code path runs
- THEN no code path writes a new value into `devhub_terminal_renderer_default_mode`
- AND the stored `'vte-experimental'` value is unchanged after the app finishes booting

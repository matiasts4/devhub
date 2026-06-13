# Baseline metrics — terminal lifecycle stability

> Phase A.0 of `openspec/changes/terminal-pizarra-stability`. This file defines
> the repro matrix and the headline metric (**dispose-count-per-toggle**) that
> the singleton work (A.1) must drive to **0**. Fill the result columns from the
> structured lifecycle log once the scenarios are run on each build.

## Telemetry source

Structured lifecycle events are emitted via `cliLog` with tag `LIFECYCLE:<panelId>`
to `data/logs/terminal-debug.log`. Schema (see
`src/lib/terminal/terminalLifecycleEvent.js`):

```
{ ts, panelId, surfaceId, sessionId, renderer, event, reason, isVisible, refCount, cols, rows }
```

Canonical `event` values: `boot`, `dispose`, `webgl-release`, `webgl-reattach`,
`canvas-release`, `native-sync`, `fit-skip`, `portal-activate`, `portal-hide`.

Currently wired in `TerminalTTY.jsx`:

- **`boot`** — emitted when a fresh xterm runtime comes online (after
  `termRef.current = terminal`).
- **`dispose`** — emitted at the top of `disposeXtermRuntime` (before refs are
  nulled), so renderer + cols/rows are captured.

`fit-skip` is currently emitted through `logViewportDiagnostic('fit-skip')` (the
A.4 dispose guard path); other events (`webgl-release`, `native-sync`, …) are
reserved and will be standardized onto the schema as A.2/A.3 land.

## How to extract dispose-count-per-toggle

```bash
# Count dispose events per panel for a session.
rg '"event":"dispose"' data/logs/terminal-debug.log | wc -l

# Per panel:
rg '"event":"dispose"' data/logs/terminal-debug.log \
  | rg -o '"panelId":"[^"]+"' | sort | uniq -c
```

One workspace↔pizarra toggle should emit **0** `dispose` events once A.1 is on
(the surface is portaled, not unmounted). Today (flag OFF / legacy) each toggle
unmounts one host and mounts the other → expect **≥1 dispose + ≥1 boot** per
toggle. Record the observed counts below.

## Repro matrix

Dimensions: panel count × interaction × renderer × build.

| # | Panels | Interaction | Renderer | Build | dispose/toggle | boot/toggle | Glyph corruption? | Crash? | Notes |
|---|--------|-------------|----------|-------|----------------|-------------|-------------------|--------|-------|
| 1 | 1 | workspace→pizarra | webgl | dev (Chrome) | _TBD_ | _TBD_ | | | |
| 2 | 1 | workspace→pizarra | webgl | `.deb` (WebKitGTK) | _TBD_ | _TBD_ | | | |
| 3 | 1 | pizarra→workspace | webgl | `.deb` | _TBD_ | _TBD_ | | | |
| 4 | 3 (split) | workspace-switch | canvas | dev | _TBD_ | _TBD_ | | | |
| 5 | 3 (split) | workspace-switch | canvas | `.deb` | _TBD_ | _TBD_ | | | |
| 6 | 3 (split) | window-resize during pizarra enter | webgl | `.deb` | _TBD_ | _TBD_ | | | A.3 target |
| 7 | 1 | pizarra-toggle ×20 | vte-experimental | `.deb` | _TBD_ | _TBD_ | | | scrollback preserved? |

## Acceptance targets (post A.1)

- dispose/toggle: **0** for mode toggles (scenarios 1–3, 7).
- boot/toggle: **0** for mode toggles (no remount).
- Glyph corruption: none across scenarios 1–7.
- Scrollback preserved across 20 toggles (scenario 7).

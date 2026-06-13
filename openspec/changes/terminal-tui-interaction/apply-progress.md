# terminal-tui-interaction — apply progress

**Branch:** `feature/terminal-renderer-xterm-webgl`
**Last update:** 2026-06-11 (verification pass)

## Status

| Task | Status | Notes |
|------|--------|-------|
| T1 sessionContext gate | **DONE** | `filterTerminalInputForSession(ctx, chunk)` forwards SGR click when tui+tuiReady |
| T2 wheel regression tests | **DONE** | NFR-T03 describe in `terminalNoiseFilter.test.js` |
| T3 sidecar parity | **DEFERRED** | build-time CJS generation + parity test |
| T4 tuiAdapter registry | **DONE** | `src/lib/terminal/tuiAdapter.js` + tests |
| T5 TerminalTTY wire | **DONE** | onData sessionContext + viewport mousedown `buildTerminalMousePressSequence` |
| T6–T7 RTL tests | **PARTIAL** | filter unit tests cover contract; full RTL deferred |
| T8 | DEFER per spec | — |

## Files changed

- `src/lib/terminal/terminalNoiseFilter.js` — ctx-aware `stripTerminalInputNoise`
- `src/lib/terminal/terminalNoiseFilter.test.js` — sessionContext + wheel describes
- `src/lib/terminal/tuiAdapter.js` — NEW
- `src/lib/terminal/tuiAdapter.test.js` — NEW
- `src/components/TerminalTTY.jsx` — sessionContext onData, viewport click fallback

## Test command

```bash
npm test -- --testPathPattern='terminalNoiseFilter|tuiAdapter|TerminalTTY'
```

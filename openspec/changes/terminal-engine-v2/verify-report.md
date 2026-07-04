# Verify report: terminal-engine-v2

**Branch:** `feature/terminal-engine-v2`  
**Date:** 2026-07-04  
**Phases:** 0–8 apply complete

## Automated checks

```bash
npm test -- --testPathPattern="v2Graveyard|ttyServer.unsubscribe|TerminalTTY.v2|TerminalTTY.rehydration|TerminalWorkspacesManager.v2graveyard|terminal-engine-v2|opencodeSession|nativeLayoutSync" --forceExit
```

| Result      | Detail    |
| ----------- | --------- |
| Test suites | 9 passed  |
| Tests       | 74 passed |

### Suites covered

- `v2Graveyard.test.js` — stash/restore/dispose + LRU cap N=12
- `ttyServer.unsubscribe.test.js` — unsubscribe keeps PTY alive, no auto-kill, delta replay
- `TerminalTTY.v2.test.jsx` — subscribe/unsubscribe, graveyard stash/restore, v2 DOM context-loss
- `TerminalTTY.rehydration.test.jsx` — two-tier rehydration + snapshot cadence
- `TerminalWorkspacesManager.v2graveyard.test.jsx` — hidden v2 unmount + `isEngineV2` passthrough
- `terminal-engine-v2-phase0.test.js` — VTE removal contract
- `opencodeSessionRegistry.test.js` — durable opencode session registry
- `nativeLayoutSync.test.js` — `filterLegacySurvivorPanelIds` for v2 coexistence

## Phase deliverables

| Phase | Key artifacts                                                           |
| ----- | ----------------------------------------------------------------------- |
| 0     | VTE removed; xterm-only renderer list                                   |
| 1     | `terminalScrollbackStore.js`, pub/sub in `ttyServer.js`                 |
| 2     | Canonical termsize + OSC 7 cwd                                          |
| 3     | `SerializeAddon` snapshot + delta rehydration                           |
| 4     | `v2Graveyard.js`, explicit `unsubscribe`, destroy-only-on-close         |
| 5     | v2 WebGL context-loss → DOM; LRU cap 12                                 |
| 6     | v2 skips survivor recovery + panel bridge; v1 retained                  |
| 7     | `opencodeSessionRegistry.js`, skip backend restore for opencode-durable |
| 8     | `docs/25_*`, `docs/28_*` updated                                        |

## Manual QA (recommended on installed Tauri build)

1. Enable `terminalEngineV2` on a panel; switch workspace — content restores without black panel.
2. Hide v2 panel >30 s; show again — PTY alive, rehydration or graveyard restore works.
3. Open 13+ hidden v2 panels — oldest graveyard surface evicted (LRU).
4. Lose WebGL context on v2 panel — degrades to DOM, no re-attach loop.
5. `opencode --session <id>` panel — survives app restart via frontend relaunch.

## Known gaps / follow-ups

- v1 panels still use survivor recovery until fully migrated off the flag.
- `terminalPanelBridge.js` retained for v1 only.
- Installed-build sign-off before deleting v1 recovery globally (Phase 6 full deletion deferred per coexistence contract).

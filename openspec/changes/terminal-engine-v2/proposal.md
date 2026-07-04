# Proposal: terminal-engine-v2

## Intent

Eliminate the root cause of DevHub's black-panel / flicker-on-workspace-switch symptom and the costly survivor-recovery apparatus that treats it today. Move the terminal stack from a dispose/recover model to waveterm-style contracts implemented on the existing Tauri + Node + xterm.js stack.

## Scope

### In Scope

- Remove VTE-only code (Phase 0): `zoha-vte`, `native_vte.rs`, `nativeVteBridge.js`, VTE branches in `CanvasTerminal.jsx` and renderer prefs.
- Sidecar ring buffer + pub/sub (Phase 1) and backend source of truth (Phase 2) in `ttyServer.js`.
- Two-tier rehydration with `xterm-addon-serialize` (Phase 3).
- Explicit sidecar `unsubscribe` API and destroy-only-on-close lifecycle (Phase 4).
- Context-loss → DOM fallback and global LRU graveyard for hidden xterm surfaces (Phase 5).
- Delete survivor recovery code after v2 path is proven (Phase 6).
- Durable `opencode` sessions using `--session` relaunch (Phase 7).
- Doc cleanup for drifted terminal docs (Phase 8).
- Runtime per-panel `terminal-engine-v2` flag for strangler migration.

### Out of Scope

- Electron or Go backend; Node PTY stays.
- Pizarra `CanvasTerminal` v2 migration — kept on legacy path.
- Hermes/Grok durable sessions.
- Wholesale port of waveterm's Go packages.

## Capabilities

### New Capabilities

- `terminal-engine-v2`: runtime per-panel flag and v1/v2 coexistence contract.
- `terminal-ring-buffer`: PTY output ring buffer + pub/sub subscribe/unsubscribe in the Node sidecar.
- `terminal-rehydration`: two-tier rehydration with `SerializeAddon` snapshot + delta replay.
- `terminal-lru-graveyard`: hidden surface registry, context-loss DOM fallback, destroy-only-on-close.
- `terminal-durable-opencode`: durable session restore for `opencode` via `--session`.

### Modified Capabilities

- `terminal-renderer-default`: remove VTE; xterm-only renderer list; v2 flag gates panel path.
- `canvas-terminal`: remove VTE imports/branch; pizarra stays legacy in v2.
- `session-restore`: extend `opencode-durable` classification with v2 restore metadata.

## Approach

Execute 9 phases in order `0 → (1 ‖ 2) → 3 → (4 + 5) → 6 → 7 → 8`.

| Phase | Deliverable                                   | Dependency             |
| ----- | --------------------------------------------- | ---------------------- |
| 0     | VTE removal (keep GTK/WebKitGTK for browser)  | —                      |
| 1     | Ring buffer + pub/sub                         | 0                      |
| 2     | Backend source of truth (termsize, OSC 7 cwd) | 0                      |
| 3     | Two-tier rehydration                          | 1 + 2                  |
| 4     | Sidecar `unsubscribe`; destroy-only-on-close  | 3                      |
| 5     | Context-loss → DOM + LRU graveyard            | 3                      |
| 6     | Delete survivor recovery code                 | 4 + 5 proven in builds |
| 7     | `opencode` durable sessions                   | 4                      |
| 8     | Doc cleanup                                   | 6 + 7                  |

Each phase lands as one PR in a feature-branch chain (`feature/terminal-engine-v2` tracker, each PR targets the previous).

## Assumptions

1. **LRU cap N=12 global** — DevHub panels outnumber waveterm tabs; per-workspace cap deferred.
2. **Ring buffer 2 MiB/session**; `cache:term:full` snapshot uses the same cap.
3. **OSC 7 via env vars + per-shell RC snippets** (`DEVHUB_SESSION_ID`, `DEVHUB_BLOCK_ID`) mirroring waveterm.
4. **Durable scope = `opencode` only** — it already supports `--session`; hermes/grok deferred.
5. **Pizarra canvas terminal out of v2** — `SharedTerminalSurface` singleton conflicts with LRU graveyard.
6. **Runtime per-panel flag** — enables panel-by-panel strangler migration; safer than build-time.

## Affected Areas

| Area                                           | Impact   | Description                                                        |
| ---------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `src/lib/terminal/ttyServer.js`                | Modified | Ring buffer, pub/sub, canonical termsize, OSC 7, unsubscribe API   |
| `src/components/TerminalTTY.jsx`               | Modified | v2 subscription, rehydration, context-loss path, recovery deletion |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Graveyard/LRU orchestration, v2 flag branching                     |
| `src/components/terminal/nativeLayoutSync.js`  | Removed  | Survivor recovery constants/scheduling                             |
| `src-tauri/src/native_vte.rs`                  | Removed  | VTE backend and command registrations                              |
| `src/lib/terminal/sessionStore.js`             | Modified | v2 rehydration metadata, opencode durable restore                  |
| `src/lib/terminal/terminalPanelBridge.js`      | Removed  | Replaced by rehydration cache                                      |

## Risks

| Risk                                                           | Likelihood | Mitigation                                                                 |
| -------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| Phase 1 duplicated/missed output during dual v1/v2 paths       | Med        | Strict subscriber routing; integration tests for ring buffer               |
| Phase 2 termsize authority race on mount                       | Med        | Server-stored size applied before first replay; test fast resize sequences |
| Phase 3 CPU cost of `SerializeAddon` every 100 KiB             | Med        | Benchmark busy terminal; defer snapshot frequency if needed                |
| Phase 4 unsubscribe API not decoupled from PTY kill            | High       | Add explicit `unsubscribe` message; integration test 1h timer behavior     |
| Phase 5 LRU evicts hidden panel PTY                            | Med        | State machine distinguishes hidden vs closed; test eviction paths          |
| Phase 6 deleting recovery before proven regresses black panels | High       | Gate behind v2 flag; QA sign-off on installed builds before removal        |
| Phase 7 hermes/grok session assumptions leak in                | Low        | Scope guard in spec; reject non-opencode durable PRs                       |

## Rollback Plan

- Revert the current phase PR in the feature chain.
- For Phase 0, restore `native_vte.rs` and VTE deps from git history; re-enable only if needed (not production today).
- For later phases, the runtime flag lets v1 panels continue working; disable v2 flag globally via one-line config if a phase regresses.

## Dependencies

- Add `@xterm/addon-serialize` to `package.json` (Phase 3).
- Tauri 2 / Node sidecar runtime unchanged.

## Success Criteria

- [ ] No VTE crates, files, or branches remain in production paths.
- [ ] v2 panels restore visible content after workspace switch without survivor recovery.
- [ ] Hidden v2 panels keep PTY alive for >1 hour without WebSocket.
- [ ] `opencode` sessions resume after app restart on installed builds.
- [ ] Existing v1 panels continue to work until explicitly migrated.

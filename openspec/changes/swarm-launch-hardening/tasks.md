# Tasks: swarm-launch-hardening

**Change**: `swarm-launch-hardening` | **Date**: 2026-06-08 | **Mode**: TDD-first | **Runner**: `npm test` (Jest 27) + `playwright test` | **Budget**: ≤ 800 net lines, single PR (C2)

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750–800 (16 surgical tasks) |
| 400-line budget risk | Medium (above default 400, inside project's 800 C2 budget) |
| Chained PRs recommended | No (C2 pre-approved) |
| Suggested split | Single PR; if apply lands > 800 lines, defer Phase 4 (CLI) |
| Delivery strategy | single-pr (C2) |
| Chain strategy | size:exception |
| TDD coverage | 16 / 16 tasks have a RED step |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size:exception
400-line budget risk: Medium

### Phase ordering rationale

- **Phase 1 (perf) FIRST** — launch-path timing changes; downstream tasks assume the new parallel + event-driven contract.
- **Phase 2 (buffer) SECOND** — regex extension lands before Phase 3; renderer demotion tests need a stable output stream.
- **Phase 3 (crash) THIRD** — depends on T3.1's capability module; `TUI_READY` gate depends on Phase 1's launch timing.
- **Phase 4 (CLI) LAST** — WIP finalization, cleanest slice to defer if the diff approaches 800 lines.

---

## Phase 1: Performance (5 tasks — target 14s → 4s)

- [ ] ### T1.1 — Parallel worktree creation

**Spec link**: R-PERF-1
**Files**: `src/lib/db/writeQueue.js:10-54`, `src/app/api/swarm/route.js:1203-1508`, `src/lib/swarm/agentWorkspaceManager.js:264-371`
**Phase**: 1

**Test (TDD)**:
- File: `tests/lib/db/writeQueue.enqueueMany.test.js`
- Test name: `'enqueueMany dispatches all items in one tick under contention'`
- Assertion: 5 jobs of varying cost (50ms / 200ms / 50ms / 1.8s / 50ms) all resolve before the slowest tail (≤ 2s wall-clock); internal counter hits 5 within a single microtask flush.

**Code**: add `enqueueMany(jobs)` to `writeQueue.js` (calls `enqueue` per job, returns `Promise.all`); in `route.js` replace per-role `await withDbWriteQueue(...)` with one `writeQueue.enqueueMany(roleJobs)`; in `agentWorkspaceManager.js` swap sequential `await` for `Promise.all` over role workers, each taking the per-role lock.

**Verify**: `npm test -- --testPathPattern=writeQueue|agentWorkspaceManager` + `time node scripts/verify-swarm-launch.mjs --preflight` (worktree p50 < 1.5s).

**Acceptance**: 5 worktrees < 2s wall-clock on Linux NVMe; per-role `await` count in `launchSwarmLocal` is exactly 1.

- [ ] ### T1.2 — Director event-driven fan-out

**Spec link**: R-PERF-2
**Files**: `src/lib/operations/swarmControl.js` (constants block with `DIRECTOR_FIRST_FANOUT_DELAY_MS`), `src/app/api/swarm/route.js:1351, 1376`, `sidecar-backend/server.js` (`director.ready` emit site)
**Phase**: 1

**Test (TDD)**:
- File: `tests/lib/operations/swarmControl.fanout.test.js`
- Test name: `'director.ready event triggers worker fan-out within 50ms'`
- Assertion: with a fake bus and a director emitting `director.ready` at t=200ms, 4 worker spawns are scheduled within 50ms; `setTimeout(4000)` is never called in the fan-out path.

**Code**: in `swarmControl.js` delete the constant and the `setTimeout` trigger; subscribe `bus.once('director.ready', () => fanOutWorkers())` in `startLaunch`. In `sidecar-backend/server.js` confirm `director.ready` is emitted on READY (add if missing).

**Verify**: `npm test -- --testPathPattern=swarmControl` + `rg "DIRECTOR_FIRST_FANOUT_DELAY_MS" src sidecar-backend` → 0 matches.

**Acceptance**: 0 occurrences of `DIRECTOR_FIRST_FANOUT_DELAY_MS`; director READY → 4 worker spawns scheduled < 50ms (p95 < 80ms).

- [ ] ### T1.3 — Promise.race batch deadline on director.prompted

**Spec link**: R-PERF-3
**Files**: `src/components/TerminalWorkspacesManager.jsx:216`, `src/lib/operations/swarmControl.js` (constants block with `SWARM_LAUNCH_BATCH_DEADLINE_MS`)
**Phase**: 1

**Test (TDD)**:
- File: `tests/components/TerminalWorkspacesManager.batchGate.test.jsx`
- Test name: `'batch gate releases on director.prompted event, not on flat timeout'`
- Assertion: bus emits `director.prompted` at t=180ms → gate resolves at ~180ms, abort timer cleared. Bus silent → gate rejects at exactly 8000ms with `LaunchAbort({ reason: 'director_ready_timeout' })`.

**Code**: in `TerminalWorkspacesManager.jsx` replace the `setTimeout` await with `await Promise.race([onceBus('director.prompted'), abortAfter(8000)])`; `abortAfter` is a local helper. Delete the `SWARM_LAUNCH_BATCH_DEADLINE_MS` constant in `swarmControl.js`.

**Verify**: `npm test -- --testPathPattern=TerminalWorkspacesManager` + `rg "SWARM_LAUNCH_BATCH_DEADLINE_MS" src` → 0 matches.

**Acceptance**: Worst-case gate = 8s timeout or `director.prompted` (typically < 200ms); abort carries the missing event name.

- [ ] ### T1.4 — Drop WS connect stagger

**Spec link**: R-PERF-4
**Files**: `src/lib/terminal/terminalConnectStagger.js:1`, `sidecar-backend/server.js` (`wss.on('connection')` handler)
**Phase**: 1

**Test (TDD)**:
- File: `tests/lib/terminal/terminalConnectStagger.test.js`
- Test name: `'5 simultaneous connect() calls all resolve within 200ms'`
- Assertion: with `SWARM_CONNECT_STAGGER_MS=0`, 5 parallel `connect()` calls reach `open` within 200ms total. The prior default (250ms stagger) is asserted > 1s to prove the stagger is gone.

**Code**: set `SWARM_CONNECT_STAGGER_MS = 0` in `terminalConnectStagger.js`; keep the module for back-compat. No functional change in `sidecar-backend/server.js` — event-loop fairness handles 5 simultaneous handshakes. Confirm no implicit serialization in `wss.on('connection')`.

**Verify**: `npm test -- --testPathPattern=terminalConnectStagger` + 5-WS burst via `scripts/verify-swarm-launch.mjs` reports `connect_to_open_p95 < 200ms`.

**Acceptance**: 5 WS handshakes < 200ms total (p95 < 250ms).

- [ ] ### T1.5 — Wrapper bash cache

**Spec link**: R-PERF-5
**Files**: `src/lib/agentLaunchWrapper.js` (`buildAgentLaunchWrapper` + cache key)
**Phase**: 1

**Test (TDD)**:
- File: `tests/lib/agentLaunchWrapper.cache.test.js`
- Test name: `'2 consecutive wrapper builds share a SHA1 cache key, second call is < 10ms'`
- Assertion: with a pre-seeded cache file, the second `buildAgentLaunchWrapper({ launchId, role: 'architect' })` returns in < 10ms; both calls produce a wrapper whose first 4KB is byte-identical; cache key is SHA1 of the static portion.

**Code**: factor the static template (bus-helpers, identity, heartbeat, exit-trap prologue) into `STATIC_WRAPPER_PREFIX`. First call writes to `__dirname/.cache/wrapper-bash-v1.bash` keyed by `sha1(STATIC_WRAPPER_PREFIX)`; subsequent calls read from disk and append only the per-launch variable block (≤ 1KB). GC stale `.cache/wrapper-bash-v1.*.bash` on first-launch prune.

**Verify**: `npm test -- --testPathPattern=agentLaunchWrapper` + 5-role build via `scripts/verify-swarm-launch.mjs` logs `wrapper_build_total_ms < 100` after first launch.

**Acceptance**: 5 wrapper builds < 100ms total (down from ~750ms); cache key is content-addressed (SHA1).

---

## Phase 2: Buffer & Prompt Overflow (4 tasks)

- [ ] ### T2.1 — Extend noise filter regex (CSI + DECRQM/DECRPM)

**Spec link**: R-BUF-1
**Files**: `src/lib/terminal/terminalNoiseFilter.js:35`, `sidecar-backend/sessionTransport.js:13` (CJS mirror)
**Phase**: 2

**Test (TDD)**:
- File: `tests/lib/terminal/terminalNoiseFilter.decsrq.test.js`
- Test name: `'strips DECRPM, DA, DSR, CPR, DECRQM reports from chunked output'`
- Assertion: parametrized pairs — `ESC[?2027$y` → ``, `ESC[?35;60;4$y` → ``, `ESC[5n` → ``, `ESC[6n` → ``, `ESC[>0;0;0c` → ``, `ESC[?1;2c` → ``, `ESC[?1;2R` → ``, `ESC[35;60;4M` → ``, `ESC[?2027$p` → ``. Empty strip returns `null` (R-BUF-1 no-zero-write contract).

**Code**: in `terminalNoiseFilter.js` replace `[cnR]` with `(?:\x1b\[\?(?:\d+;)*\d+[cnRM]|\x1b\[>(?:\d+;)*\d+c|\x1b\[(?:\d+;)*\d+[nR]|\x1b\[(?:\d+;)*\d+\$p|\x1b\[\?(?:\d+;)*\d+\$[sp])`. Add a regression test for the literal `[[35;60;4M`. Mirror the regex in `sidecar-backend/sessionTransport.js`; assert byte-identical.

**Verify**: `npm test -- --testPathPattern=terminalNoiseFilter|sidecar-sessionTransport` + replay the recorded 5-pane capture through the filter.

**Acceptance**: `[[35;60;4M` is stripped, never leaks; 0 regressions on existing 12 cases.

- [ ] ### T2.2 — Director prompt chunking via tmux

**Spec link**: R-BUF-3
**Files**: `src/lib/agentLaunchWrapper.js:530-543` (`injectDirectorPrompt`)
**Phase**: 2

**Test (TDD)**:
- File: `tests/lib/agentLaunchWrapper.injectDirectorPrompt.test.js`
- Test name: `'splits a 24KB prompt into 12 chunks of <= 2KB with 16ms pacing'`
- Assertion: 24,576-byte input → 12 `load-buffer` + 12 `paste-buffer -d` calls; each chunk ≤ 2048 bytes; inter-chunk delay 16ms ± 2ms (fake clock); 128KB input aborts with `PromptTooLargeError` before the chunk loop.

**Code**: replace the single `tmux load-buffer -S 5242880` + `paste-buffer -d` pair with a chunking loop — split on `\n\n`, cap at 2048 bytes, pace 16ms via `setTimeout`-awaited promise, abort at 64 chunks with `PromptTooLargeError`. Export `CHUNK_BYTES_MAX=2048`, `CHUNK_PACING_MS=16`, `CHUNK_CAP=64` for tests.

**Verify**: `npm test -- --testPathPattern=agentLaunchWrapper` + `scripts/verify-swarm-launch.mjs` reports `inject_chunks_per_launch=12` and `inject_total_ms ≈ 192` (±24ms).

**Acceptance**: 24KB prompt → 12 chunks, no overflow; 128KB+ aborts with `PromptTooLargeError`.

- [ ] ### T2.3 — Per-pane scrollback config

**Spec link**: R-BUF-4
**Files**: `src/components/TerminalTTY.jsx` (xterm `useEffect`), `src/components/TerminalWorkspacesManager.jsx` (parent `useRef` for 5 instances)
**Phase**: 2

**Test (TDD)**:
- File: `tests/components/TerminalTTY.scrollback.test.jsx`
- Test name: `'5 panes with scrollback=5000 do not throw QuotaExceededError'`
- Assertion: mount 5 `<TerminalTTY>` with `scrollback: 5000`; write 6000 lines to each; each `term.buffer.active.length` ≤ 5000; no `QuotaExceededError`; `term.options.scrollback === 5000` per-instance (mutate one, assert others unchanged).

**Code**: in `TerminalTTY.jsx` pass `scrollback: 5000` to the `Terminal` constructor inside `useEffect`; do NOT mutate `Terminal.prototype.options` or any global — per-instance only. In `TerminalWorkspacesManager.jsx` confirm 5 instances in a `useRef` array (not a shared config); add `data-pane-id` for the demotion hook.

**Verify**: `npm test -- --testPathPattern=TerminalTTY|TerminalWorkspacesManager` + launch 5-pane swarm, `cat /dev/urandom | head -n 6000`, observe `term.buffer.active.length` ≤ 5000 in DevTools.

**Acceptance**: 5 panes × 5000-line scrollback, total 25K lines, no quota error; `scrollback` is per-instance.

- [ ] ### T2.4 — Lock file dedup across preflight

**Spec link**: R-PERF-1 (extension) + REQ-CLI-VERIFY-1
**Files**: `src/lib/agentLaunchCommand.js` (inline lock creation), new `src/lib/swarm/bootstrapLock.js`
**Phase**: 2

**Test (TDD)**:
- File: `tests/lib/swarm/bootstrapLock.test.js`
- Test name: `'2 swarm-verify --preflight runs on the same missionId reuse the lock'`
- Assertion: with tmp lock path, two parallel `acquireBootstrapLock({ missionId, role })` calls share the lock (second observes holder PID, waits ≤ 200ms); after release, third call acquires fresh; holder writes `<role>.injected` sentinel; preflight reads it and skips injection.

**Code**: new `src/lib/swarm/bootstrapLock.js` exports `acquireBootstrapLock({ missionId, role })` and `releaseBootstrapLock(lock)`. Lock path: `/tmp/devhub-bootstrap-${missionId}-${role}.lock`. Holder writes `<role>.injected` into the launch record dir. `agentLaunchCommand.js` imports the helper (delete inline lock); `scripts/verify-swarm-launch.mjs` preflight reads the sentinel and skips injection.

**Verify**: `npm test -- --testPathPattern=bootstrapLock|agentLaunchCommand` + run preflight twice in 2s; second logs `preflight: 0 injections (cached)`.

**Acceptance**: Preflight is idempotent for the same `missionId`; two parallel callers on `(missionId, role)` share the lock.

---

## Phase 3: Crash Recovery (5 tasks)

- [ ] ### T3.1 — Renderer capability module finalization

**Spec link**: R-CAP-1, R-CAP-2, R-CAP-3, R-CAP-4
**Files**: `src/lib/terminal/terminalRendererCapabilities.js` (scaffolded by WIP — finalize public surface)
**Phase**: 3

**Test (TDD)**:
- File: `tests/lib/terminal/terminalRendererCapabilities.test.js`
- Test name: `'register({name, addons, detect, onLost}) stores a renderer adapter'`
- Assertion: with mock adapter `{ name: 'mock', addons: [mockAddon], detect: () => true, onLost: jest.fn() }`, `register(mock)` stores it; `detectCurrent()` returns `{ renderer: 'mock', confidence: 1 }`; `getActiveRenderer()` returns the same; `demote('mock', 'test')` transitions to next lower tier (or no-op if no next); `onLost` invoked on fake `webglcontextlost`.

**Code**: ensure `terminalRendererCapabilities.js` exports `register`, `detectCurrent`, `demote`, `getActiveRenderer`. WIP delivers the scaffold; this task finalizes the public surface and the demotion chain (`webgl → canvas2d → dom`). Detection runs **once per launch mount** (R-CAP-4); result is shared via a closure-scoped cache for the launch's lifetime.

**Verify**: `npm test -- --testPathPattern=terminalRendererCapabilities` + `rg "xterm-addon-webgl|xterm-addon-canvas|fit-addon" src/lib/terminal/terminalRendererCapabilities.js` → 3 matches (module is the only importer).

**Acceptance**: Module is the only place that imports xterm addons; 5-pane mount invokes probe exactly once (asserted in T3.2).

- [ ] ### T3.2 — Renderer NFR lint (no direct xterm imports in launch path)

**Spec link**: R-CAP-1 (NFR), R-CRASH-1
**Files**: new `tests/lint/rendererImports.test.js`
**Phase**: 3

**Test (TDD)**:
- File: `tests/lint/rendererImports.test.js`
- Test name: `'the 5 launch-path files have ZERO direct xterm-addon imports'`
- Assertion: greps (via `node:fs` + regex) the 5 files — `src/lib/operations/swarmControl.js`, `src/components/TerminalWorkspacesManager.jsx`, `src/lib/swarm/agentWorkspaceManager.js`, `sidecar-backend/server.js`, `src/app/api/swarm/route.js` — for `xterm-addon-webgl`, `xterm-addon-canvas`, `xterm-addon-fit`, `xterm-webgl`, `xterm-canvas`. Fails the test on any match.

**Code**: new `tests/lint/rendererImports.test.js` — single jest test using `fs.readFileSync` + regex. No shell out, no eslint plugin — fast, dep-free. `.eslintrc.cjs` adds a `no-restricted-imports` rule for the 5 files; jest is the runtime guard, eslint is the editor-time guard.

**Verify**: `npm test -- --testPathPattern=lint/rendererImports` + `rg "xterm-addon" src/lib/operations/swarmControl.js` → 0 matches.

**Acceptance**: Lint passes; 5 files have ZERO xterm-addon imports; test runs < 50ms.

- [ ] ### T3.3 — PTY spawn serialization in ttyServer

**Spec link**: R-CRASH-2
**Files**: `src/lib/terminal/ttyServer.js` (`wss.on('connection')`, `pty.spawn` callsite)
**Phase**: 3

**Test (TDD)**:
- File: `tests/lib/terminal/ttyServer.spawn.test.js`
- Test name: `'5 simultaneous connection events do not block the event loop > 50ms'`
- Assertion: with a fake `wss` firing 5 `connection` events in the same tick and a fake `pty.spawn` taking 80ms, the event loop is yielded between spawns (verified via `setImmediate` interleaving). Total wall-clock < 250ms. Longest single tick (via `perf_hooks.monitorEventLoopDelay`) < 50ms.

**Code**: in `ttyServer.js` wrap `pty.spawn` in `setImmediate` and throttle to 2 concurrent via a small in-process semaphore (counter + queue). 3rd–5th spawns queue behind the semaphore.

**Verify**: `npm test -- --testPathPattern=ttyServer` + `node scripts/verify-swarm-launch.mjs --preflight` logs `event_loop_max_block_ms < 50`.

**Acceptance**: 5 PTY spawns < 250ms total; event loop responsive (no block > 50ms).

- [ ] ### T3.4 — Watchdog with 1-respawn budget

**Spec link**: R-CRASH-3, REQ-LH-2
**Files**: `src/lib/terminal/ttyServer.js` (in-memory `watchdog` table), `src/components/TerminalWorkspacesManager.jsx` (banner)
**Phase**: 3

**Test (TDD)**:
- File: `tests/lib/terminal/ttyServer.watchdog.test.js`
- Test name: `'1st unexpected PTY exit auto-respawns; 2nd surfaces banner, no respawn'`
- Assertion: with `watchdog[launchId][role] = { respawnCount: 0, lastExitAt: null }`, first `pty exit` within 60s of `READY` triggers a respawn (spy on `pty.spawn`) and increments `respawnCount` to 1. Second `pty exit` does NOT trigger a respawn and emits `recoverable_error` on the WS. A second launchId's budget is unaffected by launch A's death (LH-S5).

**Code**: in `ttyServer.js` add `const watchdog = new Map()` keyed by `launchId`, then by `role`, value `{ respawnCount, lastExitAt, readyAt }`. On `pty.on('exit')`, check `Date.now() - readyAt < 60_000`; if `respawnCount < 1`, schedule a respawn within 1s. Otherwise emit `recoverable_error` on the WS. In `TerminalWorkspacesManager.jsx` add `RecoverableErrorBanner` rendered on `recoverable_error`; dismissable, persists across renders.

**Verify**: `npm test -- --testPathPattern=ttyServer|TerminalWorkspacesManager` + `kill -9 <pid>` on devops PTY; observe one auto-respawn, banner on 2nd kill.

**Acceptance**: Respawn budget = 1 per `launchId` per `role`; launchIds do not share budgets; launch JSON records `watchdog_exhausted: true` on 2nd death.

- [ ] ### T3.5 — TUI readiness gate (fix the 45s pgrep)

**Spec link**: R-CRASH-4, REQ-LH-1
**Files**: `src/lib/agentLaunchWrapper.js:515-526` (`buildTuiWaitForBlock` pgrep loop), `src/lib/agentLaunchCommand.js:1015` (dead `tuiReadyGraceMs = 10000`)
**Phase**: 3

**Test (TDD)**:
- File: `tests/lib/agentLaunchWrapper.tuiReady.test.js`
- Test name: `'wrapper emits [TUI_READY] and agentLaunchCommand.js resolves within 10s grace'`
- Assertion: wrapper emits `[TUI_READY]` at t=1400ms → spawn gate resolves at ~1400ms; 10s safety timer cleared; no `pgrep` syscall (verified via child-process spy). Silent wrapper → gate aborts at exactly 10000ms with `LaunchAbort({ reason: 'tui_ready_timeout' })`.

**Code**: in `agentLaunchWrapper.js` replace the `pgrep` loop in `buildTuiWaitForBlock` with a `readline` interface over wrapper stdout; on the literal line `[TUI_READY]`, resolve; in parallel, `setTimeout(10000)` rejects with `LaunchAbort({ reason: 'tui_ready_timeout' })`. In `agentLaunchCommand.js` import the dead `tuiReadyGraceMs` (line 1015) and pass it to `buildTuiWaitForBlock`; export as env-overridable knob (`DEVHUB_TUI_READY_GRACE_MS`). `.eslintrc.cjs` adds a `no-restricted-syntax` rule blocking the literal `pgrep` token in both files.

**Verify**: `npm test -- --testPathPattern=agentLaunchWrapper|agentLaunchCommand` + `rg "pgrep" src/lib/agentLaunchWrapper.js src/lib/agentLaunchCommand.js` → 0 matches.

**Acceptance**: NO `pgrep` in the wrapper path; `tuiReadyGraceMs` is actually used (env-overridable); 45s wait collapses to < 1.5s on a healthy TUI.

---

## Phase 4: CLI (3 tasks — finalize WIP)

- [ ] ### T4.1 — `swarm-verify` exit code contract

**Spec link**: REQ-CLI-VERIFY-1
**Files**: `devhub-cli/cli.js` (WIP), `scripts/verify-swarm-launch.mjs`
**Phase**: 4

**Test (TDD)**:
- File: `tests/scripts/verify-swarm-launch.exitCodes.test.js`
- Test name: `'exits 0 on pass, 1 on fail, 2 on missing logs'`
- Assertion: spawn `node scripts/verify-swarm-launch.mjs` against three fixtures (pass / fail / empty logs dir); assert exit codes 0, 1, 2; assert stdout contains `verify: ok` / `verify: failed` / `ERROR: launch logs not found`.

**Code**: finalize the WIP exit code contract in `scripts/verify-swarm-launch.mjs` — add typed codes 0/1/2/3, document each in the file header. In `devhub-cli/cli.js` confirm `swarm-verify` re-exports the preflight exit code verbatim; add a comment linking to `REQ-CLI-VERIFY-1`.

**Verify**: `npm test -- --testPathPattern=verify-swarm-launch` + `devhub swarm-verify --preflight` then `echo $?` → 0 on green.

**Acceptance**: Exit 0/1/2 per LH-CV-1/2/3; no regression in WIP's CLI surface.

- [ ] ### T4.2 — `swarm-evidence` tarball schema

**Spec link**: REQ-CLI-VERIFY-2
**Files**: `devhub-cli/cli.js` (WIP), `scripts/collect-swarm-launch-evidence.mjs`
**Phase**: 4

**Test (TDD)**:
- File: `tests/scripts/collect-swarm-launch-evidence.schema.test.js`
- Test name: `'tarball contains launch.json, role logs, crash dumps, capabilities.json'`
- Assertion: build tarball from a fixture launch; extract to tmp; assert `launch.json`, `roles/{director,architect,implementer,reviewer,devops}.log`, `capabilities.json` exist. If a crash was recorded, assert at least one `crashes/*.dump`. `launch.json` parses and contains `renderer_demotions`.

**Code**: finalize the WIP tarball layout in `scripts/collect-swarm-launch-evidence.mjs` — output `./evidence/<launchId>.tar.gz`; `launch.json` includes `renderer_demotions` (LH-CE-1). `devhub-cli/cli.js` adds exit code 3 for `ERROR: launch <id> not found` (LH-CE-2).

**Verify**: `npm test -- --testPathPattern=collect-swarm-launch-evidence` + `devhub swarm-evidence --launch <id>` then `tar -tzf ./evidence/<id>.tar.gz`.

**Acceptance**: Tarball contains 4 schema paths; exit 0 on success, 3 on missing launchId.

- [ ] ### T4.3 — `swarm-logs --list` contract

**Spec link**: REQ-CLI-VERIFY-3
**Files**: `devhub-cli/cli.js` (WIP)
**Phase**: 4

**Test (TDD)**:
- File: `tests/devhub-cli/swarm-logs.list.test.js`
- Test name: `'--list returns one line per launchId, sorted by recency'`
- Assertion: seed a fake launches dir with 3 records (1h, 10m, just now); `devhub swarm-logs list` → 3 lines matching `<launchId> <status> <started-at> <role-count>`, sorted by `started-at` descending. Empty dir → stdout exactly `No launches found`, exit 0.

**Code**: finalize the WIP's `swarm-logs list` subcommand in `devhub-cli/cli.js` — sort by `started-at` descending; empty case: literal `No launches found`.

**Verify**: `npm test -- --testPathPattern=swarm-logs` + `devhub swarm-logs list` against a real dir, pipe to `head -3`.

**Acceptance**: `--list` returns launchIds sorted by recency (LH-CL-1); empty dir prints `No launches found`, exit 0 (LH-CL-2).

---

## Summary

- 16 tasks across 4 phases
- 100% TDD coverage
- Phase 1 + 2 target the ~14s → 4s latency cut
- Phase 3 closes the 45s pgrep wait and bounds post-launch crashes
- Phase 4 is the cheapest defer candidate if the diff approaches 800 lines
- Single PR; if apply lands > 800 net lines, defer Phase 4 (T4.1–T4.3) to a follow-up

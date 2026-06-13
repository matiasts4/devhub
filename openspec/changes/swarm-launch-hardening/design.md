# Design: swarm-launch-hardening

## 1. Context

The 5-role swarm launch in the DevHub desktop app currently exhibits three concrete failures observed against `src/app/api/swarm/route.js` (the `launchSwarmLocal` path at lines 1203-1508): ~12.7s wall-clock from click to all 5 prompts visible, director system-prompt escape sequences (the DECRPM `[[35;60;4M^...` family) leaking into the architect pane, and random crashes in architect/devops 5-30s after launch. The desktop app's working tree currently carries a 48-file `WIP: pre-sdd-batch 2026-06-08` batch — header-isolated, with a fresh `terminalRendererCapabilities.js` module, a stricter noise filter base, and a sidecar watchdog scaffold. This change lands **on top of** that WIP batch: it does not touch any of the 48 files, and it consumes the WIP's new surface area. Stack: Next.js 16 + React 19, Tauri 2 with a Node sidecar at `sidecar-backend/server.js`, xterm 5 in `src/components/TerminalTTY.jsx`, tmux for prompt injection. The launch orchestrator's only public consumer is the desktop route handler; the change is single-host and offline.

## 2. Goals / Non-Goals

**Goals**
- p95 5-role launch wall-clock < 4s (50-launch sample, `scripts/verify-swarm-launch.mjs`).
- Zero `[[\d+;\d+;\d+M` prompt-leak observations over 10 launches.
- Zero unexpected pane crashes (architect/devops) over 10 launches.
- Renderer swap (e.g. future `native-vte`) is a 1-file change: a new adapter + one `register()` call.
- Net diff ≤ ~800 lines (single-PR, C2 delivery).

**Non-Goals**
- New agent types, new roles, new mission shapes.
- Changing the director system-prompt content.
- Changing CLI surface beyond the three subcommands the spec already enumerates (`swarm-verify`, `swarm-evidence`, `swarm-logs list`).
- Cross-host fan-out, online multi-host orchestration, or session restore on relaunch.
- The 48-file WIP batch itself: this change consumes the WIP's API and is forbidden from editing those files.

## 3. Decisions

### 3.1 Perf Budget & Validation Strategy

**Target**: 4.0s p95 from "click launch" to "all 5 prompts visible to user". **Current measured**: ~12.7s decomposed as server 6.5s + batch 4.5s + stagger 1.2s + mount 0.5s (single NVMe host, cold launch).

**Validation**: `scripts/verify-swarm-launch.mjs` runs 50 launches and reports p50/p95/p99. Budget is parameterized via `PERF_BUDGET_MS` env var; default 4000. The script is invoked by `devhub swarm-verify --preflight` (REQ-CLI-VERIFY-1, exit 0 on pass, 1 on fail). The proposal notes there is no CI today — the realistic gate is a local preflight hook in `.husky/pre-push` plus a documented `npm run verify:swarm` script. **Decision**: ship a local preflight gate (no CI assertion) and document the manual run in `CONTRIBUTING.md`; revisit CI when a hosted runner is provisioned.

**Bottleneck-by-bottleneck decisions** (WHAT / WHERE / HOW / EXPECTED saved ms):

| # | WHAT | WHERE | HOW | Saved |
|---|------|-------|-----|-------|
| B1 | Parallel worktree+DB write | `src/lib/db/writeQueue.js:10-54` exposes `enqueueMany`; `src/app/api/swarm/route.js:1203-1508` calls it once with 5 role records | Replace the per-role `enqueue(...)` loop with a single `enqueueMany(roles)` call; each worker still takes the lock for its own write, but the queue dispatches them in parallel | ~5.0s |
| B2 | Director event-driven fan-out | `src/lib/operations/swarmControl.js` (constants block holding `DIRECTOR_FIRST_FANOUT_DELAY_MS=4000`) | Delete the constant. Subscribe `bus.once('director.ready', () => fanOutWorkers())` in the launch orchestrator. Fan-out fires when the director's `READY` event arrives, not on a timer | ~4.0s |
| B3 | Promise.race batch gate | `src/lib/operations/swarmControl.js` (constants block holding `SWARM_LAUNCH_BATCH_DEADLINE_MS=4500`) | Delete the constant. Replace the awaited deadline with `await Promise.race([bus.once('director.ready'), abortAfter(8000)])` where `abortAfter` is a `setTimeout` rejected with a typed `LaunchAbort` carrying `reason: 'director_ready_timeout'` | ~3.7s |
| B4 | Drop WS stagger | `src/lib/terminal/terminalConnectStagger.js` | Remove `SWARM_CONNECT_STAGGER_MS`; let the 5 WS clients race. OS event loop fairness is sufficient. Acceptable cost: a one-tick reordering on cold WS handshakes | ~1.2s |
| B5 | Wrapper bash cache | `src/lib/agentLaunchWrapper.js` (the `buildAgentLaunchWrapper` function assembling the 6-10KB bash) | Cache the static portion at `__dirname/.cache/wrapper-bash-v1.bash` keyed by SHA1 of the static template; instance-id hash identifies the per-launch variable block. First-launch prime is implicit; subsequent reads hit the cache | ~150ms |

**Cumulative**: ~14s of slack against a 12.7s measured baseline. Headroom against the 4s budget is ~3.4x worst-case (B1+B2+B3 dominate); B4/B5 are quality-of-life.

### 3.2 Buffer & Prompt Injection Strategy

**Confirmation**: The director prompt is injected via tmux `paste-buffer` (already in `src/lib/agentLaunchWrapper.js:530-543`), **not** `term.paste`. The design preserves this. The chunking layer sits in front of `paste-buffer`, not the xterm input pipe.

**Chunking algorithm** (in `injectDirectorPrompt`):
1. Split on `\n\n` boundaries (paragraph granularity preserves prompt structure).
2. Cap each chunk at 2048 bytes; merge the trailing partial into the previous chunk.
3. For each chunk: `tmux load-buffer -S 0 -` with the chunk on stdin, then `tmux paste-buffer -d`; pace 16ms ±2ms between `paste-buffer` invocations via `setTimeout`-awaited promise.
4. Cap total chunks at 64 (≥ 128KB prompts abort with a typed error before the chunk loop).
5. Empty chunks short-circuit to `null` (R-BUF-1 contract: never write zero bytes).

**Lock file** at `/tmp/devhub-bootstrap-${missionId}-${role}.lock` already deduplicates same-launch concurrent injects. Extend scope: also dedupe across `swarm-verify --preflight` runs. The lock holder writes a `<role>.injected` sentinel into the launch record dir; the preflight checks the sentinel and skips the injection step.

**Output filter regex** (`SHELL_TERMINAL_RESPONSE_RE` in `src/lib/terminal/terminalNoiseFilter.js`):
- Current: `[cnR]` — covers `CSI[?...c` (DA), `CSI[?...n` (DSR), `CSI[?...R` (CPR).
- New: `[cnRM]` (add `M` for `CSI?...M` which is the DECRPM terminator misread) **and** `\$[0-9;]*p` to cover the DECRQM/DECRPM request terminator.
- Test matrix: focus event from OpenCode TUI (`CSI?...R`), `CSI?2027$y` (DECRPM mode query), `CSI?35;60;4$y` (the specific bug — must be stripped, not echoed), `CSI5n` (DSR), `CSI6n` (cursor position report), `CSI>0;0;0c` (DA2 reply).

**Per-pane scrollback**: 5000 lines per pane, set via the `scrollback` xterm constructor option. **No** global xterm option mutation. `TerminalTTY.jsx` instantiates a fresh `Terminal({ scrollback: 5000 })` per pane; the parent `TerminalWorkspacesManager.jsx` holds the 5 instances in `useRef`, never in a shared config object.

### 3.3 Crash Recovery Watchdog

**Architecture**: in-memory `Map<launchId, Map<role, { respawnBudget, lastExit, readyAt }>>` in `sidecar-backend/server.js`. No persistence. Eviction on `launch.done` or after 10 minutes of inactivity.

**Respawn policy**: `(launchId, role)` budget = 1. First unexpected exit within the launch window (default 60s after `READY`) → respawn within 1s. Second exit → no respawn; emit `recoverable_error` on the WS; the renderer surfaces a banner in `TerminalWorkspacesManager.jsx`. Budget is **per `launchId`**, never global (R-CRASH-3 / LH-S5).

**PTY spawn serialization**: in `sidecar-backend/server.js`'s `wss.on('connection')` handler, replace the inline `pty.spawn(...)` with a semaphore-bounded queue: max 2 concurrent spawns, the rest queued behind a `setImmediate`. Yields the event loop between spawns; under a 5-WS burst, no event-loop block exceeds 50ms (LH-R-CRASH-2).

**WebGL demotion** (R-CRASH-1, R-CAP-3): `webgl → canvas2d → dom` is a state diff on the **same** `Terminal` instance. The capability module emits a demotion event; the launch orchestrator's registered demotion hook (REQ-LH-3) calls `xterm.webgl.dispose()` then `xterm.loadAddon(canvas2dAddon)` in the same tick. Scrollback and selection state are preserved because the `Terminal` instance is reused. Synthetic test: dispatch a `webglcontextlost` event on the test mount; assert the addon swap, the scrollback length, and the absence of a remount via a `key=` ref that the test holds constant.

### 3.4 Terminal Renderer Capability Interface

**Public surface** (in `src/lib/terminal/terminalRendererCapabilities.js` — already scaffolded by the WIP batch):

```
terminalRendererCapabilities = {
  detectCurrent(): { renderer, confidence },
  register(adapter: { name, addons, detect, onLost }),
  demote(fromName, reason): { renderer, addons },
  getActiveRenderer(): { name, addons },
}
```

**Critical NFR (R-CAP-1)**: **No** direct `xterm-webgl` / `xterm-canvas2d` / `fit-addon` imports in:
- `src/lib/operations/swarmControl.js`
- `src/components/TerminalWorkspacesManager.jsx`
- `src/lib/swarm/agentWorkspaceManager.js`
- `sidecar-backend/server.js`
- `src/app/api/swarm/route.js` (launch path only)

Lint enforcement: an ESLint `no-restricted-imports` rule restricted to those five files, with a custom error message pointing to `terminalRendererCapabilities`. The rule lives in `.eslintrc.cjs` (already configured for similar restrictions); the new entries are part of this change.

**Registration contract**: `{ name, addons, detect(): boolean, onLost(handler): unsubscribe }`. New renderer = one new file + one `register()` call at module init. Zero changes in consumer code (R-CAP-2).

**Detection order**: `webgl → canvas2d → dom`. Demotion is automatic on `webglcontextlost`; manual on user pref (e.g. `?renderer=canvas2d` query param). The capability probe runs **once per launch mount** (R-CAP-4), result is shared via `TerminalRendererContext` (React context, the launch orchestrator provides it on mount). Per-pane probes are forbidden — the test asserts the probe function is called exactly once across a 5-pane mount.

**Telemetry**: every demotion emits `renderer_demoted { from, to, panelId, reason, at }`; the launch recorder folds these into the `renderer_demotions` array on the launch JSON (LH-S7).

### 3.5 TUI Readiness Gate (fixes the pgrep 45s timeout)

**Root cause**: `src/lib/agentLaunchWrapper.js:515-526` shells `pgrep` and polls every 250ms for up to 45s. Under contention (cold LFS, slow `pnpm` link), the wait dominates and is the trigger for downstream crashes.

**Replacement**: the wrapper itself emits `[TUI_READY]` to its own log stream when its embedded `tui` subshell reaches the prompt. `src/lib/agentLaunchCommand.js` (the spawn gate) watches the wrapper's stdout stream line-by-line (already streamed to a `readline` interface). On the literal line `[TUI_READY]`, the gate resolves. A `setTimeout(10000)` in parallel is the safety net; on fire, it rejects with `LaunchAbort('tui_ready_timeout')`.

**No `pgrep`**: the contract (LH-S3, R-CRASH-4) is explicit — `buildTuiWaitForBlock` no longer shells out. CI lint rule: `no-restricted-syntax` blocks the literal `pgrep` token in `agentLaunchWrapper.js` and `agentLaunchCommand.js`.

**Grace period**: 10s, exposed as `tuiReadyGraceMs = 10000` in `agentLaunchCommand.js`; configurable per env for the preflight (`DEVHUB_TUI_READY_GRACE_MS=10000`).

## 4. Risks & Trade-offs

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| WebGL capability detection differs between Linux WebKitGTK and macOS WebView | Med | Probe runs in `try/catch` with a `confidence` field; below 0.7 falls back to canvas2d. The WIP batch's probe already does this; we re-verify in the preflight |
| Parallel worktree creation stresses pnpm/git LFS under bursty launches | Low | Throttle to 3 concurrent worktree creations with a small in-process semaphore in `agentWorkspaceManager.js`; the 4th and 5th queue |
| Wrapper bash cache invalidation on package upgrade | Med | Cache key = SHA1 of the static portion of the template. `buildAgentLaunchWrapper` computes the hash on import and bumps a `.cache/wrapper-bash-v1.<hash>.bash` filename; stale files are GC'd at first-launch prune |
| Watchdog respawn masks real bugs | Med | 1-respawn budget + banner surfaces persistent issues. Telemetry records both the death and the respawn; the `swarm-evidence` tarball includes the crash dump |
| Net diff > 800-line PR budget | Med | Surgical: the chunked paste-buffer and the regex extension are small; the watchdog table is ~60 lines; the wrapper cache is ~40. Defer surface-registry work to a follow-up change |

## 5. Migration Plan

- **Phase 1 (this change)**: ship the 6 specs (4 new + 2 delta). TDD-first: jest tests land before the implementation in each PR slice.
- **Phase 2 (hard dependency)**: the 48-file `WIP: pre-sdd-batch 2026-06-08` batch must be clean and committable. This change lands **after** that batch is committed; the WIP's `terminalRendererCapabilities.js`, stricter `terminalNoiseFilter.js`, and sidecar watchdog scaffold are the API surface we consume.
- **Phase 3 (out of scope)**: native-vte renderer registration, multi-launch concurrency above 2, cross-host fan-out, session restore.

Rollback is a single revert of the merge commit. The WIP batch stays untouched (header-isolated). Watchdog state is in-memory; no schema migration.

## 6. Open Questions

- **Exit code 2 for `swarm-verify`** when the launches log dir is absent: should that be a warning (exit 0) on a fresh install? Spec says exit 2; a fresh desktop install always hits this. Lean toward exit 0 + a `WARN: no launch history yet` line; revisit if a "must have logs" semantic is needed.
- **Watchdog persistence across app restarts**: currently in-memory. If the user force-quits during the 60s launch window, the respawn budget is lost. Acceptable for v1; revisit when offline-resume ships.
- **Renderer demotion reversibility**: spec says one-way `webgl → canvas2d → dom` per launch. Should we allow re-promotion (e.g. on a successful context-restored event)? Current design: no, one-way, per-launch. State lives in the capability module; the launch recorder logs the demotion but does not consume it.
- **Chunk cap of 64**: 128KB prompts are uncommon for director system prompts (current 24KB). Is 64 the right number, or should it be parameterized via `DEVHUB_PROMPT_CHUNK_MAX`?
- **`enqueueMany` API surface**: the proposal assumes `writeQueue.js` already exposes `enqueueMany`. The WIP batch is the place to add it. If the WIP doesn't ship `enqueueMany`, this change adds it (small ~15-line addition, scoped to B1).

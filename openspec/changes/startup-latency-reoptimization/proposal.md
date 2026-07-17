# Proposal: startup-latency-reoptimization

## Intent

Cut perceived and measured latency from **app launch → Terminales usable**, and secondary cold paths (first panel, first PTY, route return). Evaluate and ship a **tiered warm-up** so heavy terminal infrastructure is ready _before_ the user opens `/terminales`, without regressing the WebKitGTK / offscreen-mount crash class already documented.

## Why now

- First visit to Terminales still pays the full cold bill: mount `TerminalWorkspacesManager`, hydrate state, start TTY sidecar, create xterm/WebGL, restore sessions.
- After the first visit, `terminalManagerEverMounted` already keeps the manager warm off-route — but **nothing warms before that first visit**.
- Related work (`terminal-engine-v2`, session restore, Option B keep-alive) improves _stay-warm_ and _rehydrate_; this change owns _get-warm-early_.
- Operators feel “Terminales tarda demasiado en iniciar” every cold open; that is the product pain this SDD targets.

## Scope

### In scope

1. **Baseline + continuous metrics** for startup and Terminales first-paint / first-interactive.
2. **Dependency modernization** (waved): Next/React/Tauri patches, `@xterm/*` migration, tooling (Jest), selected majors later — see `research.md`.
3. Verify / keep **Turbopack** on the Next 16 path (dev + build) as part of load/build quality.
4. **Tiered preload policy** after project workspace is ready (idle / after-first-paint), not blind eager mount.
5. Warm **TTY sidecar** (`ensureTTYServer`) and related Node/PTY readiness without spawning user-visible panels.
6. Prefetch / hydrate **terminal workspace state** (localStorage / restore manifest) off the critical path.
7. Optional **soft-mount** of TWM in dormant mode after idle, gated by platform (especially WebKitGTK).
8. Align with `terminal-engine-v2` rehydration / LRU (no duplicate survivor-recovery paths).
9. Feature flags + kill-switch + memory/CPU budgets.
10. OpenSpec artifacts + DevHub tasks for phased delivery.

### Out of scope

- Full `terminal-engine-v2` implementation (separate change; this consumes its contracts when ready).
- Swarm launch / director startup strategy (see swarm bootstrap docs).
- Bundle-splitting of the entire app shell (may be a later phase if metrics justify).
- Changing default route away from dashboard.
- Aggressive pre-spawn of many live agent TUIs (OpenCode/Grok) at app launch.
- Big-bang `pnpm update --latest` across all majors in one PR (zod 4 / eslint 10 / day-picker 10 land only as Wave D, one major at a time).

## Capabilities

### New capabilities

- `startup-perf-marks`: named performance marks/measures for launch → terminal interactive.
- `deps-modernization-waves`: waved dependency bumps tied to re-baseline marks (A patches → B `@xterm` → C Jest → D majors).
- `terminal-warm-tiers`: policy engine for Tier 0–4 warm-up with platform gates.
- `tty-sidecar-warmup`: early `ensureTTYServer` without panel mount.
- `terminal-state-prefetch`: idle hydrate of workspace/restore state.

### Modified capabilities

- `workspace-layout-terminal-mount`: may soft-mount TWM earlier under flag (still visibility-gated for restore/GPU).
- `session-restore`: restore still gated by visibility / heavy-surfaces-ready; may run sooner after soft-mount + first Terminales paint.

## Approach (summary)

Measure → warm sidecar + state → optional dormant soft-mount → only then GPU/xterm → never pay WebKit crash tax again.

See `design.md` for tiers, SLOs, and rollout.

## Assumptions

1. Users open Terminales in most working sessions; warming after project load is worth idle CPU.
2. WebKitGTK packaged builds remain the most fragile surface for offscreen GPU; Linux Tauri needs stricter tiers.
3. `terminalManagerEverMounted` keep-alive stays the model after first successful Terminales visit.
4. Pre-spawning agent TUIs is **not** the default warm path (memory + noise).

## Affected areas

| Area                                                           | Impact   | Description                                |
| -------------------------------------------------------------- | -------- | ------------------------------------------ |
| `src/App.js`                                                   | Modified | Soft-mount / idle warm trigger; flags      |
| `src/components/TerminalWorkspacesManager.jsx`                 | Modified | Dormant vs warm tiers; heavy-surfaces gate |
| `src/components/terminal/hooks/useWorkspaceBootstrapEffect.js` | Modified | Prefetch / restore timing                  |
| `src/lib/terminal/ttyServer.js`                                | Modified | Sidecar warmup API / idempotent ensure     |
| `src/lib/terminal/startupRestore*`                             | Touched  | Coexist with earlier mount; still gated    |
| New `src/lib/terminal/terminalWarmPolicy.js` (proposed)        | Create   | Tier decisions + platform gates            |
| Perf marks helper (proposed)                                   | Create   | Marks + optional debug overlay             |

## Risks

| Risk                                      | Likelihood        | Mitigation                                         |
| ----------------------------------------- | ----------------- | -------------------------------------------------- |
| WebKitGTK crash from early GPU/xterm      | High if unguarded | Tier caps; no WebGL until visible; Linux stricter  |
| Memory spike warming many PTYs            | Med               | Cap warm shells; no agent TUI pre-spawn by default |
| Dashboard jank from warm work             | Med               | `requestIdleCallback` / after-paint; budget        |
| Fight with `terminal-engine-v2` lifecycle | Med               | Explicit dependency notes; share unsubscribe/LRU   |
| Metrics without product win               | Low               | SLO gates; ship only tiers that beat baseline      |

## Rollback

- Feature flag off → current behavior (mount only on first `/terminales`).
- Per-tier flags to disable soft-mount or sidecar warm independently.

## Success metrics (targets — refine after baseline)

| Metric                                         | Cold today (hypothesis) | Target after tiers       |
| ---------------------------------------------- | ----------------------- | ------------------------ |
| App shell interactive (project open)           | baseline TBD            | no regression >10%       |
| First `/terminales` → manager painted          | baseline TBD            | −40%                     |
| First `/terminales` → first panel interactive  | baseline TBD            | −50%                     |
| Return to `/terminales` after leave            | already warm            | keep ≤ current warm path |
| Packaged WebKitGTK crash rate on project entry | must stay ~0            | must stay ~0             |

## Research summary

Deep options survey (packages, peers, rejects, **deps audit 2026-07-17**): **`research.md`**.

Headline: stay on Tauri + React + xterm.js; **modernize deps in waves** (Next 16.2.10 patch + `@xterm/*` + Tauri; Jest later; majors last); idle-warm sidecar/chunks/state; finish `terminal-engine-v2`; soft-mount dormant with WebKit gates. Reject native terminal rewrite, agent pre-spawn, and big-bang major upgrades.

## Next

`research.md` (done) → review priorities with human → Phase 0 baseline → apply by phase in `tasks.md`.

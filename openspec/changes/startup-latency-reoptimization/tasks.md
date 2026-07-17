# Tasks: startup-latency-reoptimization

## Review Workload Forecast

- Estimated changed lines (all phases): large if done at once → **must chain**
- 400-line budget risk: **High** for combined Phases 1–2
- Chained PRs: **Yes**

### Suggested chain

1. **PR0** — perf marks + unit tests + baseline notes (no behavior change)
2. **PR0A** — **Deps Wave A**: Next 16.2.10 + React 19.2.7 + Tauri API/CLI + safe Radix/minors; Turbopack verify; smoke + re-baseline marks
3. **PR0B** — `ANALYZE=true` bundle snapshot; note Monaco/Konva/motion weight
4. **PR0C** — **Deps Wave B**: migrate `xterm*` → `@xterm/*`; golden terminal tests; re-baseline
5. **PR1** — warm policy + Tier 1 sidecar warm + **idle prefetch of `@xterm` imports** + tests
6. **PR2** — Tier 2 state prefetch + TWM consume path + tests
7. **PR3** — Tier 3 soft-mount (Windows default / Linux off) + regression tests
8. **PR4** (optional) — Tier 4 spare shell / TWM `React.lazy` only if metrics demand
9. **PR5** — **Deps Wave C**: Jest 27 → 29/30 (+ jsdom) as dedicated PR
10. **PR6+** — **Deps Wave D**: one major per PR (zod 4, day-picker 10, …) only when justified
11. **Parallel** — continue `terminal-engine-v2` (Wave rehydrate)

Research + deps audit: `research.md`.

---

## Phase 0 — Measure

### T0.1 — Perf marks helper

- [x] Add `src/lib/terminal/startupPerfMarks.js` (`mark`, `measure`, `getPerfSnapshot`, safe no-op)
- [x] Unit tests
- [x] Wire marks in `App.js` (project-ready, terminal-route-enter) and TWM / bootstrap (mount, heavy-surfaces, first-panel-interactive)
- [x] Document how to enable (`localStorage.devhub_perf=1`) in apply-progress when applying

### T0.2 — Capture baseline

- [ ] Manual: 5–10 cold starts Windows → open project → `/terminales` → record measures
- [ ] If Linux packaged build available: same + confirm no white-screen on dashboard
- [ ] Paste numbers into `apply-progress.md` (create on apply)

**Exit:** Baseline numbers recorded; no production behavior change required beyond optional marks.

### T0.3 — Deps Wave A (safe patches / minors)

- [x] Bump `next` + `@next/bundle-analyzer` to **16.2.10** (or latest 16.2.x)
- [x] Bump `react` / `react-dom` to latest 19.2.x
- [x] Bump `@tauri-apps/api` / `@tauri-apps/cli` within 2.11.x
- [ ] Bump safe minors: Radix, axios, framer-motion, react-router-dom, lucide-react, recharts, prettier, etc. (no zod/day-picker/resizable-panels majors)
- [x] Confirm `scripts/next-dev.cjs` / `next build` run on **Turbopack** (no accidental `--webpack`); note in apply-progress
- [ ] Smoke: `pnpm tauri:dev` or `pnpm dev` → project open → `/terminales` → one panel
- [ ] Re-run Phase 0 marks; paste delta vs pre-Wave-A baseline

**Exit:** lockfile updated; smokes green; marks compared.

### T0.4 — Bundle snapshot

- [ ] Run `ANALYZE=true pnpm build` (analyzer already wired in `next.config.js`)
- [ ] Record whether TWM/xterm/Monaco/Konva sit on the initial project chunk
- [ ] Note follow-ups (lazy TWM vs idle prefetch only)

### T0.5 — Deps Wave B — Migrate to `@xterm/*`

- [x] Replace deprecated `xterm` / `xterm-addon-*` deps with `@xterm/xterm@5.5` and scoped addons (v6 deferred — canvas peer `^5`)
- [x] Update `useTerminalEngine.js` imports + mocks/tests
- [x] Smoke: WebGL panel tests green (`TerminalTTY.xterm-webgl`, `TerminalTTY`, `TerminalTTY.v2`)
- [ ] Re-baseline marks after migrate (manual)
- [ ] Decide later: `@xterm/addon-web-fonts` if JetBrains/Fira/Cascadia load as webfonts

**Exit:** Deprecation warnings gone; terminal suites green; marks compared to Wave A.

### T0.6 — Deps Wave C/D (scheduled, not blocking warm)

- [ ] Wave C: Jest 27 → 29/30 + jsdom (dedicated PR; fix config/transformers)
- [ ] Wave D backlog (separate PRs): zod 4, react-day-picker 10, react-resizable-panels 4, @supabase/ssr, eslint 10 — only with owner + tests
- [ ] Explicitly **do not** land Wave D in the same PR as warm tiers or `@xterm`

---

## Phase 1 — Tier 1 + policy

### T1.1 — Warm policy module (TDD)

- [x] Add `src/lib/terminal/terminalWarmPolicy.js`
  - `resolveWarmTiers`
  - `scheduleTerminalWarm` with cancel
  - platform gate: Linux WebKitGTK ⇒ Tier 3 false by default
  - kill-switch
- [x] Tests for matrix + cancel

### T1.2 — Sidecar warm from layout

- [x] From `WorkspaceLayout` after project ready: schedule Tier 1 idle warm → GET `/api/terminal/session` (`ensureTTYServer`)
- [x] Cancel on projectId change / unmount
- [x] Marks `dh:warm-tier-start` / `dh:warm-tier-done`
- [ ] Verify: no panel spawn, no restore (manual)

### T1.3 — Idle prefetch terminal renderer chunks

- [x] Same idle window: `import('@xterm/xterm')` (+ fit/search/webgl as policy) so first panel skips cold dynamic import
- [x] Must not call `Terminal.open` / attach WebGL off-route
- [x] Cancel with warm scheduler

**Exit:** Jest green; manual: sidecar listen ready + xterm module cached before first Terminales (log or mark).

---

## Phase 2 — Tier 2 prefetch

### T2.1 — Prefetch cache (TDD)

- [x] Add `src/lib/terminal/terminalStatePrefetch.js`
- [x] Tests: load, take-once, stale/mismatch projectId

### T2.2 — Consume in bootstrap

- [x] `useWorkspaceBootstrapEffect` prefers prefetch when fresh
- [x] Fallback to current localStorage path
- [x] Prefetch does not write storage

**Exit:** Cold Terminales L2 reduced in marks vs Phase 0 baseline.

---

## Phase 3 — Tier 3 soft-mount

### T3.1 — Soft-mount wiring

- [x] Idle path may set `terminalManagerEverMounted` early when Tier 3 allowed
- [x] TWM mounts with `isVisible=false` dormant (no restore, no heavy surfaces)
- [x] Visible path unchanged for restore / heavy surfaces

### T3.2 — Platform defaults + QA

- [x] Windows: Tier 3 default on (code; smoke pending)
- [x] Linux WebKitGTK: default off; kill-switch `devhub_terminal_warm=off`
- [ ] Tests: restore not called when `!isVisible` under soft-mount (existing gates; add dedicated if needed)
- [ ] Manual smoke: dashboard entry safe; first Terminales faster

**Exit:** Spec Tier 3 scenarios covered; WebKit crash class not regressed.

---

## Phase 4 — Optional

### T4.1 — Evaluate only if Phase 1–3 miss SLOs

- [ ] Chunk prefetch / lazy import strategy for TWM
- [ ] Tier 4 spare shell N=1 behind explicit opt-in
- [ ] Update design budgets with real RSS numbers

---

## Definition of done (program)

- [ ] Spec requirements have tests or explicit verify notes
- [ ] Baseline vs post Phase 1–3 numbers in apply-progress / verify-report
- [ ] Kill-switch works
- [ ] Linux default does not soft-mount
- [ ] No agent TUI pre-spawn from warm
- [ ] Stay-warm after first Terminales visit preserved
- [ ] Coordination note with `terminal-engine-v2` recorded if both land

## Next step after SDD

Start **T0.1** (marks) on a dedicated branch; do not mix with unrelated terminal paste / swarm work in the same PR.

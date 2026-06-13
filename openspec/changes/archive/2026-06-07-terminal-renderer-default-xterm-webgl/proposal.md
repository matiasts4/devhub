# Proposal: xterm-webgl as DevHub Default Terminal Renderer

## Intent

Promote `xterm-webgl` to the global default terminal renderer across DevHub: workspace panels, command-bar-spawned terminals, swarm agent terminals, pizarra presets, and session restore. Today the global default is `vte-experimental` (Linux-only native VTE widget). `xterm-webgl` already ships as an opt-in WebGL-accelerated renderer with a runtime readiness probe; the workspace path inherits it via the `TERMINAL_RENDERER_INHERIT_MODE` mechanism, so the flip is mostly a one-line constant change plus a handful of defensive pins, settings-UI re-shape, and test rewires.

This change does NOT modify pizarra: pizarra was already promoted to xterm-webgl by default in `PizarraLiveSurfaceLayer.jsx:413` and `CanvasTerminal.jsx:67` (predates this change). The change aligns the **workspace** and **command-bar** paths to match pizarra's default.

## Scope

### In Scope

- Flip `TERMINAL_RENDERER_DEFAULT_MODE` from `'vte-experimental'` to `'xterm-webgl'` in `terminalRendererPreferences.js`.
- Re-shape Settings → Appearance → Terminal renderer: add `xterm-webgl` option, update subtitle copy, update active-badge logic, update `useState` initial.
- Fix the static `resolveRendererSelection` antipattern: make `getTerminalRendererCapability('xterm-webgl')` report `ready: true` so callers that don't wire a live probe (settings, defaults resolver) honor the new default instead of silently demoting to `xterm`.
- Defensive explicit pins in spawn paths so future regressions in the resolver layer don't silently demote: `PizarraPane.handleAddElement` (terminal branch), `PizarraPane.handleApplyLayout` (dev-split/dev-trio presets), `pizarraSurfaceController.spawnTerminal`, command bar `terminalRun` action.
- Test rewrites that pin the old default literal.
- Doc updates in `docs/25_Terminal_Renderer_Robusto_Roadmap.md` and `docs/26_TERM-01_Terminal_Renderer_Evidence_Pack.md` to keep their enforced unit tests green.

### Out of Scope

- Removing or deprecating the `vte-experimental` mode or the GTK VTE native runtime.
- Shipping a per-swarm-role renderer override.
- Force-migrating existing users' stored preferences (soft roll-out — see Migration).
- Touching `devhub-mcp` (no terminal-renderer code lives there).
- Renaming the static `resolveRendererSelection` to make the no-probe demotion explicit (deferred follow-up — see Open Questions).

### Non-Goals

- Picking a winner between xterm-webgl and future TERM-03/04 native runtimes; the architecture already supports both via the resolver.
- Changing the `TERMINAL_RENDERER_MODES` enum order (asserted by tests).

## Capabilities

### New Capabilities

- `terminal-renderer-default`: Document the global default renderer and the soft roll-out policy that respects explicit user choice.

### Modified Capabilities

- `terminal-renderer-selection` (added by `term-02-renderer-switch-fallback`): flip the global defaultMode from `'vte-experimental'` to `'xterm-webgl'`.
- `terminal-renderer-fallback` (added by `term-02-renderer-switch-fallback`): make the static capability map report `xterm-webgl` as `ready: true` so resolver callers that don't wire a live probe honor the new default.

## Approach

**Phase 1 (constant flip + tests first, strict_tdd):**

1. RED: write new test in `terminalRendererPreferences.test.js` asserting `TERMINAL_RENDERER_DEFAULT_MODE === 'xterm-webgl'`.
2. RED: write test in `terminalRendererCapabilities.test.js` asserting `getTerminalRendererCapability('xterm-webgl').ready === true`.
3. GREEN: flip constant + flip the static readiness default.
4. GREEN: update the round-trip tests that seed the old default to seed the new one.

**Phase 2 (settings UI):**

1. RED: write a UI test for the settings select containing all three options (`xterm-webgl`, `vte-experimental`, `xterm`) and the active-badge label.
2. GREEN: add `xterm-webgl` option, update subtitle copy, update badge, update `useState` initial.

**Phase 3 (defensive spawn pins):**

1. RED: tests asserting that `pizarraSurfaceController.spawnTerminal` passes `requestedRendererMode: 'xterm-webgl'` to `addElement`.
2. RED: tests asserting pizarra presets (`dev-split`, `dev-trio`) pin `requestedRendererMode: 'xterm-webgl'`.
3. RED: tests asserting command bar `terminalRun` propagates the renderer mode.
4. GREEN: add the pins.

**Phase 4 (docs):**

1. Update `docs/25_*` strategy section from "GTK/VTE default" to "xterm-webgl default, xterm DOM fallback, GTK/VTE remains opt-in for Linux/Tauri pizarra surfaces".
2. Update `docs/26_*` evidence pack accordingly.
3. Doc tests in `tests/unit/terminal-renderer-*.test.js` are the regression net.

Session restore, swarm agent terminals, workspace ↔ pizarra view switch all flow through the same `INHERIT_MODE` / `resolveRequestedRenderer` plumbing, so they pick up the new default automatically — verified in the explore pass.

### Review Workload Forecast

| Item                                 | Count | Lines                                   |
| ------------------------------------ | ----- | --------------------------------------- |
| Source files modified                | 14    | ~50                                     |
| Test files rewritten (literal flips) | 8     | ~40                                     |
| New tests (RED-then-GREEN per phase) | 5     | ~350                                    |
| New openspec change folder           | 1     | ~400 (proposal + spec + design + tasks) |
| **Net diff estimate**                | —     | **~600-900 lines**                      |

**Single-PR viability:** At the edge of the 800-line review budget. If the `sdd-tasks` phase shows the work-unit split lands above 800, recommend chained PRs:

1. **PR #1 (constant flip + capability fix + tests):** ~200 lines, atomic, easy revert.
2. **PR #2 (settings UI + defensive spawn pins + docs):** ~400 lines, depends on PR #1.
3. **PR #3 (new test coverage for the resolver/spawn paths):** ~200 lines, depends on PR #1+2.

Otherwise keep as a single PR. Final decision deferred to the `sdd-tasks` forecast.

## Affected Modules

| Area                                                                                                         | Impact               | Description                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/terminal/terminalRendererPreferences.js`                                                     | Modified             | Flip `TERMINAL_RENDERER_DEFAULT_MODE`                                                                                           |
| `src/components/terminal/terminalRendererCapabilities.js`                                                    | Modified             | Static `xterm-webgl` capability reports `ready: true`                                                                           |
| `src/app/settings/appearance/page.jsx`                                                                       | Modified             | Add `xterm-webgl` option, update copy/badge/initial state                                                                       |
| `src/components/pizarra/PizarraPane.jsx`                                                                     | Modified             | Pin `requestedRendererMode: 'xterm-webgl'` in `handleAddElement` (terminal branch) and `handleApplyLayout` (dev-split/dev-trio) |
| `src/lib/commandBar/surface/pizarraSurfaceController.js`                                                     | Modified             | Pin `requestedRendererMode: 'xterm-webgl'` in `spawnTerminal`                                                                   |
| `src/lib/commandBar/actions/terminalRun.js`                                                                  | Modified             | Propagate renderer mode through to `spawnTerminal`                                                                              |
| `src/components/TerminalWorkspacesManager.jsx`                                                               | Verified (no change) | Workspace panel creation already uses `INHERIT_MODE` — picks up new default automatically                                       |
| `src/components/terminal/components/{renderWorkspacePanel,WorkspaceTerminalSurface,PanelRendererSelect}.jsx` | Verified (no change) | Hardcoded `availableModes={['xterm-webgl', 'vte-experimental']}` already lists xterm-webgl first                                |
| `src/components/pizarra/CanvasTerminal.jsx`                                                                  | Verified (no change) | `requestedRendererMode` default `'xterm-webgl'` (line 67) and `PizarraLiveSurfaceLayer.jsx:413` fallback already correct        |
| Swarm agent terminals                                                                                        | Verified (no change) | Inherit via `INHERIT_MODE`; no separate swarm renderer code path                                                                |
| Session restore (`terminal-session-restore-post-reboot`)                                                     | Verified (no change) | Round-trips through `resolveRequestedRenderer`, version-agnostic storage format                                                 |
| `docs/25_Terminal_Renderer_Robusto_Roadmap.md`                                                               | Modified             | Strategy section re-worded                                                                                                      |
| `docs/26_TERM-01_Terminal_Renderer_Evidence_Pack.md`                                                         | Modified             | Default-baseline statement updated                                                                                              |
| `src/components/__tests__/terminalRendererPreferences.test.js`                                               | Modified             | Update expected defaults in 5 assertions                                                                                        |
| `src/components/__tests__/terminalRendererPreferences.xterm-webgl.test.js`                                   | Verified (no change) | Tests seed OLD default to verify override behavior — semantic unchanged                                                         |
| `src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx`                                  | Modified             | Flip "fresh workspace uses GTK VTE" assertion                                                                                   |
| `src/components/__tests__/terminalRendererCapabilities.test.js`                                              | Modified             | Update enum-order array check stays; add new readiness assertion                                                                |
| `src/components/__tests__/terminalRendererCapabilities.xterm-webgl.resolver.test.js`                         | Verified (no change) | Already exercises xterm-webgl resolver paths                                                                                    |
| `src/components/__tests__/PizarraLiveSurfaceLayer.test.jsx`                                                  | Verified (no change) | Already expects `'xterm-webgl'`                                                                                                 |
| `src/lib/commandBar/surface/__tests__/pizarraSurfaceController.test.js`                                      | Modified             | Add assertion for explicit `requestedRendererMode` pin                                                                          |
| `src/lib/commandBar/actions/__tests__/terminalRun.test.js`                                                   | Modified             | Update spawnTerminal args assertion                                                                                             |
| `tests/unit/terminal-renderer-roadmap-doc.test.js`                                                           | Verified (no change) | Asserts strategy language; reword doc to match                                                                                  |
| `tests/unit/terminal-renderer-term-01-evidence-doc.test.js`                                                  | Verified (no change) | Asserts baseline-fallback language; reword doc to match                                                                         |
| **New tests**                                                                                                | 5 new                | Per Phase 1/2/3 RED steps above                                                                                                 |

## Risks

| Risk                                                                                                                   | Likelihood | Mitigation                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Soft roll-out leaves existing Linux/Tauri users on VTE — perceived as no-op for them                                   | Low        | Documented in release notes; settings UI shows their current mode prominently                                                         |
| Static `resolveRendererSelection` antipattern silently demotes xterm-webgl for new spawn paths that don't wire a probe | Med        | Fix the static readiness default (this proposal); add regression test                                                                 |
| Settings UI re-shape breaks the `vte-experimental` opt-in for Linux/Tauri operators                                    | Low        | Both modes stay in the select; default badge makes the new default obvious                                                            |
| Doc test rewording leaks into public docs (visible in release)                                                         | Low        | Doc tests are the contract; the reword is the public contract                                                                         |
| Workspace panel creation paths do not pick up the new default (regression)                                             | Low        | `INHERIT_MODE` already in use; covered by existing `TerminalWorkspacesManager.panel-subtabs.test.jsx` (flipped to assert xterm-webgl) |
| Review budget exceeds 800 lines                                                                                        | Med        | Chained PR plan documented; final split decided in `sdd-tasks`                                                                        |

## Rollback Plan

Single-line revert + spec archival:

1. **Revert the constant** in `src/components/terminal/terminalRendererPreferences.js:3` back to `'vte-experimental'`.
2. **Revert the static readiness** for `xterm-webgl` in `terminalRendererCapabilities.js` to `ready: false`.
3. **Revert the settings UI** select options and copy in `src/app/settings/appearance/page.jsx`.
4. **Revert the defensive pins** in `PizarraPane.jsx`, `pizarraSurfaceController.js`, `terminalRun.js` (one-line removals).
5. **Revert the doc updates** in `docs/25_*` and `docs/26_*`.
6. **Revert the test updates** (search for `'xterm-webgl'` in test files, flip back to `'vte-experimental'` in the specific lines changed).
7. **Archive the change** under `openspec/changes/archive/2026-06-07-terminal-renderer-default-xterm-webgl/` via `sdd-archive`.
8. **No data migration required** — soft roll-out means stored preferences were never overwritten, so user state is untouched.

The rollback is ~5 line-reverts + 1 archive move. Estimated revert time: < 30 minutes. The fact that we use soft roll-out is itself a rollback safety net: even if the rollback above is delayed, only first-install users get the new default; everyone else keeps their stored choice.

## Migration

**Soft roll-out (recommended, pending user confirmation):**

- Do NOT force-overwrite `devhub_terminal_renderer_default_mode` in localStorage.
- Existing users with `vte-experimental` stored keep it (respect their choice).
- New users and existing users with no stored value get `xterm-webgl`.
- This is the existing read-fallback semantics in `readTerminalRendererDefaultModeSetting`; **no migration code needed**.

**Hard roll-out (rejected as default, see Open Questions):**

- One-time localStorage write on app open: if `devhub_terminal_renderer_default_mode` is unset, set it to `'xterm-webgl'`.
- One-time bump: if it equals the legacy `'vte-experimental'`, overwrite to `'xterm-webgl'`.
- Reason rejected: disrespects user intent; Linux/Tauri operators who picked VTE on purpose would be silently demoted.

## Open Questions

1. **Migration policy** — confirm soft roll-out (recommended) vs. hard roll-out. The orchestrator should surface this to the user.
2. **`resolveRendererSelection` antipattern mitigation** — three options:
   - **A. Flip static readiness for `xterm-webgl` to `ready: true`** (recommended, minimal blast radius).
   - **B. Rename to `resolveRendererSelectionWithProbe` and force callers to pass a probe** (cleaner API, larger diff).
   - **C. Leave antipattern as-is and document it** (no code change; technical debt).
     Recommend A in this change; defer B/C as follow-up.
3. **Workspace panel `availableModes` array** — currently `['xterm-webgl', 'vte-experimental']`. Should `canvas` be added to the workspace picker too? Defer.
4. **Per-swarm-role renderer override** — out of scope here. Track as follow-up.

## Test Strategy

Strict TDD per `openspec/config.yaml:12`:

1. **Unit (RED-then-GREEN):** New tests in `terminalRendererPreferences.test.js`, `terminalRendererCapabilities.test.js`, `pizarraSurfaceController.test.js`, `terminalRun.test.js` — all written before implementation.
2. **Component (RED-then-GREEN):** Settings page test for the re-shaped select; Pizarra preset tests for the explicit pin.
3. **Resolver (RED-then-GREEN):** `terminalRendererCapabilities.xterm-webgl.resolver.test.js` augmented with the new `ready: true` static assertion.
4. **Doc regression:** `tests/unit/terminal-renderer-{roadmap-doc,term-01-evidence-doc}.test.js` are the contract — they MUST pass after doc reword.
5. **Verification phase:** `sdd-verify` runs `npm test` (root + `devhub-mcp`) and Playwright smoke for the settings page render.

## Success Criteria

- [ ] `TERMINAL_RENDERER_DEFAULT_MODE === 'xterm-webgl'` (one constant flip).
- [ ] `getTerminalRendererCapability('xterm-webgl').ready === true` (antipattern fix).
- [ ] Settings → Appearance → Terminal renderer shows `xterm-webgl` as the first option and active badge.
- [ ] New workspace panels default to `xterm-webgl` (verified by flipped test in `TerminalWorkspacesManager.panel-subtabs.test.jsx`).
- [ ] Pizarra presets (`dev-split`, `dev-trio`) and command-bar-spawned terminals pin `requestedRendererMode: 'xterm-webgl'`.
- [ ] Swarm agent terminals inherit the new default.
- [ ] Session restore round-trips the renderer preference (no behavior change required; verified by existing test).
- [ ] `vte-experimental` remains a selectable opt-in for Linux/Tauri operators.
- [ ] `docs/25_*` and `docs/26_*` are reworded; their enforced unit tests pass.
- [ ] No forced overwrite of user `localStorage` preferences.
- [ ] `npm test` and Playwright smoke pass.

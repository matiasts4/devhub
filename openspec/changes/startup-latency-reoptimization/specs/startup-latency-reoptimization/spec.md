# Spec: startup-latency-reoptimization

## ADDED Requirements

### Requirement: Startup performance marks

The client MUST expose named performance marks covering project-ready, terminal route enter, TWM mount, heavy-surfaces-ready, and first-panel-interactive, collectable when perf tracing is enabled.

#### Scenario: Marks recorded on cold Terminales open

- **GIVEN** perf tracing is enabled (`localStorage.devhub_perf=1` or non-production default as designed)
- **AND** the user opens a project and navigates to `/terminales` for the first time in the page load
- **WHEN** the first terminal panel becomes interactive
- **THEN** marks exist for `dh:project-ready`, `dh:terminal-route-enter`, `dh:twm-mount`, and `dh:first-panel-interactive`
- **AND** a measure from terminal-route-enter to first-panel-interactive is available via the perf snapshot helper

#### Scenario: Marks do not throw when Performance API missing

- **GIVEN** a environment without `performance.mark`
- **WHEN** mark helpers are called
- **THEN** they no-op without throwing

---

### Requirement: Tiered terminal warm policy

A warm policy MUST resolve which tiers run from platform, flags, and optional hints, and MUST NOT enable Tier 3 on Linux WebKitGTK by default.

#### Scenario: Default Windows tiers

- **GIVEN** platform is Windows Tauri WebView2 and warm is enabled
- **WHEN** tiers are resolved with default flags
- **THEN** Tier 1 and Tier 2 are enabled
- **AND** Tier 4 is disabled

#### Scenario: Linux WebKitGTK blocks soft-mount by default

- **GIVEN** platform is Linux WebKitGTK packaged
- **WHEN** tiers are resolved with default flags
- **THEN** Tier 3 is disabled
- **AND** Tier 1 and Tier 2 may still be enabled

#### Scenario: Kill-switch disables all warm behavior

- **GIVEN** warm kill-switch is on (`devhub_terminal_warm=off` or equivalent)
- **WHEN** the scheduler would run
- **THEN** no warm tier work is started

---

### Requirement: Idle TTY sidecar warmup

After the project is ready, when Tier 1 is enabled, the client MUST schedule an idle warmup that calls the idempotent TTY server ensure path for the project cwd without creating user-visible panels.

#### Scenario: Sidecar warm before first Terminales visit

- **GIVEN** a project with `local_path` is loaded and the user is not on `/terminales`
- **AND** Tier 1 is enabled
- **WHEN** the idle warm window runs
- **THEN** `ensureTTYServer` (or equivalent) is invoked once for that cwd
- **AND** no terminal panel is shown
- **AND** no startup restore of agent sessions runs solely because of this warmup

#### Scenario: Warm is cancellable on project change

- **GIVEN** an idle warm was scheduled for project A
- **WHEN** the user navigates to a different project before warm completes
- **THEN** warm work for A is cancelled or its results are discarded
- **AND** warm may be rescheduled for project B

---

### Requirement: Terminal state prefetch

When Tier 2 is enabled, the client MUST prefetch terminal workspace state and restore manifest for the current project into a read-only cache during idle, and TWM MUST prefer that cache on first mount when fresh.

#### Scenario: Prefetch consumed once on mount

- **GIVEN** Tier 2 warm completed for `projectId`
- **WHEN** `TerminalWorkspacesManager` mounts for that project
- **THEN** bootstrap uses the prefetched snapshot if still fresh
- **AND** a second take returns empty/null (consume-once)

#### Scenario: Prefetch does not write storage

- **GIVEN** Tier 2 warm runs
- **WHEN** prefetch loads state
- **THEN** it does not write `devhub_terminal_state:*` or restore manifest keys as part of warmup

---

### Requirement: Soft-mount dormant manager (Tier 3)

When Tier 3 is enabled for the platform, the layout MAY mount `TerminalWorkspacesManager` before the first `/terminales` navigation with `isVisible=false`, and MUST keep restore and heavy GPU surfaces gated off until visible.

#### Scenario: Soft-mount does not run startup restore

- **GIVEN** Tier 3 soft-mounted TWM with `isVisible=false`
- **WHEN** bootstrap effects run
- **THEN** startup restore does not execute
- **AND** WebGL/xterm heavy surfaces are not required to initialize

#### Scenario: Becoming visible runs normal interactive path

- **GIVEN** a soft-mounted dormant TWM
- **WHEN** the user navigates to `/terminales` (`isVisible=true`)
- **THEN** heavy surfaces and startup restore follow the existing visible-path rules
- **AND** first-panel-interactive is still marked

#### Scenario: WebKitGTK packaged build does not soft-mount by default

- **GIVEN** Linux WebKitGTK packaged defaults
- **WHEN** the user opens a project on the dashboard
- **THEN** TWM is not soft-mounted solely by Tier 3 defaults
- **AND** project entry does not regress the historical white-screen crash class

---

### Requirement: No default agent TUI pre-spawn

Warm tiers MUST NOT pre-launch agent programs (opencode, grok, kimi, hermes, codex) at application or project startup.

#### Scenario: Warm does not create agent panels

- **GIVEN** any enabled warm tier runs after project ready
- **WHEN** warmup completes
- **THEN** no new agent TUI panel/session is created as part of warmup
- **AND** spare shell pool (Tier 4), if ever enabled, creates at most a non-agent shell and only when explicitly opted in

---

### Requirement: No regression to stay-warm after first visit

After the user has visited `/terminales` once in the page load, leaving the route MUST keep the existing warm-mount / Option B behavior.

#### Scenario: Return to Terminales stays warm

- **GIVEN** `terminalManagerEverMounted` is true and the user left `/terminales`
- **WHEN** the user returns to `/terminales`
- **THEN** TWM remains mounted across the leave
- **AND** off-route container uses inert/opacity keep-alive semantics already in `App.js` / workspace visibility helpers

---

### Requirement: Dependency modernization is waved and measurable

Dependency updates that are part of this initiative MUST land in named waves (A patches/minors, B `@xterm/*`, C Jest, D majors), MUST NOT combine unrelated majors with warm-tier behavior changes in the same PR, and SHOULD re-record startup/Terminales perf marks after Waves A and B.

#### Scenario: Wave A bumps Next without majors

- **GIVEN** Deps Wave A is applied
- **WHEN** the PR merges
- **THEN** `next` is on the latest 16.2.x patch intended by the wave
- **AND** zod / react-day-picker / react-resizable-panels majors are unchanged by that PR

#### Scenario: Terminal packages use scoped @xterm after Wave B

- **GIVEN** Deps Wave B is applied
- **WHEN** production dependencies are inspected
- **THEN** terminal rendering depends on `@xterm/xterm` (and scoped addons), not the deprecated `xterm` package name
- **AND** focused terminal tests pass

#### Scenario: Marks re-baselined after Wave A or B

- **GIVEN** Wave A or Wave B has landed
- **WHEN** cold Terminales open is measured with perf tracing enabled
- **THEN** an apply-progress or verify note records the new measures versus the prior baseline

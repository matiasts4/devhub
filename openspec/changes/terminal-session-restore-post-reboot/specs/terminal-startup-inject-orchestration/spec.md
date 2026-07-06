# Delta Spec: terminal-startup-inject-orchestration

## ADDED Requirements

### Requirement: TSIO-1 — Single Normalized Inject Per Panel on Cold Start

On each cold page load (browser tab session where `shouldRunStartupRestoreThisPageLoad` is true), the system MUST ensure that each terminal panel receives at most **one** PTY input injection for the same **normalized** resume intent. Normalization MUST strip optional `#recovery-<timestamp>` suffixes and trim whitespace before comparing commands.

#### Scenario: TSIO-S1 — Hydrate inject satisfies startup restore

- GIVEN a panel persisted with `opencode --session abc`
- AND startup restore would relaunch the same normalized command
- WHEN path A (`TerminalTTY` initial command lifecycle) successfully dispatches that command
- THEN path B (`dispatchStartupRestoreQueue`) MUST NOT dispatch a second inject or bump `initialCommand` for that panel on the same cold load
- AND the panel MUST remain the single restored instance

#### Scenario: TSIO-S2 — Live runtime reattach skips inject

- GIVEN runtime diagnostics report the terminal session alive for a panel (`REATTACH_LIVE_TERMINAL` or `RESTORE_READY`)
- WHEN the panel WebSocket connects
- THEN `useTerminalInitialCommandLifecycle` MUST NOT send `initialCommand` to the PTY
- AND startup restore MUST NOT enqueue a relaunch for that panel

#### Scenario: TSIO-S3 — Manual revive may use recovery suffix

- GIVEN the user explicitly requests manual session revive (UI action, not automatic startup)
- WHEN a relaunch is dispatched with `#recovery-*` suffix
- THEN the inject MAY proceed even if a prior normalized command was sent in the same tab session
- AND automatic startup restore MUST NOT append `#recovery-*` solely to force reinject

### Requirement: TSIO-2 — Shared Inject Intent Resolver

The system MUST expose a single resolver (e.g. `resolvePanelStartupInjectIntent`) consulted by both startup restore dispatch and TTY initial-command send. The resolver MUST consider: normalized persisted command, agent run metadata, runtime snapshot terminal alive state, panel lifecycle dispatch record, and effective restore policy.

#### Scenario: TSIO-S4 — Resolver returns skip for satisfied intent

- GIVEN lifecycle dispatch record matches normalized resume command for panel id
- WHEN the resolver runs before a startup relaunch action
- THEN it MUST return `skip` with reason `already-dispatched`
- AND no workspace `initialCommand` mutation occurs

#### Scenario: TSIO-S5 — Resolver returns inject for cold dead session

- GIVEN no live runtime terminal and no matching lifecycle dispatch on this cold load
- AND restore policy is `auto`
- WHEN the resolver runs for an OpenCode durable session
- THEN it MUST return `inject` with the durable resume command
- AND exactly one code path performs the PTY send

### Requirement: TSIO-3 — Startup Restore Ordering

`WorkspaceRestoreCoordinator.runStartupRestore` MUST complete runtime probe and inject-intent reconciliation before or in lockstep with TTY first connect for hydrated panels, such that relaunch actions cannot race ahead of hydrate inject undetected.

#### Scenario: TSIO-S6 — Restore deferred until hydration ready

- GIVEN persisted terminal state expects non-empty workspaces
- AND panel hydration has not marked `terminalHydrationReadyRef`
- WHEN startup restore effect runs
- THEN restore MUST defer (existing `startup-restore-deferred` behavior preserved)
- AND MUST NOT relaunch panels that are not in `bootPanelIdsRef`

### Requirement: TSIO-4 — TUI Launch Command Classification

Commands matching `^(opencode|hermes|grok|groc|kimi)\b` (case-insensitive) MUST be classified as TUI launch commands for restore planning. Kimi MUST NOT be treated as `RESTORE_SHELL_EMERGENT` solely because it omits a session id.

#### Scenario: TSIO-S7 — Kimi panel cold start

- GIVEN a panel with `initialCommand` launching Kimi TUI
- AND no live runtime terminal
- WHEN `buildStartupRestorePlan` evaluates the panel
- THEN the plan MUST NOT emit `RESTORE_SHELL_EMERGENT` for that panel
- AND MUST use TUI-appropriate action (e.g. terminated + hydrate inject, or future durable resume action)

#### Scenario: TSIO-S8 — Grok panel preserves relaunch UX

- GIVEN a panel with `initialCommand` `grok` or `groc`
- AND no durable session id persisted
- WHEN the app opens after cold start
- THEN DevHub MUST still open the panel and inject `grok`/`groc` once via hydrate path
- AND MUST NOT require OpenCode-style session discovery

# Delta Spec: terminal-restore-gear

## ADDED Requirements

### Requirement: TRG-1 — Terminal Gear Is Canonical Restore Settings Surface

Restore policies for terminal startup (`auto | manual | off` per `opencode`, `generic`, `swarm`) MUST be edited from the terminal workspace gear modal (`TerminalRestoreSettingsModal`), section **Restauración**. Changes MUST persist to `devhub_terminal_restore_prefs` immediately on selection.

#### Scenario: TRG-S1 — User changes OpenCode policy in gear

- GIVEN the gear modal Restauración section is open
- WHEN the user sets OpenCode to `manual`
- THEN `writeTerminalRestorePreferences` MUST persist `{ opencode: 'manual', ... }`
- AND the next cold app start MUST apply that policy via `resolveEffectiveRestorePolicy`

#### Scenario: TRG-S2 — Global prefs not per-project

- GIVEN two different projects in DevHub
- WHEN the user sets generic policy to `off` in gear
- THEN both projects MUST read the same generic policy on next startup
- AND no `projectId` suffix key is required for this change

### Requirement: TRG-2 — No Duplicate Restore Controls in Gear Modal

The gear modal MUST NOT render two independent restore policy UIs. The **Terminal** section inside the same modal MUST NOT include the three restore `<select>` controls; those belong only to **Restauración**.

#### Scenario: TRG-S3 — Terminal tab excludes restore selects

- GIVEN the user opens gear and navigates to the Terminal section
- WHEN the section renders
- THEN `data-testid="restore-policy-opencode"` (and generic/swarm) MUST NOT be present in that section
- AND renderer/typography/zoom controls MAY still render

### Requirement: TRG-3 — Copy Matches Behavior

Restauración help text MUST distinguish: (1) layout/panels always restore from persisted workspace state; (2) policies govern automatic **process/TUI relaunch** on cold start; (3) OpenCode supports session resume when session id is known; (4) Grok/Kimi may relaunch the TUI binary without session continuity until provider adapters ship.

#### Scenario: TRG-S4 — Manual policy shows suspended affordance

- GIVEN effective policy `manual` for a governed TUI kind at cold start
- WHEN startup restore suppresses auto relaunch
- THEN the panel MUST enter suspended connection state (or equivalent) with user-visible continue affordance
- AND OpenCode manual seeding behavior MUST extend to other kinds governed by `generic` policy when panel is classified as grok/kimi TUI

### Requirement: TRG-4 — Swarm Policy Semantics Documented in UI

Swarm restore policy controls MUST be labeled to reflect reattach-first behavior (tmux), not full relaunch of materialized launch wrappers.

#### Scenario: TRG-S5 — Swarm auto does not re-run launch wrapper

- GIVEN swarm panel with persisted tmux context
- WHEN cold start restore runs with swarm policy `auto`
- THEN DevHub MUST NOT re-inject materialized `devhub-launch-*.sh` wrapper on restore
- AND MUST prefer reattach path consistent with `REATTACH_LIVE_TERMINAL` planning

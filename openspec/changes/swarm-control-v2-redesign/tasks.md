# Tasks: SwarmControl v2 Redesign

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~600–800 total (7 files) |
| 400-line budget risk | Medium per panel (~100–150 each) |
| Chained PRs recommended | Yes |
| Suggested split | PR 0 (foundation) → PR 1–6 (one panel each) |
| Delivery strategy | single-pr-default |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 0 | Extract CompactRow + CompactPanelShell + tests | PR 0 | Base = main; foundation for all panels |
| 1 | Refactor AgentsClaimsPanel | PR 1 | Base = feature/swarm-control-v2 |
| 2 | Refactor WorkspacesPanel | PR 2 | Base = feature/swarm-control-v2; independent of PR 1 |
| 3 | Refactor RunsArtifactsPanel | PR 3 | Base = feature/swarm-control-v2 |
| 4 | Refactor DirectorQueuePanel | PR 4 | Base = feature/swarm-control-v2 |
| 5 | Refactor ApprovalsErrorsPanel | PR 5 | Base = feature/swarm-control-v2 |
| 6 | Refactor EvidenceTimelinePanel | PR 6 | Base = feature/swarm-control-v2 |

## Phase 1: Foundation — Shared Components

- [ ] 1.1 Add `CompactRow` component to `src/components/control-room/utils.js` with props: status, primary, primaryTitle, secondary, badges, timestamp, className, as, onClick, isSelected. Internal layout: `[StatusPill] primary (truncate) [badges] [time]`, CSS `flex items-center gap-2 min-w-0 p-2`.
- [ ] 1.2 Add `CompactPanelShell` component to `src/components/control-room/utils.js` with props: title, description, count, items, renderItem, emptyMessage, ariaLabel, className, headerExtra. Renders section with header (h2 + CountBadge), scrollable body (`max-h-[300px] overflow-y-auto`), empty state fallback.
- [ ] 1.3 Write unit tests for `CompactRow`: renders status pill, truncated primary, timestamp via `formatRelativeTime`, optional badges, click handler, isSelected highlight.
- [ ] 1.4 Write unit tests for `CompactPanelShell`: empty state shows "Sin datos", renders correct row count, container respects `max-h-[300px]`.

## Phase 2: Panel Refactors (one at a time, browser review between each)

- [ ] 2.1 Refactor `AgentsClaimsPanel.jsx`: replace card layout with `CompactPanelShell` + `CompactRow` via `renderAgentRow`. Remove `MetaRow`. Height 420px → 300px. Run tests. Browser review gate.
- [ ] 2.2 Refactor `WorkspacesPanel.jsx`: same pattern via `renderWorkspaceRow`. Remove `MetaRow`. Height 420px → 300px. Run tests. Browser review gate.
- [ ] 2.3 Refactor `RunsArtifactsPanel.jsx`: same pattern via `renderRunRow`. Keep `isSelected` prop for selection highlight. Height 420px → 300px. Run tests. Browser review gate.
- [ ] 2.4 Refactor `DirectorQueuePanel.jsx`: `CompactPanelShell` for queue items via `renderQueueRow`. Keep handoff section unchanged (summary block, not a list). Height 360px → 300px for list only. Run tests. Browser review gate.
- [ ] 2.5 Refactor `ApprovalsErrorsPanel.jsx`: two `CompactPanelShell` instances side-by-side (approvals + errors columns). Keep action buttons inline in `renderItem`. Height 360px → 300px. Run tests. Browser review gate.
- [ ] 2.6 Refactor `EvidenceTimelinePanel.jsx`: `CompactPanelShell` via `renderTimelineRow`. Collapse secondary evidence into "+N" badge in `badges` array. Height 480px → 300px. Run tests. Browser review gate.

## Phase 3: Cleanup & Verification

- [ ] 3.1 Remove unused `MetaRow` and old card-layout code from all refactored panels.
- [ ] 3.2 Run full test suite (`npm test`) — zero failures required.
- [ ] 3.3 Verify all six panels render within `max-h-[300px]` with 15+ rows, scrolling confined to panel body.

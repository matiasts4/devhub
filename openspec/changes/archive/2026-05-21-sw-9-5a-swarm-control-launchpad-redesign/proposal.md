# Proposal: SW-9.5A Swarm Control Launchpad Redesign

## Intent

Refocus Swarm Control around the operator’s first jobs: see active swarm, launch a swarm, and configure swarm type. Replace the flat dashboard feel with a launchpad-first flow while keeping the current snapshot/read-model as the only authority.

## Scope

### In Scope

- Add an active-swarm hero with strongest CTA, live status summary, and quick continuation actions.
- Add a template-first launchpad for no-active-swarm states, with customization deferred behind template selection.
- Add a swarm-type preparation surface for V1-level configuration only, plus stronger visual hierarchy, spacing, and CTA emphasis.

### Out of Scope

- New backend orchestration, new persistence, or any second truth model.
- Deep swarm builder/editor, advanced workflow designer, or route split into a separate app surface.

## Capabilities

### New Capabilities

- `swarm-launchpad`: launchpad-first entry flow for active-swarm continuation, template-first empty state, and shallow swarm-type preparation.

### Modified Capabilities

- `swarm-observability`: reorder Swarm Control so observability remains available but becomes secondary to launch/continue actions.

## Approach

Implement a launchpad-first composition in `SwarmControl` backed by derived selectors in `src/lib/operations/swarmControl.js`. Reuse existing snapshot slices to compute hero, template, and swarm-type cards. Keep detailed panels below the fold or de-emphasized; no backend contract changes.

## Affected Areas

| Area                                                | Impact   | Description                                                        |
| --------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `src/views/SwarmControl.jsx`                        | Modified | Rebuild IA around hero/launchpad/type-prep flow                    |
| `src/components/control-room/*`                     | Modified | Add/reshape presentational sections for launch-first hierarchy     |
| `src/lib/operations/swarmControl.js`                | Modified | Add derived selectors for launchpad surfaces from current snapshot |
| `src/views/__tests__/SwarmControl.test.jsx`         | Modified | Lock ordering, CTA priority, and empty-state behavior              |
| `src/lib/operations/__tests__/swarmControl.test.js` | Modified | Verify selector derivation stays snapshot-authoritative            |

## Risks

| Risk                                         | Likelihood | Mitigation                                                    |
| -------------------------------------------- | ---------- | ------------------------------------------------------------- |
| Visual redesign still feels like a dashboard | Med        | Make hero/template/type-prep top-priority in tests and layout |
| Derived launch data drifts from truth        | Med        | Derive only from existing snapshot/read-model helpers         |
| V1 expands into deep builder scope           | High       | Cap config to preparation-level fields only                   |

## Rollback Plan

Revert `SwarmControl` composition and derived selectors to the current panel-first layout. No migration needed because the change stays read-only over current snapshot authority.

## Dependencies

- Existing Control Room snapshot/read-model contracts
- Current SwarmControl UI test coverage and selector tests

## Success Criteria

- [ ] When a swarm is active, operators see status + next CTA before any secondary panels.
- [ ] When no swarm is active, templates appear before customization and lead the launch flow.
- [ ] Swarm type configuration stays shallow, snapshot-authoritative, and free of new backend/persistence work.

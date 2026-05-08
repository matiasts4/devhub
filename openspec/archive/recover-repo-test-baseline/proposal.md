# Proposal: Recover Repo-wide Test Baseline

## Intent

Restore `npm test` to green with MINIMAL product-scope drift. Fix verified harness, export, and stale expectation mismatches so the suite reflects current runtime contracts instead of blocking delivery with known red noise.

## Scope

### In Scope

- Align AgentHub API harness defaults with the current runtime port/env contract
- Reconcile tab-label helper exports and right-dock URL expectations with current behavior or add low-risk compatibility shims
- Update stale tests and test setup for CSS/theme, sidebar tokens, `crypto` availability, and path assertions
- Add a final repo-wide test-baseline verification target for the changed suites

### Out of Scope

- New product features, UX redesigns, or behavior changes beyond compatibility-safe fixes
- Broad test rewrites, new end-to-end coverage, or non-failing suite cleanup

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- None

## Approach

Prefer test and harness corrections first. Only touch production code when a compatibility shim is cheaper and lower-risk than rewriting dependent tests (for example, restoring a helper export alias). Keep current runtime behavior authoritative: AgentHub uses `3100`, malformed host handling follows the current browser normalization path, and stale assertions must be updated to match verified tokens, environment APIs, and filesystem behavior.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `tests/agenthub/api/harness.js` | Modified | Update default base URL / env contract to current runtime |
| `src/components/TerminalTabsManager.jsx` + `src/components/__tests__/TerminalTabsManager.test.js` | Modified | Restore helper compatibility or align tests to exported API |
| `src/components/workspace/rightDockState.js` + `tests/unit/right-dock-state.test.js` | Modified | Reconcile malformed-host expectations with current normalization behavior |
| `src/components/__tests__/cssTokens.test.js`, `Sidebar.test.js`, `src/lib/projectClassification.test.js`, `src/lib/terminal/ttyServer.test.js` | Modified | Remove stale token/env/path assumptions blocking global baseline |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Hidden runtime regression masked as test drift | Medium | Verify each failing cluster against current source before changing assertions |
| Small compatibility shim becomes accidental API contract | Low | Limit shims to test-facing helpers with no product behavior change |

## Rollback Plan

Revert the change folder implementation commit. If any compatibility shim proves wrong, remove it and restore the prior test while keeping unrelated harness/env fixes.

## Dependencies

- Existing root `npm test` runner and Jest/Next test environment
- Current local runtime port contract for AgentHub (`3100`)

## Success Criteria

- [ ] Previously failing 12 suites / 33 tests pass under `npm test`
- [ ] AgentHub API suites no longer fail due to `localhost:3000` fetch defaults
- [ ] Terminal tab, right-dock, CSS/sidebar, project-classification, and tty path failures are resolved without broad product-scope drift
- [ ] No new failing suites are introduced by the baseline recovery work

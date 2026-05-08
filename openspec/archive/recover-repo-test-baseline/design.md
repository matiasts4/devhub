# Design: Recover Repo-wide Test Baseline

## Technical Approach

Recover the baseline by treating current runtime behavior as source of truth and fixing test infrastructure before product code. The change stays narrow: centralize AgentHub API test base URL to the verified `3100` contract, add one compatibility export for `TerminalTabsManager`, and update stale assertions/runtime shims where tests no longer match current CSS, browser URL normalization, `crypto`, or tty path behavior.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| AgentHub API port contract | Keep `3000`; patch per test; centralize on `3100` | Centralize on `3100` in shared API test harness/constants | Largest red cluster; matches `package.json` dev script and Playwright config, so drift lives in tests, not runtime. |
| Terminal tab helper mismatch | Rename tests; add alias export; duplicate logic | Add alias export `getRestoredTabLabel` delegating to `getTabLabel` | Lowest-risk compatibility shim; no UI behavior change; removes direct import break. |
| rightDock malformed-host drift | Revert runtime normalization; update stale expectations | Keep normalization behavior, update tests | Existing `rightDockState.js` already routes single-token input to DuckDuckGo and accepts local/LAN hosts; changing runtime would create product drift. |
| stale env/token failures | Rewrite product code to fit tests; update tests/setup | Update tests and Jest runtime compat | `globals.css`, `sidebarUtils.js`, `projectClassification.js`, and `ttyServer.js` are internally consistent; failures come from stale assumptions and missing runtime polyfills. |

## Data Flow

```text
Jest runtime
  └─ setupFiles -> tests/jest.runtime-compat.js
       └─ install fetch/stream/crypto globals

AgentHub API tests
  └─ shared base URL -> tests/agenthub/api/harness.js
       └─ fetch requests -> running Next server at localhost:3100

Pure helper tests
  ├─ TerminalTabsManager exports -> helper assertions
  ├─ rightDockState normalization -> URL/search assertions
  └─ css/sidebar/projectClassification/ttyServer -> current source contracts
```

### Sequence Diagram

```text
test file -> jest.runtime-compat: install globals
test file -> shared harness/helper: resolve authoritative contract
shared harness/helper -> source module: import current implementation
test file -> running server/source fn: execute assertion
assertion -> result: pass when contract matches current runtime
```

## File Changes

| File | Action | Description |
|---|---|---|
| `openspec/changes/recover-repo-test-baseline/design.md` | Create | Technical design artifact |
| `tests/agenthub/api/harness.js` | Modify | Default base URL and docs to `http://localhost:3100` |
| `tests/agenthub/api/{headless,chat,agents,config,mcp-status,opencode-status,session-sub-routes,sessions,sessions-stream,trace-routes}.test.js` | Modify | Remove suite-local `3000` drift; reuse authoritative base URL |
| `tests/agenthub/flow-verifier.js` | Modify | Align fallback base URL with same contract |
| `src/components/TerminalTabsManager.jsx` | Modify | Export compatibility alias `getRestoredTabLabel` |
| `tests/unit/right-dock-state.test.js` | Modify | Assert current malformed-host/search normalization behavior |
| `src/components/__tests__/cssTokens.test.js` | Modify | Assert current deep-sea/default token values and scoped non-blue expectations |
| `src/components/__tests__/Sidebar.test.js` | Modify | Assert tokenized active classes instead of literal `amber` substring |
| `tests/jest.runtime-compat.js` | Modify | Install `globalThis.crypto`/`randomUUID` when missing |
| `src/lib/projectClassification.test.js` | Modify | Assert payload shape including generated `id` |
| `src/lib/terminal/ttyServer.test.js` | Modify | Assert resolved path shape relative to cwd/file instead of banning `/home/...` |

## Interfaces / Contracts

```js
// tests/agenthub/api/harness.js
const DEFAULT_BASE_URL = process.env.AGENTHUB_BASE_URL || 'http://localhost:3100';

// src/components/TerminalTabsManager.jsx
export function getRestoredTabLabel(tab, index) {
  return getTabLabel(tab, index);
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Pure helper compatibility and normalized expectations | Update Jest assertions around exported helpers, URL normalization, CSS/token strings, payload shape |
| Integration | AgentHub HTTP harness contract | Run affected API suites against shared `3100` base URL with existing skip/reachability logic |
| Repo baseline | Previously red suites only, then full sweep | Verify targeted suites first, then `npm test` as final baseline gate |

## Migration / Rollout

No migration required. Roll out in four steps for maximum red reduction with minimum risk: (1) AgentHub base URL centralization, (2) TerminalTabs export alias, (3) Jest/runtime + stale assertion updates, (4) rightDock expectation reconciliation, then final repo-wide test verification.

## Open Questions

- [ ] None blocking; if any AgentHub suites still hardcode `3000` outside listed files, include them in the same contract sweep.

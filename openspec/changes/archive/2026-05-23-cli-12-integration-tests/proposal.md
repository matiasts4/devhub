# Proposal: CLI Integration Tests

## Intent

Unit tests in `devhub-cli/commands/*.test.js` mock the database layer. No test exercises the CLI end-to-end against a real SQLite database with seeded data. Integration gaps hide regressions in command chaining, lease state transitions, and error recovery that only surface when the full stack runs together.

## Scope

### In Scope
- Test harness: isolated temp SQLite DB with seed scripts
- Full claim→work→release cycle validation
- Queue ordering with multiple projects and agents
- Agent lifecycle: register → heartbeat → claim → release → unregister
- Swarm state transitions across commands
- Error recovery: expired leases, failed tasks, double-claim prevention
- Seed data factory for reproducible scenarios

### Out of Scope
- Unit test rewrites (existing `*.test.js` files stay)
- Live MCP server integration (tests use direct DB + CLI subprocess)
- Telegram flow tests (covered by `telegram-flow-tests` spec)
- Performance/load testing

## Capabilities

### New Capabilities
- `cli-integration-tests`: End-to-end CLI test harness against real SQLite with seeded data, covering multi-command workflows, agent lifecycle, queue ordering, and error recovery scenarios

### Modified Capabilities
- None

## Approach

- **Harness**: Jest suite in `devhub-cli/tests/integration/` using temp DB path via `DEVHUB_DB_PATH` env var
- **Seed**: Deterministic seed script creates projects, tasks, agents, milestones per scenario
- **Execution**: Spawn CLI subprocess (`child_process.exec`) per test, assert exit codes + stdout/stderr
- **Isolation**: Each test gets a fresh temp DB — no shared state between tests
- **Assertions**: Exit code, stdout content, DB state post-execution (direct SQLite read)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `devhub-cli/tests/integration/` | New | Integration test suite + seed factory |
| `devhub-cli/tests/fixtures/` | New | Seed data scripts |
| `devhub-cli/jest.config.js` | Modified | Add integration test pattern |
| `package.json` | Modified | Add `test:integration` script |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Temp DB path conflicts in parallel runs | Medium | Use `os.tmpdir()` with unique UUID per test |
| Seed data drift from schema changes | Medium | Seed script reads schema dynamically; fail fast on missing columns |
| Slow test execution (subprocess per test) | Low | Keep scenarios focused; parallelize with Jest workers |

## Rollback Plan

Delete `devhub-cli/tests/integration/` and `devhub-cli/tests/fixtures/`. Revert `jest.config.js` and `package.json` changes. No production code or data is affected.

## Dependencies

- Existing `lib/db.js` `getDb()` and seed utilities
- Jest test runner (already in devDependencies)

## Success Criteria

- [ ] `npm run test:integration` passes with zero failures
- [ ] All 5 scenario categories covered (claim-release, queue, lifecycle, swarm, error-recovery)
- [ ] Each test runs in isolation with fresh DB
- [ ] Tests complete in under 60 seconds total

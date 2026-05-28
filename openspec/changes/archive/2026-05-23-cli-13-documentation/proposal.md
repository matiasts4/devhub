# Proposal: CLI-13 Documentation

## Intent

All 11 CLI commands (CLI-1 through CLI-12) are implemented and archived. No user-facing documentation exists. Agents and humans need a single reference for how to install, use, and integrate the `devhub` CLI into their workflows.

## Scope

### In Scope
- `devhub-cli/README.md` — main documentation with command reference table
- Per-command sections: usage, arguments, options, examples, exit codes
- Installation/setup instructions (`npm link`, global install, direct invocation)
- Exit code contract reference (0 = success, 1 = runtime error, 2 = invalid args)
- Integration test guide (`npm run test:integration`, seed factory usage)
- Agent usage patterns (register → claim → heartbeat → release workflow)
- TTY vs piped output behavior documentation

### Out of Scope
- New CLI commands or features
- API reference for DevHub MCP tools (separate concern)
- Tauri desktop app documentation
- Tutorial or onboarding guide for DevHub concepts

## Capabilities

### New Capabilities
- `cli-documentation`: User-facing README covering all 11 commands, installation, exit codes, integration tests, and agent patterns

### Modified Capabilities
- None

## Approach

Single `README.md` at `devhub-cli/README.md` with these sections:
1. Overview + quick start
2. Installation (3 methods)
3. Command reference table
4. Per-command detail (usage, args, options, examples)
5. Exit codes
6. Output modes (TTY color vs piped plain)
7. Integration test guide
8. Agent workflow patterns (lifecycle diagram)

Source of truth: `cli.js` for command signatures, existing archived specs for behavior details, integration test files for test guide.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `devhub-cli/README.md` | New | Main documentation file |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Documentation drifts from actual CLI behavior | Medium | Reference `cli.js` and specs directly; keep examples minimal and verifiable |
| README becomes too large | Low | Use compact tables and references; link to specs for deep detail |

## Rollback Plan

Delete `devhub-cli/README.md`. No code or data changes — documentation only.

## Dependencies

- CLI-1 through CLI-12 must be complete (verified: all archived)
- Existing specs in `openspec/specs/cli-*` for behavior reference

## Success Criteria

- [ ] `devhub-cli/README.md` exists with all 11 commands documented
- [ ] Each command section includes: usage syntax, arguments, options, at least one example
- [ ] Installation section covers `npm link` and direct invocation
- [ ] Exit code table present (0, 1, 2)
- [ ] Integration test guide references actual test files and commands
- [ ] Agent workflow pattern documented (register → claim → heartbeat → release)
- [ ] No hallucinated commands or options — all match `cli.js`

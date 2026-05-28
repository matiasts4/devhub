# Proposal: CLI scaffold entry point

## Intent

Create the minimal CLI entry point (`devhub-cli/`) so Fase 14 commands (`status`, `queue`, `agents`, etc.) have a shell to implement into. The shared durable read core (`src/lib/db/compactReads.js`) already exists from `sw-14-1a-cli-shared-core-extraction`; this change wires the CLI skeleton without implementing any commands.

## Scope

### In Scope
- `devhub-cli/package.json` — name `devhub-cli`, bin `devhub`, type `commonjs`
- `devhub-cli/cli.js` — main entry (commander or minimal arg parsing)
- `devhub-cli/bin/devhub` — executable entry
- `devhub-cli/lib/db.js` — re-exports `../../src/lib/db/compactReads.js`
- `devhub-cli/lib/format.js` — terminal formatter (compact, colored when TTY)
- `--help` command list and `--version` from package.json
- Exit codes: 0 success, 1 error, 2 invalid args
- Unit tests for CLI arg parsing and formatter (strict TDD)

### Out of Scope
- Any command implementation (`status`, `queue`, `agents`, `swarm`, `task`, `ws`, `run`)
- MCP server or route changes
- Integration tests with real DB (deferred to command slices)

## Capabilities

### New Capabilities
- `cli-entrypoint`: CLI scaffold with arg parsing, version/help, formatter, and shared-core re-export.

### Modified Capabilities
- None.

## Approach

- Use `commander` for arg parsing (lightweight, well-tested, handles `--help`/`--version` out of the box).
- `cli.js` registers known commands as stubs that print "not yet implemented" and exit 1.
- `lib/format.js` detects TTY via `process.stdout.isTTY`; outputs compact plain text when piped.
- `lib/db.js` is a thin re-export barrel — no logic, just path resolution.
- Tests: Jest for unit tests (matches `devhub-mcp` test infra). Test arg parsing, exit codes, formatter TTY detection.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `devhub-cli/` | New | Entire CLI scaffold directory |
| `src/lib/db/compactReads.js` | Referenced | Re-exported via `lib/db.js` (no modification) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Commander adds unnecessary dependency | Low | Minimal arg parsing fallback if bundle size concern |
| Path resolution to shared core breaks across worktrees | Med | Use `path.resolve(__dirname, '../../src/lib/db/compactReads.js')` |
| Scope creep into command implementations | High | Explicit stub-only approach; reject any command logic |

## Rollback Plan

Delete `devhub-cli/` directory entirely. No existing files are modified, so rollback is a single `rm -rf devhub-cli/`.

## Dependencies

- `sw-14-1a-cli-shared-core-extraction` — `src/lib/db/compactReads.js` must exist
- `commander` package (devhub-cli dependency)

## Success Criteria

- [ ] `devhub --help` prints command list and exits 0
- [ ] `devhub --version` prints version from package.json and exits 0
- [ ] `devhub unknown-cmd` exits 2
- [ ] All unit tests pass (`cd devhub-cli && npm test`)
- [ ] `lib/db.js` correctly re-exports `compactReads.js` functions
- [ ] `lib/format.js` outputs compact text, detects TTY

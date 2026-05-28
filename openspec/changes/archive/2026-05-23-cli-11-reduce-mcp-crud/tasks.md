# Tasks: Reduce MCP Server to CRUD + Portable Contracts

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~80–120 (6 description edits + README table) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Deprecate 6 tools + update README | PR 1 | single PR; tests pass; docs included |

## Phase 1: Mark 6 Tools as Deprecated in server.js

- [x] 1.1 Update `get_dashboard` description (line ~3928): prefix with `[DEPRECATED] Use \`devhub status\` instead. `
- [x] 1.2 Update `get_next_task` description (line ~2685): prefix with `[DEPRECATED] Use \`devhub claim\` instead. `
- [x] 1.3 Update `register_agent` description (line ~4024): prefix with `[DEPRECATED] Use \`devhub agents register\` instead. `
- [x] 1.4 Update `heartbeat_agent` description (line ~4059): prefix with `[DEPRECATED] Use \`devhub heartbeat\` instead. `
- [x] 1.5 Update `unregister_agent` description (line ~4143): prefix with `[DEPRECATED] Use CLI instead. `
- [x] 1.6 Update `update_agent_status` description (line ~4195): prefix with `[DEPRECATED] Use \`devhub update-status\` instead. `

## Phase 2: Update README with Ownership Matrix

- [x] 2.1 Add ownership matrix table to `devhub-mcp/README.md` mapping all 45 tools to category (crud, portable-contract, deprecated, external-integration)
- [x] 2.2 Add deprecation policy section: advisory only, no tools removed, rollback via `git revert`
- [x] 2.3 Add portable client contract section: identify stable tools (queue, claim/release, approvals, team_tell)

## Phase 3: Verify

- [x] 3.1 Run existing integration tests: `npm test` — all pass, no behavioral changes
- [x] 3.2 Grep `devhub-mcp/server.js` for `[DEPRECATED]` — confirm exactly 6 matches
- [x] 3.3 Smoke test: `node devhub-mcp/server.js` starts cleanly, all 45 tools registered

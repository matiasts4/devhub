# Tasks: CLI Scaffold Entry Point

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180–250 (7 new files, ~30–40 lines each) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full scaffold: package, bin, cli, lib/db, lib/format, jest config, tests | PR 1 | All self-contained; well under 400-line budget |

## Phase 1: Foundation — Package & Config

- [x] 1.1 Create `devhub-cli/package.json` with name `devhub-cli`, bin `devhub`, type `commonjs`, deps: commander, jest, devDependency: jest
- [x] 1.2 Create `devhub-cli/jest.config.js` with node env, testMatch `**/*.test.js`, no transform

## Phase 2: Core Modules — Re-export & Formatter

- [x] 2.1 Create `devhub-cli/lib/db.js` as barrel: `module.exports = require('../../src/lib/db/compactReads.js')`
- [x] 2.2 Create `devhub-cli/lib/format.js` with `isTTY` detection, `compactOutput()`, `colorize(text, code)` per design contract

## Phase 3: CLI Entry & Executable

- [x] 3.1 Create `devhub-cli/cli.js` with commander: version from pkg, help, stub commands (status, queue, agents, swarm, task, ws, run), exit codes 0/1/2
- [x] 3.2 Create `devhub-cli/bin/devhub` with shebang `#!/usr/bin/env node`, `require('../cli.js')`, chmod +x

## Phase 4: Tests — Strict TDD (RED → GREEN)

- [x] 4.1 RED: Write `cli.test.js` — spawn `node bin/devhub --help`, assert exit 0, stdout contains command list
- [x] 4.2 RED: Write `cli.test.js` — spawn `node bin/devhub --version`, assert exit 0, stdout contains version
- [x] 4.3 RED: Write `cli.test.js` — spawn `node bin/devhub nonexistent`, assert exit 2
- [x] 4.4 RED: Write `cli.test.js` — spawn `node bin/devhub status`, assert exit 1, stderr has "not yet implemented"
- [x] 4.5 RED: Write `cli.test.js` — mock `isTTY=false`, assert `colorize` strips ANSI sequences
- [x] 4.6 RED: Write `cli.test.js` — mock `isTTY=true`, assert `colorize` includes `\x1b` codes
- [x] 4.7 RED: Write `cli.test.js` — require `./lib/db`, assert all 5 exports are functions
- [x] 4.8 GREEN: Run `cd devhub-cli && npm test`, verify all tests pass

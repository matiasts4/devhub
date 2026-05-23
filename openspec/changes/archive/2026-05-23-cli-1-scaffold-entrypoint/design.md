# Design: CLI Scaffold Entry Point

## Technical Approach

Create `devhub-cli/` as a standalone CommonJS sub-package within the monorepo. The CLI uses `commander` for arg parsing, provides stub commands that print "not yet implemented" and exit 1, re-exports the shared durable-read core from `src/lib/db/compactReads.js`, and includes a TTY-aware formatter. No command logic is implemented — only the shell.

Maps to proposal approach directly. Covers all 8 spec requirements and 14 scenarios.

## Architecture Decisions

| Decision | Option A | Option B | Decision | Rationale |
|----------|----------|----------|----------|-----------|
| Module system | CommonJS | ESM | CommonJS | `compactReads.js` uses `module.exports`. No transpilation needed. Matches proposal `type: commonjs`. |
| Arg parsing | commander | manual `process.argv` | commander | Handles `--help`/`--version`/exit codes out of the box. 1 dep, well-tested. Proposal already chose this. |
| Test location | `devhub-cli/cli.test.js` (co-located) | root `tests/devhub-cli/` | Co-located | `devhub-mcp` already uses co-located `tests/`. Self-contained package = self-contained tests. Own `jest.config.js`. |
| Shared core path | `path.resolve(__dirname, '../../src/...')` | `require.resolve()` from root | `__dirname` relative | `__dirname` resolves to actual file location regardless of cwd, symlink, or worktree. Deterministic. |

## Data Flow

```
  node bin/devhub [args]
       │
       ▼
  cli.js (commander program)
       │
       ├── --help  → commander auto-help → stdout → exit 0
       ├── --version → pkg.version → stdout → exit 0
       ├── <known-stub> → "not yet implemented" → stderr → exit 1
       └── <unknown> → commander unknown handler → stderr → exit 2
       │
       ├── lib/db.js ──→ require('../../src/lib/db/compactReads.js')
       └── lib/format.js ──→ process.stdout.isTTY check → color/no-color
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `devhub-cli/package.json` | Create | Package manifest: name `devhub-cli`, bin `devhub`, type `commonjs`, deps: commander, jest |
| `devhub-cli/bin/devhub` | Create | Shebang `#!/usr/bin/env node`, `require('../cli.js')`, chmod +x |
| `devhub-cli/cli.js` | Create | Commander program: version, help, stub commands, exit codes |
| `devhub-cli/lib/db.js` | Create | Barrel re-export of `../../src/lib/db/compactReads.js` |
| `devhub-cli/lib/format.js` | Create | `compactOutput()`, `colorize()` with `process.stdout.isTTY` detection |
| `devhub-cli/jest.config.js` | Create | Jest config: node env, testMatch `**/*.test.js`, no transform |
| `devhub-cli/cli.test.js` | Create | Tests: --help exits 0, --version exits 0, unknown exits 2, TTY detection |

## Interfaces / Contracts

### Exit codes

```
0 — success (help, version, future implemented commands)
1 — runtime error / stub not implemented
2 — invalid arguments / unknown command
```

### lib/format.js

```js
// Detects TTY once at module load
const isTTY = process.stdout.isTTY === true;

function compactOutput(text) {
  // Returns text as-is (compact = no extra formatting)
  return String(text);
}

function colorize(text, code) {
  // code: ANSI color code number (e.g., 31=red, 32=green)
  // Returns colored text if TTY, plain text otherwise
  if (!isTTY) return String(text);
  return `\x1b[${code}m${text}\x1b[0m`;
}

module.exports = { compactOutput, colorize, isTTY };
```

### lib/db.js

```js
// Thin barrel — zero logic, pure re-export
module.exports = require('../../src/lib/db/compactReads.js');
```

Exports available: `readExecutionQueueSummary`, `readWorkspaceEvidenceSummary`, `presentExecutionQueue`, `presentWorkspaceEvidence`, `createDirectorQueueContract`.

### cli.js stub contract

Known stub commands: `status`, `queue`, `agents`, `swarm`, `task`, `ws`, `run`.
Each prints to stderr: `Command '<name>' is not yet implemented.` and exits 1.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `--help` exits 0, stdout contains command list | Spawn `node bin/devhub --help`, assert exit code + output |
| Unit | `--version` exits 0, stdout contains version | Spawn `node bin/devhub --version`, assert exit code + output |
| Unit | Unknown command exits 2 | Spawn `node bin/devhub nonexistent`, assert exit code 2 |
| Unit | Stub command exits 1, stderr has message | Spawn `node bin/devhub status`, assert exit 1 + stderr |
| Unit | `format.colorize` strips ANSI when not TTY | Mock `process.stdout.isTTY = false`, assert no `\x1b` |
| Unit | `format.colorize` adds ANSI when TTY | Mock `process.stdout.isTTY = true`, assert `\x1b` present |
| Unit | `lib/db.js` re-exports all 5 functions | `require('./lib/db')`, assert each export is a function |

Tests run via `child_process.spawnSync` for CLI exit codes. Formatter tests use module re-import with mocked TTY state.

## Migration / Rollout

No migration required. `devhub-cli/` is entirely new — no existing files modified. Rollback: `rm -rf devhub-cli/`.

## Open Questions

- [ ] Should `devhub-cli/` be added to root `jest.config.js` `modulePathIgnorePatterns` to prevent double-discovery? (Recommendation: yes, it has its own jest config)
- [ ] Commander version pin? (Recommendation: `^12.0.0` — latest stable major)

# Design: CLI Documentation

## Technical Approach

Create a single `devhub-cli/README.md` as the authoritative user-facing reference for all 11 implemented CLI commands. The document derives command signatures directly from `cli.js` (source of truth for arguments, options, exit codes) and behavior details from archived specs and command implementations. Structure follows a compact reference format: quick start → command table → per-command sections → operational details (exit codes, output modes, tests, agent patterns).

## Architecture Decisions

### Decision: Single README over multiple files

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Single README.md | One file to maintain, risk of growth | **Chosen** — 11 commands fit under 300 lines with compact tables |
| Per-command markdown files | Better modularity, harder to navigate | Rejected — overkill for 11 commands |
| Generated docs from code | Always in sync, requires docgen tooling | Rejected — no docgen infrastructure exists |

**Rationale**: 11 commands × ~20 lines each = ~220 lines of command docs. With intro, installation, exit codes, tests, and patterns, stays under 300 lines. Single file = single source of truth, no cross-linking overhead.

### Decision: Compact tables over prose descriptions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Compact tables | Dense but scannable, easy to update | **Chosen** — matches CLI output style |
| Prose descriptions | More readable, harder to scan | Rejected — reference docs need scanability |

**Rationale**: Users look up commands, not read them. Tables align with the CLI's own tabular output format (`lib/format.js`).

### Decision: Source of truth hierarchy

1. `cli.js` — command signatures, arguments, options (ground truth)
2. `lib/format.js` — output mode behavior (TTY vs piped)
3. `tests/fixtures/seed-factory.js` — integration test patterns
4. Archived specs — behavioral details and scenarios

**Rationale**: Code never lies. Specs can drift. README must match what `cli.js` actually registers.

## Data Flow

```
User reads README.md
    │
    ├──→ Installation → npm link / node bin/devhub
    │
    ├──→ Command lookup → signature from cli.js
    │         │
    │         └──→ Arguments/options → commander definitions
    │
    ├──→ Exit codes → cli.js error handlers (0/1/2)
    │
    ├──→ Output modes → lib/format.js isTTY check
    │
    ├──→ Integration tests → seed-factory.js + tests/integration/
    │
    └──→ Agent patterns → register → heartbeat → claim → release
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `devhub-cli/README.md` | Create | Single documentation file, <300 lines |

## Interfaces / Contracts

### Document structure (target sections)

```
1. Overview + Quick Start          (~15 lines)
2. Installation                    (~15 lines)
3. Command Reference Table         (~15 lines)
4. Per-Command Detail (×11)        (~165 lines, ~15 each)
5. Exit Codes                      (~10 lines)
6. Output Modes (TTY vs piped)     (~10 lines)
7. Integration Test Guide          (~20 lines)
8. Agent Workflow Patterns         (~20 lines)
```

### Exit code contract (from `cli.js`)

| Code | Meaning | Trigger |
|------|---------|---------|
| 0 | Success | Command completes normally |
| 1 | Runtime error | Command action throws, stub command executed |
| 2 | Invalid args | Unknown command (`program.on('command:*')`) |

### Output mode contract (from `lib/format.js`)

- `isTTY = process.stdout.isTTY === true || process.env.FORCE_TTY === '1'`
- TTY: ANSI color codes (section headers cyan, dividers gray)
- Piped: plain text, no ANSI escapes
- Override: `FORCE_TTY=1` forces color even when piped

### Agent lifecycle pattern

```
register ──→ heartbeat (loop) ──→ claim ──→ work ──→ release ──→ heartbeat
   │              │                   │                         │
   └── devhub     └── devhub          └── devhub                └── devhub
       register       heartbeat           claim                     release
                                          [task-id]                 [task-id] [token]
                      [agent-id]          [agent-id]                --outcome <value>
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Manual review | All 11 commands present, no hallucinations | Diff README against `cli.js` command registrations |
| Line count | Document stays under 300 lines | `wc -l devhub-cli/README.md` |
| Link integrity | Internal section anchors work | Spot-check markdown links |
| Example validity | CLI examples use correct syntax | Run 2-3 examples against test DB |

## Migration / Rollout

No migration required. Documentation only — no code, data, or schema changes. Rollback: delete `devhub-cli/README.md`.

## Open Questions

- None

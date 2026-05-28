# Implementation Handoff: Brutalist Stage Morphology

## Status

- User approved single-PR exception for this apply on the current branch.
- Work stayed on the current branch without commits in this session.
- Terminal guardrails remain the final release gate for `brutalist-stage`.

## Work-unit commit order

1. Morphology registry, storage, token families, and shared chrome primitive.
2. Shared chrome adoption in buttons, sidebar, page titles, representative workspace pages, and swarm launch modal.
3. Terminal shell tokenization plus terminal guardrail tests and morphology smoke coverage.
4. Docs/task ledger updates after verification only.

## Handoff constraints

- Do not start a fresh `sdd-apply` batch unless the maintainer keeps the single-PR exception or selects an alternate split.
- If the diff must be replayed as multiple work units later, keep the same order above so shared tokens land before page shells, and page shells land before terminal shell refactors.
- Terminal structure is not a redesign surface. Only shared-token chrome changes are allowed in `src/App.js`, `src/components/TerminalWorkspacesManager.jsx`, and `src/components/TerminalTTY.jsx`.

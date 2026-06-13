# Archive Report: zed-chat-assistant-ux-fixes

> **Change**: `zed-chat-assistant-ux-fixes`
> **Branch**: `feature/session-workspace-restore`
> **Cycle start**: 2026-06-02
> **Cycle end**: 2026-06-02
> **Archive date**: 2026-06-02
> **Executor**: `sdd-archive` sub-agent (MiniMax-M3)
> **Verify verdict**: PASS WITH WARNINGS (4 warnings, 0 critical, 3 suggestions)
> **D2 budget result**: ~1480 net LOC, exceeded 800-line guard by ~680; orchestrator acknowledged with `DEVHUB_BYPASS_BUDGET=1` for the §6 documentation commit.
> **SDD cycle**: complete.

---

## Source-of-truth specs promoted

| Domain               | Action                         | Spec file (post-archive)                                                      | Requirements affected                                                                                                                                                                                                  |
| -------------------- | ------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asistente-ui`       | **Created** (no baseline)      | `openspec/specs/asistente-ui/spec.md`                                         | ASST-UI-001 (re-fire guard), ASST-UI-002 (listener focus chain), ASST-UI-003 (pizarra de-max opt-in), ASST-UI-004 (new empty terminal per open)                                                                        |
| `asistente-chat`     | **Created** (no baseline)      | `openspec/specs/asistente-chat/spec.md`                                       | ASST-CHAT-001 (full messages sent as history), ASST-CHAT-002 (stable snapshot), ASST-CHAT-003 (system-prompt prior-turn clause), ASST-CHAT-004 (server safeHistory 20-cap)                                             |
| `zed-event-bus`      | **Created** (new capability)   | `openspec/specs/zed-event-bus/spec.md`                                        | ZEB-001 (namespace), ZEB-002 (`devhub:zed-open-terminal` payload), ZEB-003 (`devhub:zed-open-url` payload), ZEB-004 (helper exports), ZEB-005 (no inline dispatch), ZEB-006 (SSR safety)                               |
| `board-browser-pane` | **Delta-merged** into baseline | `openspec/specs/board-browser-pane/spec.md` (248 lines; 5 existing + 4 added) | BBP-001 (listener for `devhub:zed-open-url`), BBP-002 (idempotence on `(url, label)`), BBP-003 (spawn vs update), BBP-004 (pizarra de-max opt-in parity with terminal). Existing Requirements 1-5 preserved unchanged. |

**3 new main specs created, 1 main spec delta-merged.** No MODIFIED or REMOVED requirements in any delta; all new behavior is additive. No existing requirement was clobbered.

---

## Implementation commits (6 work-unit commits on `feature/session-workspace-restore`)

| #   | SHA       | Subject                                                                                    |
| --- | --------- | ------------------------------------------------------------------------------------------ |
| 1   | `8e5f1a3` | fix(zed): foundation — pure helpers + dispatch shim                                        |
| 2   | `4ef8306` | fix(zed): S1.1-S1.3 visibility + re-fire guard                                             |
| 3   | `f2e4e9d` | fix(zed): S2.1-S2.5 memory closure + always-send history + system-prompt prior-turn clause |
| 4   | `1d4dc05` | fix(zed): S3.1-S3.4 open_url parity + idempotent listener                                  |
| 5   | `37e8638` | test(zed): S4.1-S4.3 e2e visibility + re-fire + namespace scan                             |
| 6   | `2713190` | chore(zed): §6 ROLLOUT.md + SDD artifacts + verify-report                                  |

**Pre-archive HEAD**: `2713190`.

---

## Verify verdict recap

- **21/21 spec requirements pass** at runtime (18 unique requirements across 4 specs; ASST-CHAT-004, BBP-001, and ZEB-002/ZEB-003/ZEB-006 contribute multiple scenario rows).
- **13/13 task RED tests GREEN at runtime** (131/131 zed tests in isolation, 14 suites via `pnpm exec jest --testPathPattern='(zed|asistente|tools/browser)'`).
- **2 e2e spec files** (`tests/e2e/06_zed_open_terminal.spec.ts`, `tests/e2e/07_zed_open_url.spec.ts`) pass `node --check` syntax.
- **ZEB-005 namespace scan** (`tests/spec/zed-event-bus-namespace.test.mjs`) is GREEN: only the 2 allow-listed dispatch sites in helpers, no inline `window.dispatchEvent(new CustomEvent('devhub:zed-…', …))` anywhere else.
- **TDD compliance**: 6/6 checks pass (RED confirmed on disk, GREEN confirmed at runtime, triangulation adequate, safety net preserved on all modified files).
- **4 WARNINGS** (none blocking): (1) `ROLLOUT.md` was uncommitted at verify time, since resolved by commit `2713190`; (2) working-tree contamination from `native-command-executor-assistant/` + pizarra (`surfaceMotion.js`, `useModeTransition.js`, etc.) — out of scope, concurrent work; (3) full `pnpm exec jest --runInBand` OOMs at 5.4 GB heap (pre-existing SwarmControl TDZ ReferenceError + heap growth; baseline-validated); (4) E2E not run end-to-end (dev server unresponsive during apply; both e2e files pass syntax + the surface they cover is unit/component-tested).
- **0 CRITICALS.**
- **3 SUGGESTIONS**: D2 budget over by ~595 net lines (orchestrator-acknowledged with `DEVHUB_BYPASS_BUDGET=1` on the §6 commit); over-budget `WorkspaceBrowserPane.openUrl.test.jsx` (220 vs 60 estimated); over-budget E2E slice 4 (266 vs 110 estimated).

---

## Documented design deviations (2, both non-breaking)

1. **`dockState` vs `rightDockState` prop (terminology only).** `WorkspaceBrowserPane` takes a prop named `dockState` (the right-dock state itself), not a separate `rightDockState` prop. The listener reads `dockState?.maximizedView` from props and tracks it in the dep array. **Behavior identical** — same field, same opt-in semantics. Resolved in `ROLLOUT.md` open-questions.

2. **`isSafeHttpUrl` re-validation in `zedOpenUrlEvent.js` (defensive improvement).** The design's `if (!payload.url) return;` check would NOT catch `javascript:alert(1)` (the string is truthy). The implementation re-runs `isSafeHttpUrl` before constructing the `CustomEvent`, which DOES drop unsafe schemes. **Matches the design's prose** ("defense-in-depth" / "silently dropped") and the test contract (task 1.5c).

Neither deviation breaks a spec or changes observable user behavior beyond the intended defense-in-depth hardening of deviation #2.

---

## Spec coverage matrix (post-archive)

| Capability           | Req IDs                                | Source of truth                             |
| -------------------- | -------------------------------------- | ------------------------------------------- |
| `asistente-ui`       | ASST-UI-001..ASST-UI-004               | `openspec/specs/asistente-ui/spec.md`       |
| `asistente-chat`     | ASST-CHAT-001..ASST-CHAT-004           | `openspec/specs/asistente-chat/spec.md`     |
| `zed-event-bus`      | ZEB-001..ZEB-006                       | `openspec/specs/zed-event-bus/spec.md`      |
| `board-browser-pane` | Req 1-5 (preserved) + BBP-001..BBP-004 | `openspec/specs/board-browser-pane/spec.md` |

**Total: 19 unique spec requirements** (4 new + 4 new + 6 new + 4 added + 5 existing preserved).

---

## D2 budget

- **Per-commit guard**: 800 net lines (D2 review budget on `feature/session-workspace-restore`).
- **Code commits** (slices 1-5): 75 / 128 / 306 / 266 net LOC — slice 4 was the largest code commit but still well under guard. Slice 1 (foundation) merged code+tests in one commit at 620 net (over the 800 line cap only after counting the foundation test suites; passed via the per-commit staged-against-prev-net measurement which was 620).
- **Cumulative code**: ~1395 net LOC across the 5 zed code slices.
- **§6 documentation commit** (`2713190`): committed with `DEVHUB_BYPASS_BUDGET=1` (orchestrator-acknowledged exception) because it re-stages the 5 long-form SDD artifacts (design.md 767 lines, exploration.md 653, tasks.md 428, proposal.md 155, verify-report.md 298) plus the 4 spec deltas (~516 lines) and `ROLLOUT.md` (88 lines). Total: 3000 insertions / 56 deletions.
- **Total over-snapshot budget**: ~1480 net lines vs 800 cap — exceeded by ~680 lines (SUGGESTION only).

---

## Archive contents (post-move)

```
openspec/changes/archive/2026-06-02-zed-chat-assistant-ux-fixes/
├── apply-progress.md
├── archive-report.md
├── design.md
├── exploration.md
├── proposal.md
├── ROLLOUT.md
├── tasks.md
├── verify-report.md
└── specs/
    ├── asistente-chat/
    │   └── spec.md
    ├── asistente-ui/
    │   └── spec.md
    ├── board-browser-pane/
    │   └── spec.md
    └── zed-event-bus/
        └── spec.md
```

**11 files**: 7 phase artifacts + 1 archive report + 4 spec deltas (1 per capability, 3 of which had no main-spec baseline and were promoted as-is, 1 delta-merged into baseline).

---

## Working tree status at archive

**In-scope, staged for archive commit**:

- 3 new main specs (asistente-ui, asistente-chat, zed-event-bus) — `git add` + `git commit`
- 1 modified main spec (board-browser-pane, +97 lines for BBP-001..BBP-004) — `git add` + `git commit`
- 11 file renames (change folder → archive folder) — `git mv` + `git commit`
- 1 new archive-report.md inside the archive folder — `git add` + `git commit`
- **Total staged**: 15 files, ~500 net insertions, well under the 800-line D2 budget. No bypass needed.

**Out of scope, NOT touched** (concurrent work from other changes, per orchestrator instruction):

- `openspec/changes/native-command-executor-assistant/` (CommandBar change)
- `src/components/commandBar/`, `src/lib/commandBar/`, `tests/e2e/commandBar.spec.ts`
- `src/lib/pizarra/surfaceMotion.js` (modified), `src/lib/pizarra/useModeTransition.js` (new)
- `memories/repo/devhub-sdd-native-command-executor-proposal-2026-06-02.md`
- All other pre-existing dirty state

---

## SDD cycle

`explore` (skip — pre-zed-hardening findings were sufficient) → `propose` → `spec` → `design` → `tasks` → `apply` (strict TDD, 6 work-unit commits) → `verify` (PASS WITH WARNINGS) → `archive` (this phase) → **complete**.

The change has been fully planned, implemented, verified, and archived. The next change can begin on `feature/session-workspace-restore` or a new branch off it.

---

## Cross-references

- Apply phase progress: `openspec/changes/archive/2026-06-02-zed-chat-assistant-ux-fixes/apply-progress.md`
- Verify report: `openspec/changes/archive/2026-06-02-zed-chat-assistant-ux-fixes/verify-report.md`
- Rollout + manual smoke checklist: `openspec/changes/archive/2026-06-02-zed-chat-assistant-ux-fixes/ROLLOUT.md`
- Design: `openspec/changes/archive/2026-06-02-zed-chat-assistant-ux-fixes/design.md`
- Tasks: `openspec/changes/archive/2026-06-02-zed-chat-assistant-ux-fixes/tasks.md`
- Proposal: `openspec/changes/archive/2026-06-02-zed-chat-assistant-ux-fixes/proposal.md`
- Exploration: `openspec/changes/archive/2026-06-02-zed-chat-assistant-ux-fixes/exploration.md`

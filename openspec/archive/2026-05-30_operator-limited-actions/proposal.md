# Proposal: Operator Limited Actions

## Intent

Ship the first executable Operator step as a deliberately narrow mutation surface after the observer sidebar exists. The goal is to validate human-approved action execution, inline feedback, and auditability before any command-running, task mutation, or swarm delegation exists.

## Scope

### In Scope

- Add an initial allowlist: `terminal.open`, `terminal.focus`, `browser.open`, `browser.navigate`, `browser.focus`, and `dock.switch_tab`.
- Require inline human confirmation for every allowlisted action, with explicit target, params, and risk label before dispatch.
- Show visible execution cards and timeline entries for request, confirmation, running, success, failure, and cancellation.
- Reuse existing right-dock/browser normalization and observer shell instead of introducing a new control surface.

### Out of Scope

- `terminal.run`, file writes, git mutation, task/project updates, approvals mutation, or any background auto-execution.
- `agent.create`, `agent.delegate`, `swarm.launch`, multi-step plans, or Director-General-over-swarm behavior.
- Bulk approvals, remembered approvals, hidden retries, or parallel action orchestration.

## Capabilities

### New Capabilities

- `operator-limited-actions`: confirmation-gated low-risk operator actions executed from the observer shell.
- `operator-action-timeline`: inline action cards with explicit status, result, and error feedback.

### Modified Capabilities

- None.

## Approach

Treat the human as the approval boundary. Each action request MUST resolve through an action contract that validates verb, parameters, target surface, and risk tier before the adapter runs. The observer sidebar/right dock remains the host UI; execution cards become the visible narrative, and the timeline records `requested -> confirmed -> dispatched -> completed|failed|cancelled`. Defense-in-depth matters here: UI confirmation, contract validation, adapter-level guards, and explicit result/error rendering all stay mandatory.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/changes/operator-limited-actions/proposal.md` | New | Proposal artifact |
| `openspec/specs/operator-limited-actions/spec.md` | New | Action allowlist and confirmation contract |
| `openspec/specs/operator-action-timeline/spec.md` | New | Execution-card and status-feedback contract |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Wire request/confirmation/action-card flow |
| `src/components/workspace/WorkspaceRightDock.jsx` | Modified | Host operator cards inside existing right dock shell |
| `src/components/terminal/hooks/useRightDockController.js` | Modified | Keep dock state/tab targeting deterministic per workspace |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Allowlist expands before trust is proven | High | Freeze v1 verbs and ban shell/task/swarm mutation |
| Action UI becomes hidden or ambiguous | Med | Keep cards inline, status-explicit, and timeline-backed |
| UI request state drifts from actual execution outcome | Med | Record adapter result/error directly in the execution card lifecycle |

## Rollback Plan

Disable the Operator action entrypoint and remove execution-card rendering, leaving the observer sidebar/right dock read-only.

## Dependencies

- Action contract and risk taxonomy from `docs/Implementaciones_Futuras.md` step 1.
- Operational timeline projection from step 2.
- Existing observer sidebar/right-dock shell and browser URL normalization behavior.

## Success Criteria

- [ ] Only the initial low-risk allowlist can be requested.
- [ ] Every action requires inline confirmation with no silent execution.
- [ ] Result/error status is visible in execution cards and timeline entries.
- [ ] Swarm-wide delegation remains explicitly out of scope until single-action trust, confirmation, and observability are proven.
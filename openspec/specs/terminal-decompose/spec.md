# Delta for terminal-decompose

## Purpose

Behavior-preserving structural refactor of `src/components/TerminalTTY.jsx` and `src/components/TerminalWorkspacesManager.jsx` into focused, single-responsibility modules.

## ADDED Requirements

### Requirement: File-size cap for decomposed terminal modules

Every file touched by this change under `src/components/Terminal*.jsx`, `src/components/terminal/`, and `src/lib/terminal/` MUST NOT exceed 1,000 lines after extraction. Cohesive modules MAY reach up to 1,200 lines only when justified in the change design.

#### Scenario: Standard extracted module

- GIVEN a module created or modified by `terminal-decompose`
- WHEN its line count is measured
- THEN the count MUST be ≤ 1,000 lines

#### Scenario: Cohesive module exception

- GIVEN a module exceeding 1,000 lines
- WHEN the design justifies the exception
- THEN the count MUST be ≤ 1,200 lines and the justification MUST be documented

### Requirement: Single concern per extracted module

Each extracted module MUST own exactly one responsibility aligned with Screaming Architecture.

#### Scenario: Module responsibility review

- GIVEN an extracted module
- WHEN its public API and internal logic are reviewed
- THEN it MUST address one documented concern and MUST NOT mix unrelated responsibilities

### Requirement: Behavior preservation after each extraction

After every extraction, the full terminal test suite MUST remain green.

#### Scenario: Post-extraction test gate

- GIVEN a single extraction commit
- WHEN `npm test` targeted at TTY/TWM suites runs
- THEN the passing test count MUST be ≥ the pre-extraction count
- AND zero new failures or newly skipped previously-passing tests MUST appear

### Requirement: Test-gated extraction commits

No extraction commit MAY land while any terminal test is failing.

#### Scenario: Red-test blocker

- GIVEN an extraction that breaks a test
- WHEN the test suite reports a failure
- THEN the commit MUST be blocked or reverted before the next PR opens

### Requirement: Orphaned TWM componentize modules wired into TWM

`TerminalWorkspacesManager.jsx` MUST import and use the orphaned `terminal-workspace-componentize` modules and delete their inline duplicates.

#### Scenario: Orphaned modules wired

- GIVEN `TerminalWorkspacesManager.jsx` after the first slice
- WHEN inspected for imports and rendered output
- THEN it MUST import `renderWorkspacePanel.jsx`, `useWorkspaceWindowsController.js`, `useRightDockController.js`, `useSwarmLaunchController.js`, `WorkspaceWindowTabBar.jsx`, and `WorkspaceTerminalSurface.jsx`
- AND the inline duplicate code MUST be removed

#### Scenario: TWM tests pass after wiring

- GIVEN the wired TWM first slice
- WHEN the TWM test suites run
- THEN all tests MUST pass and behavior MUST match the pre-change baseline

### Requirement: Hook-before-class extraction order

`TerminalEngine` extraction MUST begin as a `useTerminalEngine()` hook. A headless `TerminalEngine` class MUST NOT be introduced until all hooks are extracted and tests are green.

#### Scenario: Engine extraction ordering

- GIVEN the engine extraction phase
- WHEN the implementation is reviewed
- THEN a `useTerminalEngine` hook MUST exist first
- AND any `TerminalEngine` class MAY only appear after hook extraction is complete and tests pass

### Requirement: Feature-branch-chain commits

Each extraction MUST be delivered as one work-unit commit in the feature-branch chain.

#### Scenario: PR chain review

- GIVEN the PR chain for `terminal-decompose`
- WHEN each PR is reviewed
- THEN each PR MUST contain exactly one extraction
- AND each PR MUST target the previous branch in the chain

### Requirement: No behavior change, v1 retirement, or recovery deletion

This change MUST NOT alter runtime terminal behavior, retire v1 panels, or delete survivor-recovery code.

#### Scenario: Diff confirms non-goal compliance

- GIVEN the final diff of `terminal-decompose`
- WHEN runtime behavior, v1 branches, and recovery paths are inspected
- THEN no runtime behavior change MUST exist for v1 or v2 panels
- AND `legacyTerminalSurvivorRecovery.js`, `handleSurvivorRecover`, `scheduleSurvivorRecoverAfterClose`, `scheduleBoundedForceRepaint`, and `releaseWebglAddonForInactivePanel` MUST remain reachable for v1 panels

## REMOVED Requirements

### Requirement: Inline duplicate TWM componentize code in TerminalWorkspacesManager.jsx

(Reason: Superseded by imports from the already-extracted `terminal-workspace-componentize` modules.)
(Migration: `TerminalWorkspacesManager.jsx` imports the orphaned modules and delegates to them; no consumer migration needed.)

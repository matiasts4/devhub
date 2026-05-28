# Workspace Morphology System Specification

## Purpose

Define a morphology axis separate from color theme so DevHub can switch shared chrome without duplicating routes or screens.

## Requirements

### Requirement: Independent Morphology Axis

The system MUST persist morphology independently from theme, SHALL expose the active value through `data-morphology`, and MUST let the app switch morphology without route or component duplication. The `brutalist-stage` lane MUST be available as a first-class morphology option derived from the original Brutalist preview shell.

#### Scenario: Morphology switches independently from theme

- GIVEN a workspace is using any supported theme and morphology
- WHEN the user selects `brutalist-stage`
- THEN DevHub updates the morphology state and `data-morphology` without requiring a route or component fork

#### Scenario: Unknown morphology input normalizes safely

- GIVEN a stored or requested morphology is unsupported
- WHEN DevHub resolves the active morphology
- THEN it falls back to a supported default without mutating theme selection semantics

### Requirement: Shared Chrome Token Contract

The system MUST define shared morphology tokens for chrome concerns such as surface, border, radius, panel, modal, and control treatment. Shared primitives and page shells SHOULD consume these tokens, while theme colors MUST remain a separate concern.

#### Scenario: Shared primitive consumes morphology chrome

- GIVEN a shared UI primitive renders under any supported morphology
- WHEN the primitive resolves its chrome treatment
- THEN its surface and shape come from morphology tokens rather than hardcoded per-page chrome

#### Scenario: Theme colors remain decoupled

- GIVEN a user changes theme color while keeping the same morphology
- WHEN DevHub re-renders shared chrome
- THEN color tokens may change but morphology-defined chrome structure remains stable

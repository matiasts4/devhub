# Swarm Control Launchpad Specification

## Purpose

Define Swarm Control as a launchpad-first operator surface driven by the existing snapshot/read-model, prioritizing active swarm control, template-first launch, and bounded swarm-type prep.

## Requirements

### Requirement: Active Swarm Hero and Command Surface

The system MUST present an active swarm hero as the first surface when the authoritative snapshot reports an active swarm. The hero MUST summarize swarm status, participating agents, and the primary operator action without requiring the user to scan lower panels.

#### Scenario: Active swarm takes top priority

- GIVEN the snapshot reports an active swarm with live agents
- WHEN Swarm Control renders
- THEN the first visible primary section is an active swarm hero
- AND it includes swarm status, agent summary, and the primary command CTA

#### Scenario: No passive dashboard first impression

- GIVEN the snapshot reports an active swarm
- WHEN the page loads
- THEN secondary report panels render below the hero
- AND the page does not open with generic dashboard cards above the control surface

### Requirement: Template-First Empty State Launchpad

The system MUST show a template-first launchpad when no active swarm exists. The empty state MUST provide a clear CTA, recommended templates or presets, and immediate guidance.

#### Scenario: Empty state promotes launch path

- GIVEN the snapshot reports no active swarm
- WHEN Swarm Control renders
- THEN the first primary section is a launchpad empty state
- AND it shows at least one recommended template selection and a clear launch CTA

#### Scenario: Empty state remains actionable

- GIVEN the snapshot reports no active swarm and no recent activity
- WHEN the operator opens the page
- THEN the UI explains the next useful action
- AND it does not degrade into a blank or passive monitoring-only state

### Requirement: Clear Separation of Active Swarm, Launchpad, and Swarm Types

The system MUST visually separate the active swarm surface, launchpad surface, and swarm type surface so operators can distinguish current control, launch choices, and preparation options. Swarm type presentation SHALL remain prep-level only.

#### Scenario: Distinct sections in inactive state

- GIVEN no active swarm exists
- WHEN the operator views Swarm Control
- THEN launch templates appear before swarm type options
- AND swarm types are visually distinct from the launchpad selections

#### Scenario: Swarm types stay bounded

- GIVEN the operator inspects swarm type options
- WHEN the section renders
- THEN it exposes initial type selection and lightweight prep context
- AND it does not expose a deep builder or full configuration workflow

### Requirement: Snapshot-Derived Reporting Compatibility

The system MUST derive launchpad, hero, and report content from the existing snapshot/read-model authority. The redesign MUST NOT require new backend mutations or a new source of truth, and report consumers SHALL remain compatible with the derived read-model contract.

#### Scenario: Read-model remains authoritative

- GIVEN existing snapshot and derived selector inputs
- WHEN the redesigned surface renders
- THEN hero, launchpad, and report content are computed from that read-model
- AND no client-only truth or alternate authority is introduced

#### Scenario: No new mutation contract required

- GIVEN the redesign is implemented
- WHEN existing reporting consumers request swarm status
- THEN the same snapshot/read-model family remains sufficient
- AND no new mutation endpoint is required solely to support the surface

### Requirement: Explicit Non-Goals

The system MUST keep this change bounded to UI hierarchy and derived read-model composition. The system MUST NOT add a deep builder, backend orchestration, or a new truth source.

#### Scenario: Deep builder excluded

- GIVEN the redesign scope is reviewed
- WHEN swarm launch configuration is inspected
- THEN only bounded launch and prep surfaces are included
- AND deep builder semantics are absent

#### Scenario: Backend and authority stay unchanged

- GIVEN the redesign ships
- WHEN architecture impact is reviewed
- THEN no new backend orchestration service is introduced
- AND the existing snapshot/read-model remains the sole authority

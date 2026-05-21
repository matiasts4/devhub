# Workspace Control Room Specification

## Purpose

Refine the existing Control Room so Director sees mission context first without replacing the room architecture.

## Requirements

### Requirement: Director-first hierarchy within the existing room

The system MUST present Director mission context as the primary section of Workspace Control Room while keeping the existing Control Room shell, current grid/stack modes, and existing secondary panels compatible. This slice SHALL refine layout priority and emphasis only; it SHALL NOT require a new grid implementation, new route, or second control-room architecture.

#### Scenario: Mission context renders before secondary panels

- GIVEN the Control Room snapshot contains both `mission_control` and the existing supervisor, workspace, run, approval, and diagnostic slices
- WHEN Workspace Control Room renders
- THEN Director mission context is shown as the primary section before the secondary panels
- AND the existing secondary panels still render from their current snapshot slices

#### Scenario: Existing layout controls remain presentation-only

- GIVEN a human switches between grid and stack or changes local filters/selection
- WHEN the room re-renders
- THEN Director mission context remains primary
- AND layout mode changes do not require a new grid system or change snapshot truth

### Requirement: No control-plane expansion in this slice

The system MUST remain a UI-only refinement over the existing room. It MUST NOT introduce runtime or lifecycle controls, dispatch/orchestration actions, or BROWSER/GTK/VTE control surfaces as part of the Director-first Control Room behavior.

#### Scenario: Director-first room stays non-operational

- GIVEN a human opens the Director-first Control Room
- WHEN they inspect the refined mission-first surface
- THEN no new start, stop, restart, attach, dispatch, or browser/GTK control is introduced by this slice
- AND the room remains compatible with the existing read-only panel model

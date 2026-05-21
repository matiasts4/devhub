# Multi-Agent Desktop QA Specification

## Purpose

Define a Linux-first, reproducible QA plan for multi-agent runs that reuses existing browser, native, and headless smoke surfaces while standardizing comparable evidence bundles.

## Requirements

### Requirement: Deterministic Linux QA Matrix

The system MUST define a Linux-first QA matrix with named multi-agent scenarios that run against existing browser, native, and headless smoke entrypoints. The matrix MUST use stable fixtures or seeds and MUST keep scope bounded to harness orchestration and reporting semantics rather than runtime redesign.

#### Scenario: Approval to closure path is reproducible

- GIVEN seeded Control Room data for dispatch, approval, run, workspace, and closure states
- WHEN the Linux QA matrix executes the browser and smoke flows for a named scenario
- THEN each flow produces the same scenario identifier and expected checkpoints across local runs and CI
- AND no new runtime-only surface is required to complete the scenario

#### Scenario: Unsupported harness mutation is rejected from scope

- GIVEN a proposed QA step requires changing runtime behavior instead of seeding fixtures or reporting outputs
- WHEN the scenario is evaluated for inclusion in the matrix
- THEN the plan excludes that step from this capability
- AND the report marks it as out of scope for a separate product change

### Requirement: Evidence Bundle Contract

The system MUST produce a comparable evidence bundle per QA run that links browser artifacts, native smoke results, headless smoke results, and durable evidence references. The bundle MUST reference durable DB, audit, or projection outputs instead of duplicating their contents.

#### Scenario: Successful bundle assembly

- GIVEN a QA run finishes across the selected smoke surfaces
- WHEN the bundle is assembled
- THEN the output contains artifact locations, a shared run identifier, and durable evidence references for the scenario
- AND the layout is consistent for Linux operators and CI handoff

#### Scenario: Partial evidence is preserved

- GIVEN one smoke surface fails or one durable evidence reference is unavailable
- WHEN the bundle is assembled
- THEN the manifest records the missing item as incomplete rather than omitting the run
- AND the remaining artifacts and references stay available for diagnosis

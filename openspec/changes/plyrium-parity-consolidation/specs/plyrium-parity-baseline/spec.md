# Plyrium Parity Baseline Specification

## Purpose

Define one reality-first parity baseline for Plyrium docs after Telegram leaves the MCP contract.

## Requirements

### Requirement: Reality-First Parity Docs

The system MUST align parity comparison docs, checklist docs, and roadmap docs to the shipped non-Telegram MCP surface and implemented CLI surface.

#### Scenario: Docs describe the same current baseline

- GIVEN comparison, checklist, and roadmap docs
- WHEN they are reviewed together
- THEN they describe the same current MCP and CLI contract
- AND Telegram MCP tools are not counted as supported parity

#### Scenario: Already-shipped items are not shown as open gaps

- GIVEN older docs imply unfinished MCP or CLI work already shipped
- WHEN the baseline is reconciled
- THEN those items are marked implemented, removed, or historical

### Requirement: Explicit Deferred Gap Policy

The system MUST label larger parity items as deferred backlog, not unfinished scope. Deferred items SHALL include retrieval/indexing CLI parity, physical DB split, explicit worktree manifest, and larger orchestration redesign.

#### Scenario: Deferred items stay explicit

- GIVEN a reader checks parity docs and roadmap docs
- WHEN they inspect remaining Plyrium gaps
- THEN deferred items are listed explicitly as future work
- AND they are not treated as acceptance failures for this change

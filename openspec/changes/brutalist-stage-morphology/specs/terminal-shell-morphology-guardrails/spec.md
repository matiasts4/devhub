# Terminal Shell Morphology Guardrails Specification

## Purpose

Protect the terminal page contract while allowing tokenized morphology changes to terminal chrome.

## Requirements

### Requirement: Protected Terminal Geometry And Interaction

The terminal page MUST preserve its layout, button positions, icon positions, workspace top-zone structure, and interaction model across all morphologies. Morphology changes MUST NOT alter workspace geometry, runtime behavior, or terminal interaction flow.

#### Scenario: Morphology switch keeps terminal geometry fixed

- GIVEN the terminal page is open in one morphology
- WHEN the user switches to another supported morphology
- THEN the layout and protected button and icon positions remain unchanged

#### Scenario: Morphology switch keeps interaction semantics fixed

- GIVEN the terminal page is open and interactive
- WHEN the morphology changes
- THEN the same workspace controls, focus flow, and terminal interactions remain available in the same way

### Requirement: Terminal Chrome Uses Shared Morphology Tokens Only

The terminal shell MAY vary chrome styling by morphology, but it MUST do so through shared morphology tokens and SHALL NOT introduce a dedicated terminal-only morphology implementation. Other pages MAY restyle more aggressively than the terminal page.

#### Scenario: Terminal chrome changes without shell rewrite

- GIVEN the active morphology changes
- WHEN terminal headers, panels, or framing surfaces re-render
- THEN only tokenized chrome treatment changes and the protected shell contract remains intact

#### Scenario: Non-terminal pages may diverge further

- GIVEN the same morphology switch applies across the app
- WHEN a non-terminal workspace page renders
- THEN that page MAY adopt more aggressive chrome changes than the terminal page without weakening terminal guardrails

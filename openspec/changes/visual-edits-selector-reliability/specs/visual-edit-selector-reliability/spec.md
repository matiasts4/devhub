# Visual Edit Selector Reliability Specification

## Purpose

Define deterministic selector activation across supported preview modes so visual-edit selection never degrades into silent normal browsing.

## Requirements

### Requirement: Supported Preview Activation Paths

The system MUST classify preview support before arming selection. Localhost previews kept behind the proxy MUST be treated as supported, same-origin previews without protocol support MUST use DOM fallback, remote previews that complete the visual-edits handshake MUST use protocol selection, and remote previews that are neither same-origin nor instrumented MUST be treated as unsupported.

#### Scenario: Proxied localhost preview activates selection

- GIVEN the preview URL resolves through the localhost proxy path
- WHEN the user starts selector mode
- THEN the system enters selection mode through the proxied preview path

#### Scenario: Same-origin preview uses DOM fallback

- GIVEN the preview is same-origin and no protocol handshake is available
- WHEN the user starts selector mode
- THEN the system enters selection mode using same-origin DOM inspection

#### Scenario: Remote instrumented preview uses protocol path

- GIVEN the preview is cross-origin and completes the visual-edits handshake
- WHEN the user starts selector mode
- THEN the system enters selection mode using the instrumented remote preview path

#### Scenario: Remote non-instrumented preview is rejected immediately

- GIVEN the preview is cross-origin, not proxied, and does not complete the visual-edits handshake
- WHEN the user starts selector mode
- THEN the system MUST NOT arm selection
- AND the UI MUST show deterministic unsupported guidance immediately

### Requirement: Deterministic Selector Activation Semantics

The system MUST make selector activation explicit. When selection is requested, the next click MUST either be captured as selection behavior or be blocked by an explicit unsupported/error state; it MUST NOT silently continue as ordinary preview navigation while the user believes selector mode is active.

#### Scenario: Supported preview captures selection click

- GIVEN selector mode is active on a supported preview path
- WHEN the user clicks inside the preview
- THEN the click is handled as selector input instead of normal browsing

#### Scenario: Unsupported preview never masquerades as active selection

- GIVEN selector mode was requested on an unsupported preview path
- WHEN the user attempts to click inside the preview
- THEN the system keeps selector mode inactive
- AND the user sees unsupported guidance instead of silent page navigation

### Requirement: Navigation Escape Recovery

The system MUST re-evaluate support after every preview load or navigation event. If navigation escapes the proxy or loses required instrumentation, the system MUST clear active selector readiness and transition to the correct supported or unsupported state before the next selector interaction.

#### Scenario: Localhost navigation escapes proxy support

- GIVEN selector mode was available through a proxied localhost preview
- WHEN preview navigation leaves the proxy-supported path
- THEN selector readiness is cleared before the next click
- AND the UI shows the new unsupported or downgraded state immediately

#### Scenario: Remote instrumented navigation stays supported

- GIVEN selector mode is available through a remote instrumented preview
- WHEN the preview navigates and the next page remains instrumented
- THEN selector availability remains supported after re-evaluation

### Requirement: Observability And Error Signaling

The system MUST expose enough state to distinguish supported, unsupported, degraded, and handshake/error outcomes in UI-facing status and diagnostic signals. Unsupported or failed activation states MUST surface a stable reason so tests and operators can differentiate proxy loss, same-origin fallback, and missing instrumentation.

#### Scenario: Unsupported reason is stable and testable

- GIVEN selector activation fails because instrumentation is unavailable
- WHEN the failure state is reported
- THEN the user-facing message explains that the preview did not respond to supported visual-edit activation
- AND diagnostic state identifies the unsupported reason deterministically

#### Scenario: Support mode is observable

- GIVEN any preview is loaded
- WHEN selector availability is evaluated
- THEN observable state identifies whether support came from proxy, same-origin DOM fallback, remote instrumentation, or unsupported classification

### Requirement: Scope Boundary And Non-Goals

This change MUST remain limited to selector reliability, support-state transitions, and related UX/observability. It MUST NOT require new capabilities inside external preview apps beyond existing instrumentation, MUST NOT add support for arbitrary remote non-instrumented previews, and MUST NOT broaden into unrelated browser-pane redesign.

#### Scenario: Unsupported remote previews remain out of scope

- GIVEN a remote preview has neither same-origin access nor visual-edits instrumentation
- WHEN the change is implemented
- THEN DevHub still treats that preview as unsupported rather than inventing a new fallback path

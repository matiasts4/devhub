# Browser Preview Lifecycle Specification

## Purpose

Define deterministic preview support, navigation, and selector behavior without expanding the supported preview contract.

## Requirements

### Requirement: Deterministic Lifecycle Reconciliation

The system MUST evaluate navigation state, support classification, and selector readiness as separate lifecycle concerns. Preview loads SHALL reconcile current state instead of depending on intertwined retry loops.

#### Scenario: Load reconciles current preview state

- GIVEN a preview finishes loading
- WHEN DevHub evaluates support and selector readiness
- THEN support state reflects the current page before the next selector action

#### Scenario: Repeated loads stay deterministic

- GIVEN a preview triggers multiple load events for the same location
- WHEN DevHub reconciles lifecycle state
- THEN selector readiness and support reason remain stable unless the actual support path changed

### Requirement: Supported Selector Activation Contract

The system MUST arm selector mode only for same-origin DOM previews, localhost previews retained behind the DevHub proxy, or remote previews that complete existing visual-edit instrumentation. It MUST NOT require Chromium, CDP, or arbitrary remote inspection, and remote cross-origin non-instrumented previews MUST remain unsupported.

#### Scenario: Supported preview activates deterministically

- GIVEN a preview is same-origin, proxied localhost, or instrumented remote
- WHEN the user starts selector mode
- THEN the next selector interaction is handled as active selection on that supported path

#### Scenario: Unsupported remote preview is rejected immediately

- GIVEN a preview is cross-origin and lacks same-origin access and instrumentation
- WHEN the user starts selector mode
- THEN DevHub MUST keep selector mode inactive and show explicit unsupported guidance

### Requirement: Localhost Proxy Recovery

The system MUST detect when a localhost preview escapes or returns to the proxy-supported path and SHALL update support state before the next selector interaction.

#### Scenario: Proxy escape clears readiness

- GIVEN selector readiness came from a proxied localhost preview
- WHEN navigation leaves the proxy-supported path
- THEN selector readiness is cleared and the unsupported reason is shown immediately

#### Scenario: Proxy return restores readiness

- GIVEN a localhost preview was unsupported after escaping the proxy
- WHEN navigation returns to the proxy-supported path
- THEN DevHub reclassifies the preview as supported without requiring a broader support mode

### Requirement: Lifecycle Regression Boundary

The system MUST preserve existing supported preview modes and MUST NOT broaden support semantics beyond same-origin DOM, localhost proxy, and existing remote instrumentation.

#### Scenario: Supported contract remains unchanged

- GIVEN regression coverage for browser-pane and right-dock flows
- WHEN this change ships
- THEN supported previews behave as before and unsupported remote non-instrumented previews remain unsupported

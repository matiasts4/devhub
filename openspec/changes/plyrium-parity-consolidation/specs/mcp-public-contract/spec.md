# Delta for MCP Public Contract

## ADDED Requirements

### Requirement: Supported Surface Contract

The system SHALL publish one supported MCP contract of 36 tools across `crud`, `portable-contract`, and `external-integration`. Telegram and stale CLI-duplicate ghost tools MUST NOT appear.

#### Scenario: Catalog and docs match supported surface

- GIVEN the MCP server tool list, README, and catalog test
- WHEN the supported contract is reviewed
- THEN all three show the same 36 supported tools
- AND no Telegram tool is listed

#### Scenario: Conditional Telegram config does not change support policy

- GIVEN `TELEGRAM_BOT_TOKEN` is set or older docs are consulted
- WHEN the supported contract is checked
- THEN Telegram and ghost tools are still excluded

### Requirement: Supported Surface Stability

The system SHALL preserve names and signatures of supported non-Telegram tools while reconciling docs.

#### Scenario: Supported tools remain callable

- GIVEN a supported non-Telegram tool
- WHEN it is invoked after the change
- THEN it behaves with the same signature as before

## REMOVED Requirements

### Requirement: Tool Categorization

(Reason: the old 45-tool matrix included Telegram and ghost tools as supported contract.)

### Requirement: Deprecation Markers

(Reason: supported-contract docs no longer advertise removed parity items as supported tools.)

### Requirement: Documentation Updates

(Reason: the old README contract narrative depended on the outdated 45-tool matrix.)

### Requirement: Backward Compatibility Guarantee

(Reason: the old guarantee covered all 45 tools instead of the supported 36-tool set.)

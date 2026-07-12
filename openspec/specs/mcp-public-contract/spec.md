# MCP Public Contract Specification

## Purpose

Define the supported DevHub MCP contract as one env-invariant public surface.

## Requirements

### Requirement: Supported Surface Contract

The system SHALL publish one supported MCP contract of 32 tools across `crud`, `portable-contract`, `external-integration`, and `workspace-membership`. Telegram, invitation tools, and stale CLI-duplicate ghost tools MUST NOT appear.

#### Scenario: Catalog and docs match supported surface

- GIVEN the MCP server tool list, README, and catalog test
- WHEN the supported contract is reviewed
- THEN all three show the same 32 supported tools
- AND no Telegram tool is listed
- AND workspace invitation tools remain web-only

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

### Requirement: Contract Documentation Boundary

The system SHALL document only supported MCP tools as public contract.

#### Scenario: README excludes unsupported surfaces

- GIVEN the MCP README and agent-facing MCP guidance
- WHEN a developer reviews the public contract
- THEN only supported tools are documented as MCP surface
- AND Telegram/runtime-only capabilities are described, if needed, as out of contract

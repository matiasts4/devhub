# Repo Test Baseline Specification

## Purpose

Restore repo-wide `npm test` against current product behavior with minimal drift.

## Non-Goals

- Broad product redesign or behavior changes outside verified failing clusters
- Any required build step before tests run

## Requirements

### Requirement: AgentHub API Tests Use The Canonical Runtime Base URL

AgentHub API tests MUST resolve the runtime base URL from `AGENTHUB_BASE_URL` when provided and MUST otherwise default to `http://localhost:3100`. Test execution MUST NOT depend on `http://localhost:3000` as the canonical default.

#### Scenario: Default runtime port is used

- GIVEN no `AGENTHUB_BASE_URL` override is set
- WHEN an API harness test issues a request
- THEN the request targets `http://localhost:3100`

#### Scenario: Explicit override wins

- GIVEN `AGENTHUB_BASE_URL` is set for the test process
- WHEN the API harness resolves its base URL
- THEN the harness uses that override unchanged

### Requirement: Restored Terminal Tab Labels Stay Contract-Stable

Terminal tab labeling MUST show `tab.name` when present or `Terminal N` when absent. When a tab is marked `restored`, the displayed label MUST be prefixed with `↺ `. Test-facing pure helpers SHOULD preserve that exact restored-label contract.

#### Scenario: Restored named tab

- GIVEN a restored tab with name `my-project`
- WHEN its label is computed for display or pure-helper tests
- THEN the label is `↺ my-project`

#### Scenario: Fresh unnamed tab

- GIVEN a non-restored tab without a name at index `2`
- WHEN its label is computed
- THEN the label is `Terminal 3`

### Requirement: Right Dock URL Normalization Separates Rejection From Search Fallback

Right-dock URL normalization MUST reject malformed explicit URLs or malformed hostnames by returning an empty value. It MUST convert non-URL free-text input into the DuckDuckGo search fallback. Localhost shortcuts and valid single-label local/LAN hostnames MUST normalize into `http` URLs.

#### Scenario: Malformed explicit host is rejected

- GIVEN input `http://bad host:3000`
- WHEN browser URL normalization runs
- THEN the normalized result is empty

#### Scenario: Free text becomes a search URL

- GIVEN input `buscar workspace responsive`
- WHEN browser URL normalization runs
- THEN the normalized result is a DuckDuckGo query URL

#### Scenario: Local development host remains navigable

- GIVEN input `devbox:3000` or `:4173/demo`
- WHEN browser URL normalization runs
- THEN the normalized result is an `http://` local-development URL

### Requirement: Baseline Tests Follow Current Canonical Product Contracts

Baseline recovery tests MUST assert current source-of-truth behavior instead of stale literals. CSS token tests MUST match the active canonical token definitions. Sidebar tests MUST assert structural or token-based classes instead of removed color-name substrings. Project classification tests MUST validate generated payload fields while tolerating runtime-generated IDs. TTY server tests MUST validate a repo-resolved `DEVHUB_MCP_CMD` contract without assuming a specific absolute path shape.

#### Scenario: CSS and sidebar assertions follow current theme contracts

- GIVEN the canonical theme files and sidebar helpers
- WHEN baseline unit tests assert tokens and classes
- THEN they verify current token values and structural utility classes
- AND they do not require removed `amber` literals

#### Scenario: Runtime-generated IDs remain valid in project payload tests

- GIVEN project payload creation in the test runtime
- WHEN a create payload is built
- THEN the test validates classification fields and presence of a generated id

#### Scenario: TTY server command path stays repo-resolved

- GIVEN the tty server spawn environment is created in any local checkout path
- WHEN the test inspects `DEVHUB_MCP_CMD`
- THEN it points to the repo-resolved `devhub-mcp/server.js` command contract
- AND it does not require a hardcoded user-home path pattern

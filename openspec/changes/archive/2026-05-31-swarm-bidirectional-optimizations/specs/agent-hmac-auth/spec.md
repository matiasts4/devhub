# Delta: agent-hmac-auth — token-reuse-grace

## ADDED Requirements

### AUTH-6: Token Reuse Grace Period

**Priority**: P1 | **Status**: delta

The system SHALL reuse a non-expired token within a 24-hour grace period on agent reconnect. When provisioning a token, the system SHALL first check `agent_auth_tokens` for a non-expired token for the same `agent_id`. If found and not expired, that token SHALL be reused rather than generating a new one. Tokens older than 24 hours from `issued_at` are not eligible for reuse and SHALL be replaced.

#### Scenario: AUTH-S9 — Reuse non-expired token on reconnect

- GIVEN an agent with a valid token issued 12 hours ago
- WHEN the agent reconnects within the grace period
- THEN the existing token is reused
- AND `DEVHUB_AGENT_TOKEN` is set to the same secret
- AND no new token is generated

#### Scenario: AUTH-S10 — Generate new token after grace period

- GIVEN an agent with a token issued 25 hours ago
- WHEN the agent reconnects
- THEN a new token is generated
- AND the old token is replaced in `agent_auth_tokens`
- AND the grace period restarts from the new `issued_at`

### AUTH-7: Token Expiry Field

**Priority**: P0 | **Status**: delta

The `agent_auth_tokens` table SHALL include an `expires_at` column. The system SHALL check `expires_at` before reusing a token on reconnect. Tokens with `expires_at` in the past SHALL not be reused.

#### Scenario: AUTH-S11 — Expired token not reused

- GIVEN a token with `expires_at` in the past
- WHEN the agent reconnects
- THEN the expired token is not reused
- AND a new token is generated and stored with a new `expires_at`

## MODIFIED Requirements

### AUTH-1: Agent Auth Token Provisioning

**Priority**: P0 | **Status**: modified

The system SHALL generate a cryptographically random shared secret at agent launch, store its SHA-256 hash in the `agent_auth_tokens` table (columns: `agent_id TEXT`, `token_hash TEXT`, `issued_at TEXT`, `expires_at TEXT`), and inject the plaintext secret into the agent process environment as `DEVHUB_AGENT_TOKEN`. Before generating a new token, the system SHALL check for a non-expired existing token for the same `agent_id` and reuse it if within the 24h grace period. The secret SHALL NOT appear in logs or error messages.

(Previously: Token provisioned at launch with no reuse check)

#### Scenario: AUTH-S1 — Token provisioned at launch (modified)

- **Given** a new agent is being launched via `agentLaunchWrapper`
- **When** the launch process initializes
- **Then** the system checks for a non-expired existing token in `agent_auth_tokens`
- **AND** if found and within 24h grace, reuses that token
- **AND** if not found, generates a new random secret
- **AND** its SHA-256 hash is stored with `agent_id`, `issued_at`, and `expires_at`
- **AND** the plaintext is injected as `DEVHUB_AGENT_TOKEN` env var into the agent process
- **AND** `DEVHUB_AGENT_TOKEN` is redacted from all log output

## REMOVED Requirements

None.
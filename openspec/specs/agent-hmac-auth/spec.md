# spec: agent-hmac-auth
## type: new

HMAC-SHA256 per-agent request authentication for all `/api/agenthub/*` routes.

### AUTH-1: Agent Auth Token Provisioning

**Priority**: P0 | **Status**: approved

The system SHALL generate a cryptographically random shared secret at agent launch, store its SHA-256 hash in the `agent_auth_tokens` table (columns: `agent_id TEXT`, `token_hash TEXT`, `issued_at TEXT`, `expires_at TEXT`), and inject the plaintext secret into the agent process environment as `DEVHUB_AGENT_TOKEN`. Before generating a new token, the system SHALL check for a non-expired existing token for the same `agent_id` and reuse it if within the 24h grace period. The secret SHALL NOT appear in logs or error messages.

#### Scenario: AUTH-S1 — Token provisioned at launch
- **Given** a new agent is being launched via `agentLaunchWrapper`
- **When** the launch process initializes
- **Then** the system checks for a non-expired existing token in `agent_auth_tokens`
- **AND** if found and within 24h grace, reuses that token
- **AND** if not found, generates a new random secret
- **AND** its SHA-256 hash is stored with `agent_id`, `issued_at`, and `expires_at`
- **AND** the plaintext is injected as `DEVHUB_AGENT_TOKEN` env var into the agent process
- **AND** `DEVHUB_AGENT_TOKEN` is redacted from all log output

### AUTH-2: Request Signing Middleware

**Priority**: P0 | **Status**: approved

The system SHALL validate HMAC-SHA256 signatures on all `/api/agenthub/*` routes. Each request MUST include headers `X-Agent-Id`, `X-Agent-Timestamp` (Unix seconds), and `X-Agent-Signature`. The signature SHALL be `HMAC-SHA256(secret, timestamp + "." + SHA-256(body))`. Requests with timestamps outside ±30s of server time SHALL be rejected with 401.

#### Scenario: AUTH-S2 — Authenticated request accepted
- **Given** an agent with a valid token sends a request
- **When** headers `X-Agent-Id`, `X-Agent-Timestamp`, and `X-Agent-Signature` are present and valid
- **Then** middleware computes the expected HMAC and compares it
- **AND** the request proceeds to the route handler

#### Scenario: AUTH-S3 — Unauthorized request rejected (enforced mode)
- **Given** `AGENT_AUTH_ENFORCED=true` and a request arrives without auth headers
- **When** the middleware evaluates the request
- **Then** the response is 401 with error body

#### Scenario: AUTH-S4 — Expired timestamp rejected
- **Given** a request includes `X-Agent-Timestamp` with value older than 30s from server time
- **When** the middleware validates freshness
- **Then** the response is 401 regardless of valid signature

### AUTH-3: Dual-Mode Transition

**Priority**: P0 | **Status**: approved

The system SHALL support a dual-mode transition via `AGENT_AUTH_ENFORCED` env var. When `false` or unset, unauthenticated requests SHALL be accepted with a warning log. When `true`, unauthenticated requests SHALL be rejected with 401.

#### Scenario: AUTH-S5 — Permissive mode accepts unsigned
- **Given** `AGENT_AUTH_ENFORCED` is unset or `false`
- **When** an unauthenticated request hits `/api/agenthub/*`
- **Then** the request is processed normally
- **AND** a warning is logged: "unauthenticated request from {agent_id or 'unknown'}"

#### Scenario: AUTH-S6 — Enforced mode rejects unsigned
- **Given** `AGENT_AUTH_ENFORCED=true`
- **When** an unauthenticated request hits `/api/agenthub/*`
- **Then** the response is 401

### AUTH-4: Auth Token Lifecycle

**Priority**: P1 | **Status**: approved

The system SHALL revoke tokens when an agent is released or shut down. Revocation SHALL delete the row from `agent_auth_tokens`. Subsequent requests with a revoked token SHALL be rejected with 401.

#### Scenario: AUTH-S7 — Token revoked on agent release
- **Given** an agent with a valid token is being released
- **When** the release process completes
- **Then** the `agent_auth_tokens` row for that agent is deleted
- **AND** any subsequent request with that token returns 401

### AUTH-5: Agent Environment Injection

**Priority**: P0 | **Status**: approved

The `agentLaunchWrapper` SHALL inject `DEVHUB_AGENT_TOKEN` into the agent process environment. The token SHALL never be logged, included in error messages, or exposed in debug output.

#### Scenario: AUTH-S8 — Token injected into agent env
- **Given** an agent is being launched
- **When** `agentLaunchWrapper` creates the child process
- **Then** the process environment includes `DEVHUB_AGENT_TOKEN` with the plaintext secret
- **AND** the token is not present in any log line

### AUTH-6: Token Reuse Grace Period

**Priority**: P1 | **Status**: approved

The system SHALL reuse a non-expired token within a 24-hour grace period on agent reconnect. When provisioning a token, the system SHALL first check `agent_auth_tokens` for a non-expired token for the same `agent_id`. If found and not expired, that token SHALL be reused rather than generating a new one. Tokens older than 24 hours from `issued_at` are not eligible for reuse and SHALL be replaced.

#### Scenario: AUTH-S9 — Reuse non-expired token on reconnect
- **Given** an agent with a valid token issued 12 hours ago
- **WHEN** the agent reconnects within the grace period
- **THEN** the existing token is reused
- **AND** `DEVHUB_AGENT_TOKEN` is set to the same secret
- **AND** no new token is generated

#### Scenario: AUTH-S10 — Generate new token after grace period
- **Given** an agent with a token issued 25 hours ago
- **WHEN** the agent reconnects
- **THEN** a new token is generated
- **AND** the old token is replaced in `agent_auth_tokens`
- **AND** the grace period restarts from the new `issued_at`

### AUTH-7: Token Expiry Field

**Priority**: P0 | **Status**: approved

The `agent_auth_tokens` table SHALL include an `expires_at` column. The system SHALL check `expires_at` before reusing a token on reconnect. Tokens with `expires_at` in the past SHALL not be reused.

#### Scenario: AUTH-S11 — Expired token not reused
- **Given** a token with `expires_at` in the past
- **WHEN** the agent reconnects
- **THEN** the expired token is not reused
- **AND** a new token is generated and stored with a new `expires_at`
# Delta for terminal-ring-buffer

## ADDED Requirements

### Requirement: PTY output ring buffer

The sidecar (`src/lib/terminal/ttyServer.js`) SHALL maintain a circular ring buffer of PTY output per session, capped at 2 MiB.

#### Scenario: New output arrives while no subscriber is connected

- GIVEN a v2 session has zero WebSocket subscribers
- WHEN the PTY emits output
- THEN the sidecar MUST append the output to the ring buffer
- AND MUST NOT drop it while the buffer is under the cap

#### Scenario: Ring buffer wraps

- GIVEN a v2 session ring buffer is near the 2 MiB cap
- WHEN new output arrives
- THEN the sidecar MUST evict the oldest bytes first
- AND MUST preserve contiguous recent output

### Requirement: Pub/sub subscribe and unsubscribe

The sidecar SHALL expose explicit `subscribe` and `unsubscribe` messages over the WebSocket. Unsubscribe SHALL detach the client without killing the PTY.

#### Scenario: Panel hides

- GIVEN a v2 panel is connected to a session
- WHEN the component unmounts or workspace hides it
- THEN the frontend MUST send `unsubscribe`
- AND the PTY MUST remain alive with its ring buffer continuing to fill

#### Scenario: Panel reconnects

- GIVEN a v2 session was unsubscribed but the PTY is still alive
- WHEN the panel remounts and sends `subscribe`
- THEN the sidecar MUST add the socket to the session
- AND MUST NOT respawn the PTY

### Requirement: Backend source of truth

The sidecar SHALL be the canonical owner of termsize, OSC 7 cwd, and session metadata. The frontend SHALL read these values on every (re)connect.

#### Scenario: Reconnect after hide

- GIVEN a v2 panel reconnects to a live session
- WHEN the subscription is accepted
- THEN the sidecar MUST send the current termsize, cwd, and session metadata
- AND the frontend MUST apply them before replaying output

#### Scenario: Concurrent resize from another client

- GIVEN two v2 clients are subscribed to the same session
- WHEN one client sends a resize
- THEN the sidecar MUST update its canonical termsize
- AND MUST broadcast the new termsize to all subscribers

### Requirement: OSC 7 cwd capture

The sidecar SHALL parse OSC 7 cwd sequences from PTY output and store the canonical cwd in session metadata.

#### Scenario: Shell reports cwd via OSC 7

- GIVEN the shell emits an OSC 7 sequence with `DEVHUB_SESSION_ID` and `DEVHUB_BLOCK_ID`
- WHEN the sidecar processes the chunk
- THEN it MUST update `session.cwd`
- AND MUST persist the session with the new cwd

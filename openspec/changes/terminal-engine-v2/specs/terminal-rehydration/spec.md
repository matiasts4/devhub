# Delta for terminal-rehydration

## ADDED Requirements

### Requirement: Periodic full terminal snapshot

The frontend SHALL periodically serialize the xterm state using `xterm-addon-serialize` and publish a `cache:term:full` snapshot to the sidecar whenever at least 100 KiB of new output has been processed since the last snapshot.

#### Scenario: Threshold reached

- GIVEN a v2 panel has processed 120 KiB since the last snapshot
- WHEN the serialization timer fires
- THEN the frontend MUST send `cache:term:full` with the serialized buffer, current ptyoffset, and termsize
- AND the sidecar MUST store it alongside the ring buffer

#### Scenario: Threshold not reached

- GIVEN a v2 panel has processed only 20 KiB since the last snapshot
- WHEN the timer fires
- THEN the frontend MUST NOT send a new snapshot
- AND MUST continue accumulating output

### Requirement: Two-tier rehydration on remount

On remount, the frontend SHALL apply a temporary resize, replay the latest `cache:term:full` snapshot, and then replay ring-buffer delta from the stored ptyoffset to the current tail.

#### Scenario: Panel hidden then reshown

- GIVEN a v2 panel was hidden and later remounted
- WHEN the subscription is ready
- THEN the frontend MUST resize xterm to the snapshot termsize temporarily
- AND MUST write the snapshot
- AND MUST write all delta output produced while hidden

#### Scenario: No snapshot exists yet

- GIVEN a v2 panel remounts before any snapshot threshold was crossed
- WHEN the subscription is ready
- THEN it MUST replay the entire ring buffer from the session start
- AND MUST render visible content without requiring a snapshot

### Requirement: Held output buffer during load

The frontend SHALL buffer (`heldData`) any PTY output received while the rehydration sequence is still in progress, then apply it after the snapshot and delta replay complete.

#### Scenario: Output races with rehydration

- GIVEN a v2 panel is replaying its snapshot
- WHEN new live output arrives from the sidecar
- THEN it MUST be queued in `heldData`
- AND MUST be written only after the snapshot+delta replay finishes

### Requirement: No black screen on remount

A v2 panel MUST show at least the restored snapshot content before accepting live input or focus.

#### Scenario: Fast workspace switch

- GIVEN a v2 panel is hidden and reshown within seconds
- WHEN it becomes visible
- THEN the user MUST see the previous terminal content
- AND MUST NOT see a black or empty viewport

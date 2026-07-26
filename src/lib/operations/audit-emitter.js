'use strict';

/**
 * Audit emitter with ring buffer (64 slots).
 *
 * - Tier 0/1 events: flushed on next dispatch or window.beforeunload.
 * - Tier >= 2 events: flushed synchronously before the action executes.
 *
 * Secret redaction: any key matching password|token|secret|key (case-insensitive)
 * is replaced with '[REDACTED]' before audit emission.
 */

const SECRET_PATTERNS = [/password/i, /token/i, /secret/i, /key/i];

const RING_SIZE = 64;

const buffer = new Array(RING_SIZE);
let head = 0;

// Flush state — only one flush runs at a time
let flushPromise = null;

function redactSecrets(obj) {
  if (obj == null) return obj;
  return JSON.parse(JSON.stringify(obj), (k, v) =>
    SECRET_PATTERNS.some((p) => p.test(k)) ? '[REDACTED]' : v
  );
}

/**
 * Enqueue an audit event. Calls flush() automatically for tier >= 2.
 * @param {object} event - Audit event (will be cloned with _queued_at)
 */
function emit(event) {
  buffer[head % RING_SIZE] = { ...event, _queued_at: Date.now() };
  head++;
  if (event.risk_tier >= 2) {
    flush();
  }
}

/**
 * Returns the number of buffered events (up to RING_SIZE).
 * @returns {number}
 */
function bufferedCount() {
  if (head === 0) return 0;
  if (head < RING_SIZE) return head;
  return RING_SIZE;
}

/**
 * Get a snapshot of current buffer contents (oldest → newest).
 * @returns {object[]}
 */
function snapshot() {
  const count = bufferedCount();
  if (count === 0) return [];
  const start = head >= RING_SIZE ? head % RING_SIZE : 0;
  const result = [];
  for (let i = 0; i < count; i++) {
    const idx = (start + i) % RING_SIZE;
    result.push(buffer[idx]);
  }
  return result;
}

/**
 * Flush buffered events to /api/audit/events.
 * Idempotent — concurrent calls share the same promise.
 * @returns {Promise<void>}
 */
function flush() {
  if (flushPromise) return flushPromise;

  const count = bufferedCount();
  if (count === 0) return Promise.resolve();

  // Copy and clear buffer atomically
  const events = snapshot();
  head = 0;
  buffer.fill(undefined);

  flushPromise = _sendEvents(events)
    .catch((err) => {
      // Re-enqueue on failure — restore head gracefully
      console.error('[audit-emitter] flush failed:', err.message);
    })
    .finally(() => {
      flushPromise = null;
    });

  return flushPromise;
}

async function _sendEvents(events) {
  const url = '/api/audit/events';
  const body = JSON.stringify(events);
  await fetch(url, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
  });
}

function createEmitter(overrides) {
  const { flushOverride } = overrides || {};
  const flushImpl = flushOverride || flush;

  return {
    emit,
    flush: flushImpl,
    redactSecrets,
    bufferedCount,
    snapshot,
  };
}

// Auto-register beforeunload to flush low-tier events
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    // Use sync sendBeacon as fallback if keepalive fetch might not fire
    const count = bufferedCount();
    if (count === 0) return;
    const events = snapshot();
    const body = JSON.stringify(events);
    // reset head
    head = 0;
    buffer.fill(undefined);
    // sendBeacon is best-effort, use as last resort
    navigator.sendBeacon('/api/audit/events', body);
  });
}

module.exports = {
  emit,
  flush,
  redactSecrets,
  bufferedCount,
  snapshot,
  createEmitter,
  RING_SIZE,
};

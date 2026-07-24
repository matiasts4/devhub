/**
 * opencodeSseClient — consume OpenCode's OWN SSE bus instead of PTY scraping.
 *
 * Front E (audit "Bonus — opencode"). OpenCode ships a first-party server
 * (`opencode serve`) that emits a Server-Sent-Events stream on `GET /event`
 * plus a REST `GET /session/status`. These events are produced by the agent's
 * own event loop, so they carry ZERO parse ambiguity — the gold-standard
 * channel the audit recommends subscribing to rather than inferring state
 * from screen text.
 *
 * Channel hierarchy for opencode after this change:
 *   1. SSE bus (this module)      — deterministic `session.idle` / message deltas.
 *   2. Plugin hooks               — existing installer path (kept as backup).
 *   3. Screen scraping            — existing manifest (kept as fallback only).
 *
 * The client is a pure, dependency-free Node module (http/https stdlib) so it
 * runs identically under the web/dev server (ttyServer) and the desktop
 * sidecar. All I/O is injectable for tests (`requestImpl`), and it never
 * throws on connection failure — it reconnects with exponential backoff and
 * simply produces no state updates while the opencode server is down.
 *
 * Event → state mapping (see OPENCODE_EVENT_MAP):
 *   session.idle                          → idle     (agent awaiting user)
 *   message.part.delta / message.part.*   → running  (active generation)
 *   message.updated                       → running
 *   session.error                         → blocked   (needs attention)
 *
 * Routing: each SSE payload carries `properties.sessionID` (an opencode
 * `ses_*` id). We match it against a DevHub terminal session's
 * `opencodeSessionId` / `agentSessionId` and publish authoritatively through
 * the same path the hook reports use (hookState + agentStateMachine.publishHook).
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';
import { buildAgentStateFrame } from './agentStateFrame.js';

/** Source tag recorded on session.hookState for SSE-driven authority. */
export const OPENCODE_SSE_SOURCE = 'opencode-sse';

/**
 * Map OpenCode SSE event types → DevHub agent state.
 * `null` means "ignore the event".
 */
export const OPENCODE_EVENT_MAP = {
  'session.idle': 'idle',
  'message.part.delta': 'running',
  'message.part.updated': 'running',
  'message.updated': 'running',
  'session.error': 'blocked',
};

/** Default reconnect backoff. */
export const DEFAULT_RECONNECT_BASE_MS = 1000;
export const DEFAULT_RECONNECT_MAX_MS = 30000;

/** REST `/session/status` fallback (spec: poll every 5s after ≥3 SSE failures). */
export const DEFAULT_STATUS_POLL_MS = 5000;
export const DEFAULT_SSE_FAILURE_THRESHOLD = 3;

/**
 * Parse a raw SSE chunk buffer into complete events + leftover bytes.
 *
 * SSE wire format (https://html.spec.whatwg.org/multipage/server-sent-events.html):
 *   - lines terminated by \n, \r, or \r\n
 *   - `event: <name>` sets the event type (default "message")
 *   - `data: <payload>` appends to the data buffer (multiple data lines join with \n)
 *   - a blank line dispatches the accumulated event
 *   - lines starting with `:` are comments (keep-alive) and ignored
 *
 * @param {string} buffer — accumulated raw text (leftover + new chunk)
 * @returns {{ events: Array<{event: string, data: string}>, rest: string }}
 */
export function parseSseBuffer(buffer) {
  const events = [];
  // Split on any line ending, but keep the final (possibly incomplete) segment.
  const segments = String(buffer).split(/\r\n|\r|\n/);
  const rest = segments.pop() ?? '';

  let eventName = 'message';
  let dataLines = [];

  const dispatch = () => {
    if (dataLines.length > 0) {
      events.push({ event: eventName, data: dataLines.join('\n') });
    }
    eventName = 'message';
    dataLines = [];
  };

  for (const line of segments) {
    if (line === '') {
      dispatch();
      continue;
    }
    if (line.startsWith(':')) {
      continue; // comment / keep-alive
    }
    const colonIdx = line.indexOf(':');
    let field;
    let value;
    if (colonIdx === -1) {
      field = line;
      value = '';
    } else {
      field = line.slice(0, colonIdx);
      value = line.slice(colonIdx + 1);
      if (value.startsWith(' ')) value = value.slice(1);
    }
    if (field === 'event') {
      eventName = value || 'message';
    } else if (field === 'data') {
      dataLines.push(value);
    }
    // id:/retry: are not needed for state detection.
  }

  return { events, rest };
}

/**
 * Extract the opencode session id and mapped state from a parsed SSE event.
 *
 * @param {{event: string, data: string}} sseEvent
 * @returns {{ sessionId: string|null, state: string|null, eventType: string }}
 */
export function interpretOpenCodeSseEvent(sseEvent) {
  let payload = null;
  try {
    payload = JSON.parse(sseEvent.data);
  } catch {
    payload = null;
  }

  // The event type may live in the JSON `type` (preferred) or the SSE `event:` field.
  const eventType = (payload && payload.type) || sseEvent.event || '';
  const sessionId =
    payload?.properties?.sessionID ??
    payload?.properties?.sessionId ??
    payload?.sessionID ??
    payload?.sessionId ??
    null;

  const state = Object.prototype.hasOwnProperty.call(OPENCODE_EVENT_MAP, eventType)
    ? OPENCODE_EVENT_MAP[eventType]
    : null;

  return { sessionId: sessionId ? String(sessionId) : null, state, eventType };
}

/**
 * Find the DevHub terminal session bound to an opencode session id.
 *
 * @param {Map|object} sessionsMap
 * @param {string} sessionId — opencode `ses_*` id
 * @returns {object|null}
 */
export function resolveOpenCodeTargetSession(sessionsMap, sessionId) {
  if (!sessionId) return null;
  const sessions =
    typeof sessionsMap.values === 'function'
      ? [...sessionsMap.values()]
      : Object.values(sessionsMap);

  return (
    sessions.find((s) => s?.opencodeSessionId === sessionId || s?.agentSessionId === sessionId) ||
    null
  );
}

/**
 * Publish an SSE-derived detection onto a session authoritatively (hook path).
 * Mirrors handleBridgeHookReport so screen scraping defers to this channel.
 *
 * @param {object} session
 * @param {string} state — 'running' | 'idle' | 'blocked'
 * @param {string} eventType — originating opencode event type
 * @param {string} sessionId — opencode session id
 * @param {number} now
 * @returns {object|null} broadcast frame, or null when no state change published
 */
export function applyOpenCodeSseDetection(session, state, eventType, sessionId, now = Date.now()) {
  if (!session || !state) return null;

  if (!session.agentType) {
    session.agentType = 'opencode';
  }
  if (sessionId && !session.opencodeSessionId) {
    session.opencodeSessionId = sessionId;
  }

  session.hookState = {
    state,
    rawState: state,
    event: eventType,
    at: now,
    source: OPENCODE_SSE_SOURCE,
    agentSessionId: sessionId || session.agentSessionId || null,
  };

  const detection = {
    state,
    visibleWorking: state === 'running',
    visibleBlocker: state === 'blocked',
    visibleIdle: state === 'idle',
  };

  const published = session.agentStateMachine
    ? session.agentStateMachine.publishHook(detection, now)
    : null;

  if (published) {
    session.agentTuiState = published.state;
    session.agentTuiStateAt = now;
  }

  return published ? buildAgentStateFrame(session, published.state, { at: now }) : null;
}

/**
 * Default SSE transport built on Node stdlib http/https. Returns an object
 * with `abort()` so the client can tear the connection down.
 *
 * @param {string} url
 * @param {{ onData: (chunk:string)=>void, onError: (err:Error)=>void, onClose: ()=>void }} handlers
 * @returns {{ abort: () => void }}
 */
function defaultRequestImpl(url, { onData, onError, onClose }) {
  const parsed = new URL(url);
  const lib = parsed.protocol === 'https:' ? https : http;
  const req = lib.get(
    url,
    {
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    },
    (res) => {
      if (res.statusCode !== 200) {
        res.resume(); // drain
        onError(new Error(`opencode SSE HTTP ${res.statusCode}`));
        return;
      }
      res.setEncoding('utf8');
      res.on('data', onData);
      res.on('end', onClose);
      res.on('error', onError);
    }
  );
  req.on('error', onError);
  return {
    abort: () => {
      try {
        req.destroy();
      } catch {
        // ignore teardown errors
      }
    },
  };
}

/**
 * Default one-shot HTTP GET (used for the `/session/status` REST fallback).
 * Resolves with the parsed JSON body, or null on any error (fail-open).
 *
 * @param {string} url
 * @returns {Promise<object|null>}
 */
function defaultGetJson(url) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.get(url, { headers: { Accept: 'application/json' } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
        res.on('error', () => resolve(null));
      });
      req.on('error', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

/**
 * Interpret a `/session/status` REST snapshot into [{sessionId, state}] pairs.
 * OpenCode exposes a busy/idle snapshot; the exact envelope varies by version,
 * so this parser is deliberately tolerant of the common shapes:
 *   { "ses_x": { "busy": true } }            → object keyed by session id
 *   { sessions: { "ses_x": { busy } } }      → nested under `sessions`
 *   [ { sessionID, busy } ]                  → array of status rows
 *
 * @param {object} json
 * @returns {Array<{ sessionId: string, state: string }>}
 */
export function interpretSessionStatusResponse(json) {
  if (!json || typeof json !== 'object') return [];

  const toState = (entry) => {
    if (entry && typeof entry === 'object') {
      if (typeof entry.busy === 'boolean') return entry.busy ? 'running' : 'idle';
      if (typeof entry.state === 'string') return entry.state;
      if (typeof entry.status === 'string') return entry.status;
    }
    return null;
  };
  const toSessionId = (entry, key) =>
    (entry && (entry.sessionID || entry.sessionId)) || key || null;

  const rows = [];
  const source = Array.isArray(json)
    ? json.map((entry) => [null, entry])
    : Object.entries(json.sessions && typeof json.sessions === 'object' ? json.sessions : json);

  for (const [key, entry] of source) {
    const state = toState(entry);
    const sessionId = toSessionId(entry, key);
    if (state && sessionId) {
      rows.push({ sessionId: String(sessionId), state });
    }
  }
  return rows;
}

/**
 * Create an OpenCode status client (Front E — audit "Bonus: opencode").
 *
 * Subscribes to OpenCode's own SSE bus (`GET {baseUrl}/event`) for
 * deterministic idle/running signals. When the SSE connection fails
 * `sseFailureThreshold` times in a row, it degrades to polling the REST
 * snapshot (`GET {baseUrl}/session/status`) every `statusPollMs` while it keeps
 * retrying SSE with exponential backoff — so state keeps flowing even when the
 * event stream is unavailable.
 *
 * Integration recipe (see ttyServer.js / sidecar-backend/server.js):
 *   const client = createOpencodeStatusClient({
 *     baseUrl: process.env.DEVHUB_OPENCODE_SSE_URL,
 *     onStatusChange: ({ sessionId, state, eventType }) => { ...publish... },
 *   });
 *   client.start();  // ... client.stop() on shutdown.
 *
 * @param {object} options
 * @param {string} options.baseUrl — opencode server origin, e.g. http://127.0.0.1:4096
 * @param {Map|object} [options.sessions] — DevHub terminal sessions map. When
 *   provided, detections are applied authoritatively onto bound sessions and
 *   `onFrame` fires with a ready-to-broadcast frame.
 * @param {Function} [options.onFrame] — (session, frame) => void
 * @param {Function} [options.onStatusChange] — ({sessionId, state, eventType, source}) => void
 * @param {Function} [options.onEvent] — (sseEvent) => void (raw event tap)
 * @param {object} [options.logger] — console-like; pass a quiet object to mute
 * @param {Function} [options.requestImpl] — injectable SSE transport (tests)
 * @param {Function} [options.getJsonImpl] — injectable REST GET (tests)
 * @param {Function} [options.now] — clock override (tests)
 * @param {number} [options.reconnectDelayMs] — base SSE reconnect delay (spec: 3000)
 * @param {number} [options.maxReconnectDelayMs] — reconnect cap (spec: 30000)
 * @param {number} [options.statusPollMs] — REST fallback poll interval (spec: 5000)
 * @param {number} [options.sseFailureThreshold] — consecutive SSE failures before REST fallback (spec: 3)
 * @param {Function} [options.scheduleTimer] — injectable timer (tests)
 * @returns {{ start, stop, connect, isConnected, getSessionStatuses }}
 */
export function createOpencodeStatusClient(options = {}) {
  const {
    baseUrl,
    sessions,
    onFrame,
    onStatusChange,
    onEvent,
    logger = null,
    requestImpl = defaultRequestImpl,
    getJsonImpl = defaultGetJson,
    now = () => Date.now(),
    reconnectDelayMs = DEFAULT_RECONNECT_BASE_MS,
    maxReconnectDelayMs = DEFAULT_RECONNECT_MAX_MS,
    statusPollMs = DEFAULT_STATUS_POLL_MS,
    sseFailureThreshold = DEFAULT_SSE_FAILURE_THRESHOLD,
    scheduleTimer = (fn, ms) => setTimeout(fn, ms),
  } = options;

  if (!baseUrl) {
    throw new Error('createOpencodeStatusClient: baseUrl is required');
  }

  const normalizedBase = String(baseUrl).replace(/\/+$/, '');
  const eventUrl = `${normalizedBase}/event`;
  const statusUrl = `${normalizedBase}/session/status`;

  let active = false;
  let connection = null;
  let connected = false;
  let reconnectAttempts = 0;
  let consecutiveSseFailures = 0;
  let buffer = '';
  let reconnectTimer = null;
  let statusPollTimer = null;

  /** Last known status per opencode session id. */
  const sessionStatuses = new Map();

  function logWarn(...args) {
    if (logger && typeof logger.warn === 'function') logger.warn(...args);
  }

  function recordStatus(sessionId, state, eventType, source) {
    if (!sessionId || !state) return;
    const prev = sessionStatuses.get(sessionId);
    sessionStatuses.set(sessionId, { sessionId, state, at: now(), source });
    if (typeof onStatusChange === 'function' && (!prev || prev.state !== state)) {
      try {
        onStatusChange({ sessionId, state, eventType, source });
      } catch {
        // consumer errors must never break the client
      }
    }
  }

  function applyToSession(sessionId, state, eventType) {
    if (!sessions) return;
    const session = resolveOpenCodeTargetSession(sessions, sessionId);
    if (!session) return;
    const frame = applyOpenCodeSseDetection(session, state, eventType, sessionId, now());
    if (frame && typeof onFrame === 'function') {
      try {
        onFrame(session, frame);
      } catch {
        // never let a broadcast failure kill the SSE loop
      }
    }
  }

  function handleSseEvent(sseEvent) {
    if (typeof onEvent === 'function') {
      try {
        onEvent(sseEvent);
      } catch {
        // raw tap errors are non-fatal
      }
    }
    const { sessionId, state, eventType } = interpretOpenCodeSseEvent(sseEvent);
    if (!state) return; // unmapped event — ignore
    recordStatus(sessionId, state, eventType, 'sse');
    applyToSession(sessionId, state, eventType);
  }

  function onData(chunk) {
    // Data flowing proves the connection is healthy — reset backoff + failures.
    reconnectAttempts = 0;
    consecutiveSseFailures = 0;
    buffer += chunk;
    const { events, rest } = parseSseBuffer(buffer);
    buffer = rest;
    for (const ev of events) {
      handleSseEvent(ev);
    }
  }

  function stopStatusPolling() {
    if (statusPollTimer) {
      try {
        if (typeof clearTimeout === 'function') clearTimeout(statusPollTimer);
      } catch {
        // ignore
      }
      statusPollTimer = null;
    }
  }

  async function pollSessionStatus() {
    if (!active) return;
    const json = await getJsonImpl(statusUrl);
    if (!active) return; // stopped while awaiting
    const rows = interpretSessionStatusResponse(json);
    for (const { sessionId, state } of rows) {
      recordStatus(sessionId, state, 'session.status', 'status');
      applyToSession(sessionId, state, 'session.status');
    }
    // Keep polling while SSE is still degraded.
    if (active && consecutiveSseFailures >= sseFailureThreshold) {
      statusPollTimer = scheduleTimer(pollSessionStatus, statusPollMs);
    } else {
      statusPollTimer = null;
    }
  }

  function maybeStartStatusPolling() {
    if (consecutiveSseFailures >= sseFailureThreshold && !statusPollTimer && active) {
      logWarn(
        `[opencode-sse] ${consecutiveSseFailures} consecutive SSE failures — falling back to /session/status polling`
      );
      statusPollTimer = scheduleTimer(pollSessionStatus, statusPollMs);
    }
  }

  function scheduleReconnect() {
    if (!active) return;
    const delay = Math.min(reconnectDelayMs * 2 ** reconnectAttempts, maxReconnectDelayMs);
    reconnectAttempts += 1;
    reconnectTimer = scheduleTimer(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function handleFailure() {
    connected = false;
    connection = null;
    buffer = '';
    consecutiveSseFailures += 1;
    maybeStartStatusPolling();
    scheduleReconnect();
  }

  function connect() {
    if (!active) return;
    try {
      connection = requestImpl(eventUrl, {
        onData,
        onError: handleFailure,
        onClose: handleFailure,
      });
      connected = true;
    } catch {
      handleFailure();
    }
  }

  function start() {
    if (active) return;
    active = true;
    reconnectAttempts = 0;
    consecutiveSseFailures = 0;
    connect();
  }

  function stop() {
    active = false;
    connected = false;
    if (reconnectTimer) {
      try {
        if (typeof clearTimeout === 'function') clearTimeout(reconnectTimer);
      } catch {
        // ignore
      }
      reconnectTimer = null;
    }
    stopStatusPolling();
    if (connection) {
      connection.abort();
      connection = null;
    }
    buffer = '';
  }

  /**
   * Snapshot of the last known status per opencode session id.
   * @returns {Array<{ sessionId, state, at, source }>}
   */
  function getSessionStatuses() {
    return [...sessionStatuses.values()];
  }

  return {
    start,
    stop,
    connect,
    isConnected: () => connected,
    getSessionStatuses,
  };
}

/**
 * Backwards-compatible alias. Earlier iterations exported this name; the
 * canonical factory (matching the Front E spec) is createOpencodeStatusClient.
 */
export const createOpenCodeSseClient = createOpencodeStatusClient;

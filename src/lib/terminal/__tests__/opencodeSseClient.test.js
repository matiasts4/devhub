/**
 * Tests for opencodeSseClient (Front E — consume OpenCode's own SSE bus).
 */
import {
  parseSseBuffer,
  interpretOpenCodeSseEvent,
  interpretSessionStatusResponse,
  resolveOpenCodeTargetSession,
  applyOpenCodeSseDetection,
  createOpenCodeSseClient,
  createOpencodeStatusClient,
  OPENCODE_EVENT_MAP,
  OPENCODE_SSE_SOURCE,
} from '../opencodeSseClient.js';
import { AgentStateMachine } from '../agentTuiMetadata.shared.js';

function makeSession(id, extra = {}) {
  return {
    id,
    agentStateMachine: new AgentStateMachine(),
    agentType: 'opencode',
    ...extra,
  };
}

describe('parseSseBuffer', () => {
  test('parses a single complete data event', () => {
    const { events, rest } = parseSseBuffer('data: {"type":"session.idle"}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: 'message', data: '{"type":"session.idle"}' });
    expect(rest).toBe('');
  });

  test('honors an explicit event: field', () => {
    const { events } = parseSseBuffer('event: session.idle\ndata: {"a":1}\n\n');
    expect(events[0].event).toBe('session.idle');
  });

  test('joins multiple data lines with newline', () => {
    const { events } = parseSseBuffer('data: line1\ndata: line2\n\n');
    expect(events[0].data).toBe('line1\nline2');
  });

  test('ignores comment keep-alive lines', () => {
    const { events } = parseSseBuffer(': keepalive\ndata: {"a":1}\n\n');
    expect(events).toHaveLength(1);
  });

  test('keeps an incomplete trailing segment in rest', () => {
    const { events, rest } = parseSseBuffer('data: {"type":"session.idle"}\n\ndata: {"par');
    expect(events).toHaveLength(1);
    expect(rest).toBe('data: {"par');
  });

  test('handles \\r\\n line endings', () => {
    const { events } = parseSseBuffer('data: {"a":1}\r\n\r\n');
    expect(events).toHaveLength(1);
  });

  test('dispatches multiple events in one buffer', () => {
    const { events } = parseSseBuffer('data: {"n":1}\n\ndata: {"n":2}\n\n');
    expect(events).toHaveLength(2);
  });
});

describe('interpretOpenCodeSseEvent', () => {
  test('maps session.idle → idle with sessionID from properties', () => {
    const result = interpretOpenCodeSseEvent({
      event: 'message',
      data: JSON.stringify({ type: 'session.idle', properties: { sessionID: 'ses_abc' } }),
    });
    expect(result).toEqual({ sessionId: 'ses_abc', state: 'idle', eventType: 'session.idle' });
  });

  test('maps message.part.delta → running', () => {
    const result = interpretOpenCodeSseEvent({
      event: 'message',
      data: JSON.stringify({ type: 'message.part.delta', properties: { sessionID: 'ses_x' } }),
    });
    expect(result.state).toBe('running');
  });

  test('maps session.error → blocked', () => {
    const result = interpretOpenCodeSseEvent({
      event: 'message',
      data: JSON.stringify({ type: 'session.error', properties: { sessionID: 'ses_x' } }),
    });
    expect(result.state).toBe('blocked');
  });

  test('falls back to SSE event field when JSON has no type', () => {
    const result = interpretOpenCodeSseEvent({
      event: 'session.idle',
      data: JSON.stringify({ properties: { sessionID: 'ses_y' } }),
    });
    expect(result.state).toBe('idle');
    expect(result.sessionId).toBe('ses_y');
  });

  test('returns null state for unmapped events', () => {
    const result = interpretOpenCodeSseEvent({
      event: 'message',
      data: JSON.stringify({ type: 'lsp.updated', properties: {} }),
    });
    expect(result.state).toBeNull();
  });

  test('returns null sessionId when absent', () => {
    const result = interpretOpenCodeSseEvent({
      event: 'message',
      data: JSON.stringify({ type: 'session.idle', properties: {} }),
    });
    expect(result.sessionId).toBeNull();
  });

  test('tolerates malformed JSON', () => {
    const result = interpretOpenCodeSseEvent({ event: 'session.idle', data: 'not-json' });
    expect(result.state).toBe('idle'); // falls back to event field
    expect(result.sessionId).toBeNull();
  });
});

describe('resolveOpenCodeTargetSession', () => {
  test('matches by opencodeSessionId', () => {
    const s1 = makeSession('s1', { opencodeSessionId: 'ses_match' });
    const sessions = new Map([['s1', s1]]);
    expect(resolveOpenCodeTargetSession(sessions, 'ses_match')).toBe(s1);
  });

  test('matches by agentSessionId', () => {
    const s1 = makeSession('s1', { agentSessionId: 'ses_alt' });
    const sessions = new Map([['s1', s1]]);
    expect(resolveOpenCodeTargetSession(sessions, 'ses_alt')).toBe(s1);
  });

  test('returns null when no session matches', () => {
    const sessions = new Map([['s1', makeSession('s1', { opencodeSessionId: 'ses_other' })]]);
    expect(resolveOpenCodeTargetSession(sessions, 'ses_nope')).toBeNull();
  });

  test('returns null for null sessionId', () => {
    const sessions = new Map([['s1', makeSession('s1')]]);
    expect(resolveOpenCodeTargetSession(sessions, null)).toBeNull();
  });
});

describe('applyOpenCodeSseDetection', () => {
  test('publishes state and sets hookState authority', () => {
    const session = makeSession('s1', { opencodeSessionId: 'ses_1' });
    const frame = applyOpenCodeSseDetection(session, 'idle', 'session.idle', 'ses_1', 1000);

    expect(frame).toMatchObject({ type: 'agent-state', agentTuiState: 'idle', at: 1000 });
    expect(session.hookState).toMatchObject({
      state: 'idle',
      source: OPENCODE_SSE_SOURCE,
      event: 'session.idle',
      at: 1000,
    });
    expect(session.agentTuiState).toBe('idle');
  });

  test('defaults agentType to opencode when unset', () => {
    const session = makeSession('s1', { agentType: null, opencodeSessionId: 'ses_1' });
    applyOpenCodeSseDetection(session, 'running', 'message.updated', 'ses_1', 1000);
    expect(session.agentType).toBe('opencode');
  });

  test('binds opencodeSessionId when session lacks one', () => {
    const session = makeSession('s1', { opencodeSessionId: undefined });
    applyOpenCodeSseDetection(session, 'running', 'message.updated', 'ses_new', 1000);
    expect(session.opencodeSessionId).toBe('ses_new');
  });

  test('returns null frame when state unchanged', () => {
    const session = makeSession('s1', { opencodeSessionId: 'ses_1' });
    applyOpenCodeSseDetection(session, 'idle', 'session.idle', 'ses_1', 1000);
    const second = applyOpenCodeSseDetection(session, 'idle', 'session.idle', 'ses_1', 2000);
    expect(second).toBeNull();
  });
});

describe('createOpenCodeSseClient (end-to-end with stub transport)', () => {
  // Stub transport: captures handlers so tests can push SSE chunks.
  function makeStubTransport() {
    const connections = [];
    const requestImpl = (url, handlers) => {
      const conn = {
        url,
        handlers,
        aborted: false,
        abort() {
          this.aborted = true;
        },
      };
      connections.push(conn);
      return conn;
    };
    return { connections, requestImpl };
  }

  test('connects to {baseUrl}/event and routes idle to the bound session', () => {
    const { connections, requestImpl } = makeStubTransport();
    const session = makeSession('s1', { opencodeSessionId: 'ses_live' });
    const sessions = new Map([['s1', session]]);
    const frames = [];

    const client = createOpenCodeSseClient({
      baseUrl: 'http://127.0.0.1:4096',
      sessions,
      requestImpl,
      onFrame: (s, frame) => frames.push({ id: s.id, frame }),
      now: () => 5000,
    });

    client.start();
    expect(connections).toHaveLength(1);
    expect(connections[0].url).toBe('http://127.0.0.1:4096/event');

    connections[0].handlers.onData(
      'data: ' +
        JSON.stringify({
          type: 'session.idle',
          properties: { sessionID: 'ses_live' },
        }) +
        '\n\n'
    );

    expect(frames).toHaveLength(1);
    expect(frames[0].id).toBe('s1');
    expect(frames[0].frame).toMatchObject({ agentTuiState: 'idle', at: 5000 });
    client.stop();
  });

  test('strips trailing slash from baseUrl', () => {
    const { connections, requestImpl } = makeStubTransport();
    const client = createOpenCodeSseClient({
      baseUrl: 'http://127.0.0.1:4096/',
      sessions: new Map(),
      requestImpl,
    });
    client.start();
    expect(connections[0].url).toBe('http://127.0.0.1:4096/event');
    client.stop();
  });

  test('handles a chunk split across multiple onData calls', () => {
    const { connections, requestImpl } = makeStubTransport();
    const session = makeSession('s1', { opencodeSessionId: 'ses_split' });
    const sessions = new Map([['s1', session]]);
    const frames = [];

    const client = createOpenCodeSseClient({
      baseUrl: 'http://x',
      sessions,
      requestImpl,
      onFrame: (s, frame) => frames.push(frame),
      now: () => 1,
    });
    client.start();

    const payload =
      'data: ' +
      JSON.stringify({ type: 'session.idle', properties: { sessionID: 'ses_split' } }) +
      '\n\n';
    const mid = Math.floor(payload.length / 2);
    connections[0].handlers.onData(payload.slice(0, mid));
    expect(frames).toHaveLength(0); // not yet complete
    connections[0].handlers.onData(payload.slice(mid));
    expect(frames).toHaveLength(1);
    client.stop();
  });

  test('ignores events for unbound sessions and unmapped types', () => {
    const { connections, requestImpl } = makeStubTransport();
    const session = makeSession('s1', { opencodeSessionId: 'ses_a' });
    const sessions = new Map([['s1', session]]);
    const frames = [];

    const client = createOpenCodeSseClient({
      baseUrl: 'http://x',
      sessions,
      requestImpl,
      onFrame: (s, frame) => frames.push(frame),
    });
    client.start();

    // Unbound session id.
    connections[0].handlers.onData(
      'data: ' +
        JSON.stringify({
          type: 'session.idle',
          properties: { sessionID: 'ses_unknown' },
        }) +
        '\n\n'
    );
    // Unmapped event type.
    connections[0].handlers.onData(
      'data: ' +
        JSON.stringify({
          type: 'lsp.updated',
          properties: { sessionID: 'ses_a' },
        }) +
        '\n\n'
    );

    expect(frames).toHaveLength(0);
    client.stop();
  });

  test('reconnects with backoff on connection error', () => {
    const { connections, requestImpl } = makeStubTransport();
    const scheduled = [];
    const client = createOpenCodeSseClient({
      baseUrl: 'http://x',
      sessions: new Map(),
      requestImpl,
      reconnectDelayMs: 100,
      maxReconnectDelayMs: 1000,
      scheduleTimer: (fn, ms) => {
        scheduled.push({ fn, ms });
        return scheduled.length;
      },
    });

    client.start();
    expect(connections).toHaveLength(1);

    // First failure → backoff 100ms.
    connections[0].handlers.onError(new Error('ECONNREFUSED'));
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].ms).toBe(100);

    // Simulate the timer firing → reconnect attempt #2.
    scheduled[0].fn();
    expect(connections).toHaveLength(2);

    // Second failure → backoff doubles to 200ms.
    connections[1].handlers.onError(new Error('ECONNREFUSED'));
    expect(scheduled[1].ms).toBe(200);

    client.stop();
  });

  test('stop() aborts the active connection and halts reconnects', () => {
    const { connections, requestImpl } = makeStubTransport();
    const scheduled = [];
    const client = createOpenCodeSseClient({
      baseUrl: 'http://x',
      sessions: new Map(),
      requestImpl,
      scheduleTimer: (fn, ms) => {
        scheduled.push({ fn, ms });
        return scheduled.length;
      },
    });

    client.start();
    client.stop();
    expect(connections[0].aborted).toBe(true);
    expect(client.isConnected()).toBe(false);

    // A late error after stop must not schedule a reconnect.
    connections[0].handlers.onError(new Error('late'));
    expect(scheduled).toHaveLength(0);
  });

  test('throws without baseUrl', () => {
    expect(() => createOpenCodeSseClient({ sessions: new Map() })).toThrow(/baseUrl/);
  });
});

describe('interpretSessionStatusResponse (REST fallback parser)', () => {
  test('parses object keyed by session id with busy boolean', () => {
    const rows = interpretSessionStatusResponse({ ses_a: { busy: true }, ses_b: { busy: false } });
    expect(rows).toEqual([
      { sessionId: 'ses_a', state: 'running' },
      { sessionId: 'ses_b', state: 'idle' },
    ]);
  });

  test('parses envelope nested under sessions', () => {
    const rows = interpretSessionStatusResponse({ sessions: { ses_x: { busy: true } } });
    expect(rows).toEqual([{ sessionId: 'ses_x', state: 'running' }]);
  });

  test('parses array rows with explicit sessionID', () => {
    const rows = interpretSessionStatusResponse([{ sessionID: 'ses_1', busy: false }]);
    expect(rows).toEqual([{ sessionId: 'ses_1', state: 'idle' }]);
  });

  test('returns [] for null / malformed input', () => {
    expect(interpretSessionStatusResponse(null)).toEqual([]);
    expect(interpretSessionStatusResponse('nope')).toEqual([]);
  });
});

describe('createOpencodeStatusClient — spec API + REST fallback', () => {
  function makeStubTransport() {
    const connections = [];
    const requestImpl = (url, handlers) => {
      const conn = {
        url,
        handlers,
        aborted: false,
        abort() {
          this.aborted = true;
        },
      };
      connections.push(conn);
      return conn;
    };
    return { connections, requestImpl };
  }

  test('createOpenCodeSseClient is an alias of createOpencodeStatusClient', () => {
    expect(createOpenCodeSseClient).toBe(createOpencodeStatusClient);
  });

  test('getSessionStatuses tracks last state per session from SSE', () => {
    const { connections, requestImpl } = makeStubTransport();
    const client = createOpencodeStatusClient({
      baseUrl: 'http://x',
      requestImpl,
      now: () => 777,
    });
    client.start();

    connections[0].handlers.onData(
      'data: ' +
        JSON.stringify({
          type: 'session.idle',
          properties: { sessionID: 'ses_a' },
        }) +
        '\n\n'
    );
    connections[0].handlers.onData(
      'data: ' +
        JSON.stringify({
          type: 'message.part.delta',
          properties: { sessionID: 'ses_b' },
        }) +
        '\n\n'
    );

    const statuses = client.getSessionStatuses();
    expect(statuses).toHaveLength(2);
    expect(statuses.find((s) => s.sessionId === 'ses_a')).toMatchObject({
      state: 'idle',
      source: 'sse',
      at: 777,
    });
    expect(statuses.find((s) => s.sessionId === 'ses_b')).toMatchObject({
      state: 'running',
      source: 'sse',
    });
    client.stop();
  });

  test('onStatusChange fires only on state change', () => {
    const { connections, requestImpl } = makeStubTransport();
    const changes = [];
    const client = createOpencodeStatusClient({
      baseUrl: 'http://x',
      requestImpl,
      onStatusChange: (c) => changes.push(c),
    });
    client.start();

    const idle =
      'data: ' +
      JSON.stringify({ type: 'session.idle', properties: { sessionID: 'ses_a' } }) +
      '\n\n';
    connections[0].handlers.onData(idle);
    connections[0].handlers.onData(idle); // same state again — no change
    connections[0].handlers.onData(
      'data: ' +
        JSON.stringify({
          type: 'message.part.delta',
          properties: { sessionID: 'ses_a' },
        }) +
        '\n\n'
    );

    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ sessionId: 'ses_a', state: 'idle', source: 'sse' });
    expect(changes[1]).toMatchObject({ sessionId: 'ses_a', state: 'running' });
    client.stop();
  });

  test('falls back to /session/status polling after ≥3 consecutive SSE failures', async () => {
    const { connections, requestImpl } = makeStubTransport();
    const scheduled = [];
    const statusCalls = [];
    const getJsonImpl = async (url) => {
      statusCalls.push(url);
      return { ses_poll: { busy: true } };
    };
    const changes = [];

    const client = createOpencodeStatusClient({
      baseUrl: 'http://x',
      requestImpl,
      getJsonImpl,
      sseFailureThreshold: 3,
      statusPollMs: 5000,
      reconnectDelayMs: 10,
      onStatusChange: (c) => changes.push(c),
      scheduleTimer: (fn, ms) => {
        scheduled.push({ fn, ms });
        return scheduled.length;
      },
    });
    client.start();

    // Fail connection #1 → reconnect scheduled, no polling yet.
    connections[0].handlers.onError(new Error('down'));
    expect(statusCalls).toHaveLength(0);
    expect(scheduled.find((s) => s.ms === 5000)).toBeUndefined();

    // Fire the pending reconnect timer → connection #2, fail it too.
    scheduled.filter((s) => s.ms !== 5000)[0].fn();
    connections[1].handlers.onError(new Error('down'));
    expect(statusCalls).toHaveLength(0);
    expect(scheduled.find((s) => s.ms === 5000)).toBeUndefined();

    // Fire reconnect → connection #3; 3rd failure crosses the threshold →
    // a status poll is scheduled @5000ms.
    scheduled.filter((s) => s.ms !== 5000)[1].fn();
    connections[2].handlers.onError(new Error('down'));
    const pollTimer = scheduled.find((s) => s.ms === 5000);
    expect(pollTimer).toBeDefined();

    // Fire the poll timer → REST GET happens and status is recorded.
    await pollTimer.fn();
    expect(statusCalls).toEqual(['http://x/session/status']);
    expect(changes).toContainEqual(
      expect.objectContaining({ sessionId: 'ses_poll', state: 'running', source: 'status' })
    );
    expect(client.getSessionStatuses()).toContainEqual(
      expect.objectContaining({ sessionId: 'ses_poll', state: 'running', source: 'status' })
    );

    client.stop();
  });

  test('successful SSE data resets the consecutive-failure counter (no premature fallback)', () => {
    const { connections, requestImpl } = makeStubTransport();
    const scheduled = [];
    const client = createOpencodeStatusClient({
      baseUrl: 'http://x',
      requestImpl,
      sseFailureThreshold: 3,
      scheduleTimer: (fn, ms) => {
        scheduled.push({ fn, ms });
        return scheduled.length;
      },
    });
    client.start();

    // Failure #1 → reconnect scheduled. Fire it → connection #2.
    connections[0].handlers.onError(new Error('down'));
    scheduled.filter((s) => s.ms !== 5000)[0].fn();

    // Failure #2 → reconnect scheduled. Fire it → connection #3.
    connections[1].handlers.onError(new Error('down'));
    scheduled.filter((s) => s.ms !== 5000)[1].fn();

    // Healthy data arrives on connection #3 — resets the failure counter.
    connections[2].handlers.onData(': keepalive\n\n');
    // One more failure — counter restarts at 1, never reaches the threshold.
    connections[2].handlers.onError(new Error('down'));

    // No status poll should have been scheduled (threshold of 3 never reached).
    expect(scheduled.some((s) => s.ms === 5000)).toBe(false);
    client.stop();
  });

  test('stop() prevents further polling callbacks (no post-stop work)', async () => {
    const { connections, requestImpl } = makeStubTransport();
    const scheduled = [];
    const statusCalls = [];
    const getJsonImpl = async () => {
      statusCalls.push(1);
      return {};
    };

    const client = createOpencodeStatusClient({
      baseUrl: 'http://x',
      requestImpl,
      getJsonImpl,
      sseFailureThreshold: 1,
      scheduleTimer: (fn, ms) => {
        scheduled.push({ fn, ms });
        return scheduled.length;
      },
    });
    client.start();
    connections[0].handlers.onError(new Error('down')); // triggers fallback schedule
    const pollTimer = scheduled.find((s) => s.ms === 5000);
    expect(pollTimer).toBeDefined();

    client.stop();
    await pollTimer.fn(); // simulate late timer firing after stop
    expect(statusCalls).toHaveLength(0); // guarded by active flag
  });
});

describe('OPENCODE_EVENT_MAP coverage', () => {
  test('session.idle is mapped to idle (the key audit requirement)', () => {
    expect(OPENCODE_EVENT_MAP['session.idle']).toBe('idle');
  });
});

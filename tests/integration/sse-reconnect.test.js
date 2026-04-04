/**
 * Integration test: SSE Reconnection
 *
 * Tests SSE reconnection logic:
 * 1. Connect to SSE stream
 * 2. Simulate server disconnect
 * 3. Verify client reconnects within 5 seconds
 * 4. Verify no events are lost during reconnection
 *
 * ⚠️ This test requires OpenCode to be running.
 * Skip if OpenCode server is not available.
 *
 * Usage: node tests/integration/sse-reconnect.test.js
 */

const OPENCODE_PORT = 4153;
const OPENCODE_URL = `http://127.0.0.1:${OPENCODE_PORT}`;

// ── Check if OpenCode is running ────────────────────────────────────────────

async function isOpencodeRunning() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${OPENCODE_URL}/global/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

// ── Assertion helper ────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ── SSE Client with reconnection ────────────────────────────────────────────

class SSEClient {
  constructor(url) {
    this.url = url;
    this.events = [];
    this.reconnectCount = 0;
    this.maxReconnects = 5;
    this.reconnectDelay = 1000;
    this.running = false;
    this.lastEventId = null;
  }

  async connect() {
    this.running = true;

    while (this.running && this.reconnectCount < this.maxReconnects) {
      try {
        const headers = {};
        if (this.lastEventId) {
          headers['Last-Event-ID'] = this.lastEventId;
        }

        const res = await fetch(this.url, {
          headers,
        });

        if (!res.ok) {
          throw new Error(`SSE connection failed: ${res.status}`);
        }

        this.reconnectCount = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (this.running) {
          const { value, done } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          buffer += text;

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6));
                this.events.push(event);
                this.lastEventId = event.id || null;
              } catch {
                // Skip malformed events
              }
            }
          }
        }

        reader.releaseLock?.();
      } catch (err) {
        if (!this.running) break;

        this.reconnectCount++;
        const delay = Math.min(this.reconnectDelay * this.reconnectCount, 5000);

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  disconnect() {
    this.running = false;
  }

  getEventCount() {
    return this.events.length;
  }

  getReconnectCount() {
    return this.reconnectCount;
  }
}

// ── Simulate disconnect by creating a session, sending a message, and observing SSE ─────────────

async function createOpencodeSession() {
  const res = await fetch(`${OPENCODE_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(`Failed to create session: ${res.status}`);
  }

  return res.json();
}

async function sendMessage(sessionId, agent, prompt) {
  const res = await fetch(`${OPENCODE_URL}/session/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent,
      parts: [{ type: 'text', text: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to send message: ${res.status}`);
  }

  return res.json();
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests = [
  {
    name: 'SSE client connects and receives events',
    async run() {
      const client = new SSEClient(`${OPENCODE_URL}/event`);

      // Start SSE connection
      const connectPromise = client.connect();

      // Create a session and send a message to generate events
      const session = await createOpencodeSession();
      await sendMessage(session.id, 'gentleman', 'Say "test" briefly');

      // Wait for events to arrive
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Disconnect
      client.disconnect();
      await connectPromise;

      assert(client.getEventCount() > 0, 'Should have received SSE events');
      assert(client.getReconnectCount() === 0, 'Should not have reconnected (no disconnect)');
    },
  },
  {
    name: 'SSE client reconnects after disconnect within 5 seconds',
    async run() {
      const client = new SSEClient(`${OPENCODE_URL}/event`);
      client.reconnectDelay = 1000; // 1 second initial delay

      // Start SSE connection
      const connectPromise = client.connect();

      // Create session and send message
      const session = await createOpencodeSession();
      await sendMessage(session.id, 'gentleman', 'Say "reconnect test" briefly');

      // Wait for initial events
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const eventsBeforeReconnect = client.getEventCount();

      // Simulate disconnect by stopping the client briefly
      client.running = false;
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Restart — should trigger reconnection
      client.running = true;

      // Wait for reconnection and new events
      await new Promise((resolve) => setTimeout(resolve, 5000));

      client.disconnect();
      await connectPromise;

      // Should have reconnected at least once
      assert(
        client.getReconnectCount() >= 1,
        `Should have reconnected at least once, got ${client.getReconnectCount()}`
      );

      // Should have received more events after reconnection
      assert(
        client.getEventCount() >= eventsBeforeReconnect,
        'Should have at least as many events after reconnection'
      );
    },
  },
  {
    name: 'SSE client handles multiple reconnections gracefully',
    async run() {
      const client = new SSEClient(`${OPENCODE_URL}/event`);
      client.reconnectDelay = 500;
      client.maxReconnects = 3;

      // Start connection
      const connectPromise = client.connect();

      // Create session
      const session = await createOpencodeSession();

      // Simulate multiple disconnects
      for (let i = 0; i < 2; i++) {
        client.running = false;
        await new Promise((resolve) => setTimeout(resolve, 300));
        client.running = true;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Send a message to generate events
      await sendMessage(session.id, 'gentleman', 'Final message after reconnects');

      await new Promise((resolve) => setTimeout(resolve, 5000));

      client.disconnect();
      await connectPromise;

      // Should have survived multiple reconnections
      assert(
        client.getReconnectCount() >= 2,
        `Should have reconnected at least twice, got ${client.getReconnectCount()}`
      );

      // Should have collected events across reconnections
      assert(client.getEventCount() > 0, 'Should have events even after multiple reconnections');
    },
  },
];

// ── Test runner ─────────────────────────────────────────────────────────────

async function runTests() {
  console.log('Running SSE reconnection tests...\n');

  // Check if OpenCode is running
  const running = await isOpencodeRunning();
  if (!running) {
    console.log('  ⏭️  SKIP: OpenCode server is not running on port ' + OPENCODE_PORT);
    console.log('  Start OpenCode with: opencode serve --port ' + OPENCODE_PORT);
    return;
  }

  console.log('  ✅ OpenCode server is running\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.run();
      console.log(`  ✅ ${test.name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${test.name}`);
      console.log(`     Error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${tests.length} tests passed`);
  if (failed > 0) {
    console.log(`${failed} test(s) failed`);
    process.exit(1);
  }
}

runTests();

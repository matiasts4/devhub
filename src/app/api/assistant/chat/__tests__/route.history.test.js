// T-033: history field in the chat route body. The model needs cross-turn
// context to remember the prior turn; this test asserts the server prepends
// the client-supplied history to the per-turn tool loop.
//
// Pattern follows the existing route.*.test.js suites: stub the system prompt
// in a tmpdir, mock global.fetch, then introspect the messages[] payload sent
// to MiniMax. We assert the conversation seed = [...safeHistory, newUserMsg].
//
// Defence in depth: even though the client caps at 20, the server also caps
// at 20 — protects against a malicious or buggy client sending 10k entries
// that would blow the prompt budget.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let POST;
let originalCwd;
let promptDir;
let PROMPT_PATH;

function stubPrompt() {
  originalCwd = process.cwd();
  promptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-route-t033-'));
  fs.mkdirSync(path.join(promptDir, 'docs', 'prompts', 'asistente'), {
    recursive: true,
  });
  PROMPT_PATH = path.join(promptDir, 'docs', 'prompts', 'asistente', 'zed-system-prompt.md');
  fs.writeFileSync(PROMPT_PATH, '# Stub\n');
  process.chdir(promptDir);
  jest.resetModules();
}

function restoreCwd() {
  if (originalCwd) process.chdir(originalCwd);
  if (promptDir) fs.rmSync(promptDir, { recursive: true, force: true });
}

describe('POST /api/assistant/chat — history (T-033)', () => {
  beforeAll(() => {
    stubPrompt();
    process.env.MINIMAX_API_KEY = 'test-api-key-valid-001';
    delete process.env.ANTHROPIC_API_KEY;
    POST = require('../route').POST;
  });
  afterAll(() => {
    restoreCwd();
    delete process.env.MINIMAX_API_KEY;
  });

  test('seed conversation with [history..., new user message] when history is provided', async () => {
    const realFetch = global.fetch;
    let observedMessages = null;
    global.fetch = jest.fn(async (url, init) => {
      if (typeof url === 'string' && url.includes('/api/terminal/processes')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ processes: [] }),
          text: async () => '{"processes":[]}',
        };
      }
      observedMessages = JSON.parse(init.body).messages;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: 'text', text: 'Got it.' }],
        }),
        text: async () => '',
      };
    });

    try {
      const req = {
        json: async () => ({
          message: 'New question',
          history: [
            { role: 'user', content: 'Old question A' },
            { role: 'assistant', content: 'Old answer A' },
            { role: 'user', content: 'Old question B' },
          ],
        }),
      };
      const res = await POST(req);
      expect(res.status).toBe(200);

      // The last conversation entry must be the new user message; the first
      // three must be the client-supplied history (in order).
      expect(observedMessages).toEqual([
        { role: 'user', content: 'Old question A' },
        { role: 'assistant', content: 'Old answer A' },
        { role: 'user', content: 'Old question B' },
        { role: 'user', content: 'New question' },
      ]);
    } finally {
      global.fetch = realFetch;
    }
  });

  test('drops malformed history entries (non-object, wrong role, non-string content)', async () => {
    const realFetch = global.fetch;
    let observedMessages = null;
    global.fetch = jest.fn(async (url, init) => {
      if (init && init.body) {
        observedMessages = JSON.parse(init.body).messages;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: 'text', text: 'Hi back' }],
        }),
        text: async () => '',
      };
    });

    try {
      const req = {
        json: async () => ({
          message: 'Hi',
          history: [
            { role: 'user', content: 'OK' },
            null,
            'not-an-object',
            { role: 'system', content: 'should be dropped' },
            { role: 'user', content: 42 },
            { role: 'assistant', content: 'real one' },
          ],
        }),
      };
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(observedMessages).toEqual([
        { role: 'user', content: 'OK' },
        { role: 'assistant', content: 'real one' },
        { role: 'user', content: 'Hi' },
      ]);
    } finally {
      global.fetch = realFetch;
    }
  });

  test('caps history at 20 entries (client cap; server defence in depth)', async () => {
    const realFetch = global.fetch;
    let observedMessages = null;
    global.fetch = jest.fn(async (url, init) => {
      if (init && init.body) {
        observedMessages = JSON.parse(init.body).messages;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: 'text', text: 'final answer' }],
        }),
        text: async () => '',
      };
    });

    try {
      const big = Array.from({ length: 30 }, (_, i) => ({
        role: 'user',
        content: `msg-${i}`,
      }));
      const req = {
        json: async () => ({ message: 'final', history: big }),
      };
      const res = await POST(req);
      expect(res.status).toBe(200);

      // 20 from history (last 20 of 30) + 1 final user msg.
      expect(observedMessages).toHaveLength(21);
      expect(observedMessages[0].content).toBe('msg-10');
      expect(observedMessages[19].content).toBe('msg-29');
      expect(observedMessages[20]).toEqual({ role: 'user', content: 'final' });
    } finally {
      global.fetch = realFetch;
    }
  });

  test('treats missing history as empty (back-compat with older clients)', async () => {
    const realFetch = global.fetch;
    let observedMessages = null;
    global.fetch = jest.fn(async (url, init) => {
      if (init && init.body) {
        observedMessages = JSON.parse(init.body).messages;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: 'text', text: 'got it' }],
        }),
        text: async () => '',
      };
    });

    try {
      const req = { json: async () => ({ message: 'just the message' }) };
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(observedMessages).toEqual([{ role: 'user', content: 'just the message' }]);
    } finally {
      global.fetch = realFetch;
    }
  });

  test('treats non-array history as empty (defensive — defensive against weird clients)', async () => {
    const realFetch = global.fetch;
    let observedMessages = null;
    global.fetch = jest.fn(async (url, init) => {
      if (init && init.body) {
        observedMessages = JSON.parse(init.body).messages;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: 'text', text: 'ok' }],
        }),
        text: async () => '',
      };
    });

    try {
      const req = { json: async () => ({ message: 'msg', history: 'not-an-array' }) };
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(observedMessages).toEqual([{ role: 'user', content: 'msg' }]);
    } finally {
      global.fetch = realFetch;
    }
  });
});

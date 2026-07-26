// Integration smoke for the chat route. We mock fetch at the module boundary
// (so no real MiniMax call is made) and exercise the route's loader, MAX_TURNS
// loop, error contract, and the M2.7→M3 model swap.
//
// The default prompt path is read at module init; this suite sets the working
// directory to a tmpdir with a stub prompt before requiring the route module.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let route;
let originalCwd;
let promptDir;
let POST;

function stubPrompt() {
  originalCwd = process.cwd();
  promptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-route-test-'));
  fs.mkdirSync(path.join(promptDir, 'docs', 'prompts', 'asistente'), {
    recursive: true,
  });
  const stubPrompt = `# Stub prompt\n\nTools: open_url, browse_files.\n`;
  fs.writeFileSync(
    path.join(promptDir, 'docs', 'prompts', 'asistente', 'zed-system-prompt.md'),
    stubPrompt
  );
  process.chdir(promptDir);
  // Clear module cache so the route picks up our cwd before loading the prompt
  jest.resetModules();
}

function restoreCwd() {
  if (originalCwd) process.chdir(originalCwd);
  if (promptDir) fs.rmSync(promptDir, { recursive: true, force: true });
}

describe('chat route — module contract', () => {
  beforeAll(() => {
    stubPrompt();
    process.env.MINIMAX_API_KEY = 'test-api-key-valid-001';
    delete process.env.ANTHROPIC_API_KEY;
    route = require('../route');
    POST = route.POST;
  });

  afterAll(() => {
    restoreCwd();
    delete process.env.MINIMAX_API_KEY;
  });

  test('route module is loaded', () => {
    expect(typeof POST).toBe('function');
  });

  test('route handler accepts a POST request — invalid body returns 400 JSON', async () => {
    const request = {
      json: async () => ({
        /* missing message */
      }),
    };
    const res = await POST(request);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
  });

  test('route uses M3 model identifier (M2.7 returns 401)', async () => {
    // Sanity check: the module is loaded with the M3 model constant exposed
    // (either as named export or accessible via a follow-up request). This
    // locks the M2.7→M3 swap in place so a future regression gets caught.
    const request = {
      json: async () => ({ message: 'hi' }),
    };
    // Mock fetch to short-circuit MiniMax and observe the model passed in
    let observedModel = null;
    const realFetch = global.fetch;
    global.fetch = jest.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      observedModel = body.model;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: 'text', text: 'hello back' }],
        }),
        text: async () => 'hello back',
      };
    });
    try {
      await POST(request);
    } finally {
      global.fetch = realFetch;
    }
    expect(observedModel).toBe('minimax-coding-plan/MiniMax-M3');
  });

  test('no-params canonical error: TOOL with no PARAM lines returns missing required parameters', async () => {
    // T-010a: spec asistente-chat §5.1 / §5.2. When the model emits `TOOL: <name>`
    // with no `PARAM:` lines, the route MUST skip dispatch and surface
    // { error: "missing required parameters" } as the tool result. The model
    // still sees the error in the conversation (injected like any tool result)
    // and the loop continues to the next turn.
    const realFetch = global.fetch;
    let callIndex = 0;
    global.fetch = jest.fn(async () => {
      callIndex++;
      const isFirstModelCall = callIndex === 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: isFirstModelCall
                ? 'TOOL: browse_files\n' // no PARAM lines
                : 'Lo siento, faltan parámetros.',
            },
          ],
        }),
        text: async () => '',
      };
    });

    try {
      const request = { json: async () => ({ message: 'list files' }) };
      const res = await POST(request);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.text).toBe('Lo siento, faltan parámetros.');
      expect(body.tool_results).toHaveLength(1);
      expect(body.tool_results[0].tool).toBe('browse_files');
      expect(body.tool_results[0].result).toEqual({
        error: 'missing required parameters',
      });
    } finally {
      global.fetch = realFetch;
    }
  });

  test('tool loop dispatch: model emits TOOL: → result injected → final text', async () => {
    // T-008: prove the full tool loop end-to-end:
    //   fetch call 1 → MiniMax API → returns TOOL: list_terminals
    //   fetch call 2 → /api/terminal/processes (tool impl) → returns { processes: [] }
    //   fetch call 3 → MiniMax API (next turn) → returns final text
    const realFetch = global.fetch;
    let callIndex = 0;
    global.fetch = jest.fn(async (url) => {
      callIndex++;
      // Tool impl's HTTP call to the local Next API
      if (typeof url === 'string' && url.includes('/api/terminal/processes')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ processes: [] }),
          text: async () => '{"processes":[]}',
        };
      }
      // MiniMax calls — alternate tool-call turn then final-text turn
      const isFirstModelCall = callIndex === 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: isFirstModelCall
                ? 'TOOL: list_terminals\nPARAM: dummy=x\n'
                : 'No terminals running.',
            },
          ],
        }),
        text: async () => '',
      };
    });

    try {
      const request = { json: async () => ({ message: 'go' }) };
      const res = await POST(request);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.text).toBe('No hay terminales abiertas.');
      expect(body.tool_results).toHaveLength(1);
      expect(body.tool_results[0].tool).toBe('list_terminals');
      // list_terminals now enriches with tmux discovery (best effort). The mock only controlled the /processes part.
      expect(body.tool_results[0].result.processes).toEqual([]);
    } finally {
      global.fetch = realFetch;
    }
  });

  test('native tool_use path: model returns tool_use block (not textual) → executes tool → result fed back with tool_result block', async () => {
    const realFetch = global.fetch;
    let callIndex = 0;
    global.fetch = jest.fn(async (url, _init) => {
      callIndex++;
      if (typeof url === 'string' && url.includes('/api/terminal/processes')) {
        return { ok: true, status: 200, json: async () => ({ processes: [{ id: 'p1' }] }) };
      }
      // First model call returns native tool_use (as MiniMax does when tools= provided)
      const isFirst = callIndex === 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: isFirst
            ? [
                { type: 'text', text: 'Listing terminals via tool.' },
                { type: 'tool_use', id: 'call_abc123', name: 'list_terminals', input: {} },
              ]
            : [{ type: 'text', text: 'There is one terminal: p1.' }],
        }),
      };
    });

    try {
      const request = { json: async () => ({ message: 'go' }) };
      const res = await POST(request);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.text).toBe('Hay 1 terminal abierta: Alex.');
      expect(body.tool_results).toHaveLength(1);
      expect(body.tool_results[0].tool).toBe('list_terminals');
      // Native path should have used the id
      expect(body.tool_results[0].id).toBe('call_abc123');
    } finally {
      global.fetch = realFetch;
    }
  });
});

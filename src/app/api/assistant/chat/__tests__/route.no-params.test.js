// T-015: schema-aware no-params check. T-010a short-circuited ANY tool
// called with no PARAM: lines to a canonical error, breaking tools with
// zero required params (list_terminals, get_swarm_status). Fix: only
// short-circuit when the tool's schema has ≥1 `required: true` entry.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let POST;
let originalCwd;
let promptDir;

function stubPrompt() {
  originalCwd = process.cwd();
  promptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-route-t015-'));
  fs.mkdirSync(path.join(promptDir, 'docs', 'prompts', 'asistente'), { recursive: true });
  fs.writeFileSync(
    path.join(promptDir, 'docs', 'prompts', 'asistente', 'zed-system-prompt.md'),
    '# Stub\n'
  );
  process.chdir(promptDir);
  jest.resetModules();
}

async function runOnce(modelText) {
  const realFetch = global.fetch;
  let n = 0;
  global.fetch = jest.fn(async (url) => {
    n++;
    if (typeof url === 'string' && url.includes('/api/terminal/processes')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ processes: [{ id: 'p1' }] }),
        text: async () => '{"processes":[{"id":"p1"}]}',
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: n === 1 ? modelText : 'done' }] }),
      text: async () => '',
    };
  });
  try {
    return await POST({ json: async () => ({ message: 'go' }) });
  } finally {
    global.fetch = realFetch;
  }
}

describe('schema-aware no-params check (T-015)', () => {
  beforeAll(() => {
    stubPrompt();
    process.env.MINIMAX_API_KEY = 'test-api-key-valid-001';
    delete process.env.ANTHROPIC_API_KEY;
    POST = require('../route').POST;
  });
  afterAll(() => {
    if (originalCwd) process.chdir(originalCwd);
    if (promptDir) fs.rmSync(promptDir, { recursive: true, force: true });
    delete process.env.MINIMAX_API_KEY;
  });

  test('list_terminals {} → dispatched, returns processes', async () => {
    const res = await runOnce('TOOL: list_terminals\n');
    const body = await res.json();
    expect(body.tool_results[0].tool).toBe('list_terminals');
    expect(body.tool_results[0].result.error).toBeUndefined();
    expect(body.tool_results[0].result.processes).toEqual([{ id: 'p1' }]);
  });

  test('get_swarm_status {} → dispatched (no canonical error)', async () => {
    // DB unavailable in JSDOM → tool may return error/no_active_mission.
    // Critical: NOT the canonical "missing required parameters" shape.
    const res = await runOnce('TOOL: get_swarm_status\n');
    const body = await res.json();
    expect(body.tool_results[0].tool).toBe('get_swarm_status');
    expect(body.tool_results[0].result).not.toEqual({ error: 'missing required parameters' });
  });

  test('open_url no params → canonical error (url is required)', async () => {
    const res = await runOnce('TOOL: open_url\n');
    const body = await res.json();
    expect(body.tool_results[0].result).toEqual({ error: 'missing required parameters' });
  });

  test('browse_files no params → canonical error (C1 preserved)', async () => {
    const res = await runOnce('TOOL: browse_files\n');
    const body = await res.json();
    expect(body.tool_results[0].result).toEqual({ error: 'missing required parameters' });
  });

  test('list_terminals with extra params → still dispatches', async () => {
    const res = await runOnce('TOOL: list_terminals\nPARAM: action=list\n');
    const body = await res.json();
    expect(body.tool_results[0].tool).toBe('list_terminals');
    expect(body.tool_results[0].result.error).toBeUndefined();
  });
});

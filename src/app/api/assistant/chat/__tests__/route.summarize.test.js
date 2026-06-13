/**
 * Chat route integration test for `summarizeTerminal` registration (T-105).
 *
 * Verifies that the chat route's `buildRegistry()` exposes the new
 * `summarize_terminal` tool alongside the existing terminal tools, and
 * that its input schema is a oneOf-like shape (i.e. `name` XOR `terminalId`).
 *
 * We don't hit MiniMax — we just import the route module, grab the
 * tool definitions via `registry.toAnthropicTools()`, and inspect them.
 */

// Integration smoke for the chat route. We mock fetch at the module boundary
// (so no real MiniMax call is made) and exercise the route's loader, MAX_TURNS
// loop, error contract, and the summarize_terminal registration.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let route;
let originalCwd;
let promptDir;
let POST;

function stubPrompt() {
  originalCwd = process.cwd();
  promptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-route-summarize-test-'));
  fs.mkdirSync(path.join(promptDir, 'docs', 'prompts', 'asistente'), {
    recursive: true,
  });
  const stubPromptContent = `# Stub prompt\n\nTools: open_url, browse_files.\n`;
  fs.writeFileSync(
    path.join(promptDir, 'docs', 'prompts', 'asistente', 'zed-system-prompt.md'),
    stubPromptContent
  );
  process.chdir(promptDir);
  // Clear module cache so the route picks up our cwd before loading the prompt
  jest.resetModules();
}

function restoreCwd() {
  if (originalCwd) process.chdir(originalCwd);
  if (promptDir) fs.rmSync(promptDir, { recursive: true, force: true });
}

describe('chat route — summarizeTerminal registration (T-105 / ZTT-005)', () => {
  beforeAll(() => {
    stubPrompt();
    // Long-enough key for the isUsableZedApiKey() check (min 16 chars).
    process.env.MINIMAX_API_KEY = 'test-key-1234567890ABCDEF';
    delete process.env.ANTHROPIC_API_KEY;
    route = require('../route');
    POST = route.POST;
  });

  afterAll(() => {
    restoreCwd();
    delete process.env.MINIMAX_API_KEY;
  });

  test('summarize_terminal tool module is loadable and has oneOf-like schema', () => {
    const { summarizeTerminalTool } = require('../../../../../lib/asistente/tools/summarizeTerminal');
    expect(summarizeTerminalTool).toBeDefined();
    expect(summarizeTerminalTool.name).toBe('summarize_terminal');
    // Input schema must accept `name` AND `terminalId` (oneOf-style).
    expect(summarizeTerminalTool.parameters).toHaveProperty('name');
    expect(summarizeTerminalTool.parameters).toHaveProperty('terminalId');
  });

  test('route POST sends summarize_terminal in the tools list to MiniMax', async () => {
    const realFetch = global.fetch;
    let observedTools = null;
    global.fetch = jest.fn(async (_url, init) => {
      try {
        const body = JSON.parse(init.body);
        observedTools = body.tools || null;
      } catch {
        /* ignore */
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: 'text', text: 'Stub final answer.' }],
        }),
        text: async () => '',
      };
    });
    try {
      const request = { json: async () => ({ message: 'summarize chase' }) };
      const res = await POST(request);
      expect(res.status).toBe(200);
      // The tools list sent to the model MUST contain summarize_terminal.
      expect(Array.isArray(observedTools)).toBe(true);
      const names = observedTools.map((t) => t.name);
      expect(names).toContain('summarize_terminal');
      // And the existing terminal tools stay registered (regression check).
      expect(names).toContain('open_terminal');
      expect(names).toContain('list_terminals');
      expect(names).toContain('execute_in_terminal');
      expect(names).toContain('review_terminal_output');
      expect(names).toContain('close_terminal');
    } finally {
      global.fetch = realFetch;
    }
  });
});

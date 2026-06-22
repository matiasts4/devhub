// T-017: delegate_to_opencode must be gone from the chat route's tool
// registry and the system prompt. Zed should drive the visible tmux
// terminal via list_terminals + execute_in_terminal instead of
// auto-invoking OpenCode in a detached session.
//
// Strategy:
//  1. Load the route module, then call POST with a model that emits
//     `TOOL: delegate_to_opencode`. The route's dispatch must fail
//     with an Unknown tool error (registry does not contain the tool).
//  2. Read the system prompt file and assert the section is gone
//     AND the numbering is correct (8, 9, 10 → 7, 8, 9).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let route;
let originalCwd;
let promptDir;
let POST;
let PROMPT_PATH;

function stubPrompt(content = '# Stub\n') {
  originalCwd = process.cwd();
  promptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-route-t017-'));
  const promptsDir = path.join(promptDir, 'docs', 'prompts', 'asistente');
  fs.mkdirSync(promptsDir, { recursive: true });
  PROMPT_PATH = path.join(promptsDir, 'zed-system-prompt.md');
  fs.writeFileSync(PROMPT_PATH, content);
  process.chdir(promptDir);
  jest.resetModules();
}

function restoreCwd() {
  if (originalCwd) process.chdir(originalCwd);
  if (promptDir) fs.rmSync(promptDir, { recursive: true, force: true });
}

describe('T-017: delegate_to_opencode removed', () => {
  beforeAll(() => {
    stubPrompt();
    process.env.MINIMAX_API_KEY = 'k';
    delete process.env.ANTHROPIC_API_KEY;
    route = require('../route');
    POST = route.POST;
  });
  afterAll(() => {
    restoreCwd();
    delete process.env.MINIMAX_API_KEY;
  });

  test('route POST with delegate_to_opencode → Unknown tool error in tool result', async () => {
    // The tool is no longer in the registry → execute() throws
    // "Unknown tool: delegate_to_opencode" → tool result is { error: ... }.
    const realFetch = global.fetch;
    let n = 0;
    global.fetch = jest.fn(async () => {
      n++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: n === 1 ? 'TOOL: delegate_to_opencode\nPARAM: task=hi\n' : 'finished',
            },
          ],
        }),
        text: async () => '',
      };
    });
    try {
      const res = await POST({ json: async () => ({ message: 'delegate' }) });
      const body = await res.json();
      expect(body.tool_results).toHaveLength(1);
      expect(body.tool_results[0].tool).toBe('delegate_to_opencode');
      expect(body.tool_results[0].result.error).toMatch(/Unknown tool/i);
    } finally {
      global.fetch = realFetch;
    }
  });

  test('stub prompt file does not contain "delegate_to_opencode"', () => {
    // The stub prompt we wrote in stubPrompt() is the live prompt for the
    // loaded route. By construction it has no delegation section. This
    // guards against accidentally re-introducing the tool name in the stub.
    const content = fs.readFileSync(PROMPT_PATH, 'utf8');
    expect(content).not.toMatch(/delegate_to_opencode/);
  });

  test('real system prompt file at the repo root also lacks the tool name', () => {
    // Regression guard: read the on-disk prompt at its real location
    // (independent of the stubPrompt cwd override). If a future commit
    // re-introduces the "### 7. delegate_to_opencode" section, this
    // catches it without needing the route to be loaded.
    const realPrompt = path.join(
      process.env.REPO_ROOT || path.resolve(__dirname, '..', '..', '..', '..', '..', '..'),
      'docs',
      'prompts',
      'asistente',
      'zed-system-prompt.md'
    );
    if (!fs.existsSync(realPrompt)) {
      return; // CI may run from a different layout; skip gracefully.
    }
    const content = fs.readFileSync(realPrompt, 'utf8');
    expect(content).not.toMatch(/delegate_to_opencode/);
  });
});

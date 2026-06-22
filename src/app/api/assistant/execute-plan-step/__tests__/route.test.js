/**
 * @jest-environment node
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let POST;
let originalCwd;
let promptDir;

function stubPrompt() {
  originalCwd = process.cwd();
  promptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-execute-plan-step-'));
  fs.mkdirSync(path.join(promptDir, 'docs', 'prompts', 'asistente'), { recursive: true });
  fs.writeFileSync(
    path.join(promptDir, 'docs', 'prompts', 'asistente', 'zed-system-prompt.md'),
    '# Stub\n'
  );
  process.chdir(promptDir);
  jest.resetModules();
}

jest.mock('@/lib/asistente/buildZedRegistry', () => ({
  buildZedRegistry: () => ({
    execute: jest.fn(async (tool, input) => {
      if (tool === 'list_terminals') {
        return { processes: [] };
      }
      if (tool === 'open_terminal') {
        return { terminalId: 't1', displayName: 'Panel-1' };
      }
      if (tool === 'execute_in_terminal') {
        return { error: 'command_requires_approval' };
      }
      return { ok: true };
    }),
  }),
}));

describe('execute-plan-step route', () => {
  beforeAll(() => {
    stubPrompt();
    POST = require('../route').POST;
  });

  afterAll(() => {
    if (originalCwd) process.chdir(originalCwd);
    if (promptDir) fs.rmSync(promptDir, { recursive: true, force: true });
  });

  test('rejects missing tool', async () => {
    const res = await POST({ json: async () => ({ input: {} }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('tool is required');
  });

  test('rejects missing input', async () => {
    const res = await POST({ json: async () => ({ tool: 'list_terminals' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('input is required');
  });

  test('executes tool and returns ok result', async () => {
    const res = await POST({
      json: async () => ({
        tool: 'list_terminals',
        input: {},
        context: { terminal_panel_count: 0 },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.tool).toBe('list_terminals');
    expect(body.result).toEqual({ processes: [] });
  });

  test('returns ok:false for approval-required results', async () => {
    const res = await POST({
      json: async () => ({
        tool: 'execute_in_terminal',
        input: { name: 'Panel-1', input: 'ls' },
        context: { terminal_panel_count: 1 },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.result.error).toBe('command_requires_approval');
  });
});

// T-031: regression for the quadratic conversation-growth bug. Before the
// fix the route re-pushed the cumulative `allToolResults` into the
// conversation each turn, producing lengths 1, 3, 6, 10, 15, 21 at turns
// 1..6 (n*(n+3)/2). After the fix only THIS turn's results are pushed, so
// the length at the START of turn N is `1 + 2*(N-1)` (linear).
//
// We mock global.fetch to capture every `messages[]` payload sent to the
// MiniMax API and answer 3 turns of `TOOL: get_swarm_status` followed by a
// final-text turn. list_terminals short-circuits after one turn (no 2nd LLM
// call), so this test uses a non-short-circuitable tool for linear growth.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let POST;
let originalCwd;
let promptDir;

function stubPrompt() {
  originalCwd = process.cwd();
  promptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-route-t031-'));
  fs.mkdirSync(path.join(promptDir, 'docs', 'prompts', 'asistente'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(promptDir, 'docs', 'prompts', 'asistente', 'zed-system-prompt.md'),
    '# Stub\n'
  );
  process.chdir(promptDir);
  jest.resetModules();
}

async function cleanupTempDir(dir) {
  if (!dir || !fs.existsSync(dir)) return;

  async function retry(op, delayMs = 50) {
    for (let i = 0; i < 10; i++) {
      try {
        return op();
      } catch (err) {
        if (i === 9) throw err;
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }

  async function removeRecursive(target) {
    const stat = fs.lstatSync(target);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target)) {
        await removeRecursive(path.join(target, entry));
      }
      await retry(() => fs.rmdirSync(target));
    } else {
      await retry(() => fs.unlinkSync(target));
    }
  }

  try {
    await removeRecursive(dir);
  } catch (err) {
    console.warn('Failed to clean up temp dir:', dir, err.message);
  }
}

describe('T-031: conversation grows linearly across tool-loop turns', () => {
  beforeAll(() => {
    stubPrompt();
    process.env.MINIMAX_API_KEY = 'test-api-key-valid-001';
    delete process.env.ANTHROPIC_API_KEY;
    POST = require('../route').POST;
  });
  afterAll(async () => {
    // Require the same shared.js instance that route.js loaded after
    // jest.resetModules(), so we actually close the open DB handle.
    const { closeDb } = require('../../../../../lib/db/shared');
    closeDb();
    if (originalCwd) process.chdir(originalCwd);
    await cleanupTempDir(promptDir);
    delete process.env.MINIMAX_API_KEY;
  });

  test('3 tool turns then final text → conversation lengths are linear', async () => {
    const observedLengths = [];
    let modelCalls = 0;
    const realFetch = global.fetch;
    global.fetch = jest.fn(async (url, init) => {
      if (typeof url === 'string' && url.includes('/api/terminal/processes')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ processes: [] }),
          text: async () => '{"processes":[]}',
        };
      }
      modelCalls++;
      const body = JSON.parse(init.body);
      observedLengths.push(body.messages.length);
      const isFinal = modelCalls >= 4;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: isFinal ? 'all done' : 'TOOL: get_swarm_status\n',
            },
          ],
        }),
        text: async () => '',
      };
    });

    try {
      const res = await POST({ json: async () => ({ message: 'go' }) });
      const body = await res.json();

      // 3 tool turns aggregate into `allToolResults` for the final payload.
      expect(body.tool_results).toHaveLength(3);
      expect(body.text).toBe('all done');

      // Linear growth invariant: at the start of turn N the conversation
      // holds the original user message + (assistant text + 1 tool result)
      // per prior turn = 1 + 2*(N-1). The pre-fix shape was 1, 3, 6, 10.
      expect(observedLengths).toEqual([1, 3, 5, 7]);

      // Belt + suspenders: ensure we never crossed the quadratic threshold.
      // At turn 3 the pre-fix value would have been 6; at turn 4, 10. Cap
      // at `initial + 2 * N` = 1 + 2*3 = 7 for the 4th call (start of T4).
      expect(observedLengths[2]).toBeLessThanOrEqual(6);
      expect(observedLengths[3]).toBeLessThanOrEqual(8);
    } finally {
      global.fetch = realFetch;
    }
  });
});

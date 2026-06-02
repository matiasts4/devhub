/**
 * T-027 — Regression guard for zed-system-prompt.md
 *
 * Locks down the three rules added in T-027 so a future prompt edit cannot
 * silently regress the "ejecuta X" → "open_terminal without command" bug.
 *
 *   Bug:  model emits `TOOL: open_terminal` (no command) when the user asks
 *         to "ejecuta ls" / "run X" / "correr X". The terminal opens empty
 *         and the model then hallucinates that the command ran.
 *   Fix:  the system prompt must (1) state the action rule near the top,
 *         (2) make the `open_terminal` command param docs say it is
 *         required for run-verbs, and (3) include a WRONG/RIGHT example
 *         showing the actual call shape.
 *
 * The test reads the prompt synchronously from disk (no JSDOM, no module
 * import) so it fails fast at file load if the path is wrong.
 */

const fs = require('fs');
const path = require('path');

const PROMPT_PATH = path.join(
  process.cwd(),
  'docs',
  'prompts',
  'asistente',
  'zed-system-prompt.md'
);

function readPrompt() {
  return fs.readFileSync(PROMPT_PATH, 'utf8');
}

describe('zed-system-prompt.md (T-027 regression)', () => {
  test('prompt file is present and non-empty', () => {
    const prompt = readPrompt();
    expect(prompt.length).toBeGreaterThan(100);
  });

  test('declares the "Opening alone is NOT executing" action rule', () => {
    const prompt = readPrompt();
    expect(prompt).toMatch(/Opening alone is NOT executing/);
  });

  test('action rules cover all the run-verb variants (es + en)', () => {
    const prompt = readPrompt();
    // Spanish + English + bare "run" must all be explicitly listed.
    expect(prompt).toMatch(/\bejecuta\b/);
    expect(prompt).toMatch(/\brun\b/);
    expect(prompt).toMatch(/\bcorre\b/);
    expect(prompt).toMatch(/\bcorrer\b/);
    expect(prompt).toMatch(/\bexecute\b/);
  });

  test('open_terminal command param docs call out the run-verb requirement', () => {
    const prompt = readPrompt();
    // Find the open_terminal section: it ends at the next "### " heading.
    const match = prompt.match(/### 1\. open_terminal[\s\S]*?(?=\n### )/);
    expect(match).not.toBeNull();
    const section = match[0];
    expect(section).toMatch(/Required when the user asks/i);
  });

  test('includes a WRONG vs RIGHT example for the run-verb bug', () => {
    const prompt = readPrompt();
    // The example must contain both a wrong and a right call, and the wrong
    // call must be missing `command=ls` while the right one includes it.
    expect(prompt).toMatch(/WRONG/);
    expect(prompt).toMatch(/RIGHT/);
    expect(prompt).toMatch(/abre una terminal y ejecuta ls/);
    expect(prompt).toMatch(/PARAM:\s*command=ls/);
  });
});

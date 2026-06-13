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
 * T-032 — Latency fix: lock down the "do not re-verify after the tool
 * confirmed" rule. The MiniMax M3 model was emitting redundant
 * `review_terminal_output` calls after `open_terminal` (which already
 * returns `command_sent`) and after `execute_in_terminal` (which already
 * returns `sent: true`), adding 2-3 unnecessary turns to every
 * "open a terminal and run X" interaction. See
 * `openspec/changes/zed-hardening/latency-and-swarm-analysis.md`
 * Recommendation C. The fix is a system-prompt rule in three places:
 *   (a) the `## Action rules` section near the top,
 *   (b) the `### 1. open_terminal` reference block,
 *   (c) the `### 4. execute_in_terminal` reference block,
 * plus a guard against re-calling `review_terminal_output` on the same
 * `session_id` after a noisy ANSI capture.
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
    // Updated for native tools: still has WRONG/RIGHT guidance + the example sentence.
    // No longer contains the old textual PARAM: syntax (we use function calling now).
    expect(prompt).toMatch(/WRONG/);
    expect(prompt).toMatch(/RIGHT/);
    expect(prompt).toMatch(/abre una terminal y ejecuta ls/);
    // The right way now emphasizes passing the command param (schema level).
    expect(prompt).toMatch(/with the `command`/i);
  });

  // ----- Observability (point 3) + native tools update -----
  // The old T-032 "never review after confirm to save turns" policy was relaxed
  // because reliable native tool_use + auto recent_output on execute make it
  // cheap and valuable for the model to see actual command output and give
  // accurate final answers to the user. These tests now guard the new guidance.

  test('action rules now encourage using review / recent_output after commands for accurate answers', () => {
    const prompt = readPrompt();
    const actionRules = prompt.match(/## Action rules[\s\S]*?(?=\n## |$)/);
    expect(actionRules).not.toBeNull();
    const lower = actionRules[0].toLowerCase();
    // Model should use output (recent_output in result or explicit review) to summarize
    expect(lower).toMatch(/review_terminal_output|recent_output/);
    expect(lower).toMatch(/accurate summary|what happened/);
  });

  test('open_terminal and execute sections mention output / review for good final replies', () => {
    const prompt = readPrompt();
    const openSec = prompt.match(/### 1\. open_terminal[\s\S]*?(?=\n### |$)/);
    const execSec = prompt.match(/### 4\. execute_in_terminal[\s\S]*?(?=\n### |$)/);
    expect(openSec).not.toBeNull();
    expect(execSec).not.toBeNull();
    // Both should talk about output or review (we no longer forbid it)
    expect(openSec[0].toLowerCase() + execSec[0].toLowerCase()).toMatch(/recent_output|review_terminal_output|output/);
  });

  test('rules section describes terminal workflow including review for output', () => {
    const prompt = readPrompt();
    expect(prompt).toMatch(/After running commands, use `review_terminal_output`/);
    expect(prompt).toMatch(/recent_output/);
  });

  // ----- T-WSR-zed-002 (ASST-CHAT-003) -----
  // ----- T-401 / ZCX-002 (Terminales nombradas) -----
  test('T-401: Terminales nombradas section sits between get_swarm_status and ZED Orchestrator Pod', () => {
    const prompt = readPrompt();
    const swarmIdx = prompt.indexOf('### 9. get_swarm_status');
    const namedIdx = prompt.indexOf('### Terminales nombradas');
    const podIdx = prompt.indexOf('## ZED Orchestrator Pod');
    expect(swarmIdx).toBeGreaterThan(-1);
    expect(namedIdx).toBeGreaterThan(-1);
    expect(podIdx).toBeGreaterThan(-1);
    expect(namedIdx).toBeGreaterThan(swarmIdx);
    expect(podIdx).toBeGreaterThan(namedIdx);
  });

  test('T-401: Terminales nombradas section is ≤8 lines and codifies displayName, Levenshtein, two-sentence digest', () => {
    const prompt = readPrompt();
    const match = prompt.match(/### Terminales nombradas[\s\S]*?(?=\n## )/);
    expect(match).not.toBeNull();
    const section = match[0].trimEnd();
    const lineCount = section.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(8);
    const lower = section.toLowerCase();
    expect(lower).toMatch(/displayname/);
    expect(lower).toMatch(/levenshtein/);
    expect(lower).toMatch(/dos frases|2 frases/);
    expect(lower).toMatch(/summarize_terminal/);
  });

  test('T-WSR-zed-002: prompt has a "Prior-turn context" section that tells the model to use history for anaphoric resolution', () => {
    // ASST-CHAT-003: the closure fix (drop .slice(0, -1)) sends the full
    // history to the model. The model must be told to USE that history
    // for anaphoric references (e.g. "esa terminal", "that command")
    // rather than re-running tools. The 2-line prompt addition must
    // contain the substrings asserted below so the model can find the
    // section by name and apply the rule.
    const prompt = readPrompt();
    expect(prompt).toMatch(/treat them as user-visible context/);
    expect(prompt).toMatch(/use the history to resolve the reference/);
    // Both substrings MUST be in the SAME "Prior-turn context" section
    // (a "## Prior-turn context" heading or a "### Prior-turn context"
    // sub-heading — either is fine).
    const section = prompt.match(/#{2,3}\s*Prior-turn context[\s\S]*?(?=\n#{2,3}\s)/);
    expect(section).not.toBeNull();
    expect(section[0]).toMatch(/treat them as user-visible context/);
    expect(section[0]).toMatch(/use the history to resolve the reference/);
  });
});

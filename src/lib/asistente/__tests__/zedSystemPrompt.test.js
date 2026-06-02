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
    // The example must contain both a wrong and a right call, and the wrong
    // call must be missing `command=ls` while the right one includes it.
    expect(prompt).toMatch(/WRONG/);
    expect(prompt).toMatch(/RIGHT/);
    expect(prompt).toMatch(/abre una terminal y ejecuta ls/);
    expect(prompt).toMatch(/PARAM:\s*command=ls/);
  });

  // ----- T-032: latency fix — do not re-verify after the tool confirmed -----

  test('T-032: action rules section says "do not" near the "tool confirms" / command_sent context', () => {
    const prompt = readPrompt();
    // The new rule must live in the ## Action rules section AND mention
    // "do not" in the same paragraph as the tool-confirmation context
    // (either "tool confirms" or "command_sent"). We assert the
    // "do not" phrase appears at all (case-insensitive) — the
    // section-scoped regex below pins it to the right neighborhood.
    const actionRules = prompt.match(/## Action rules[\s\S]*?(?=\n## )/);
    expect(actionRules).not.toBeNull();
    expect(actionRules[0].toLowerCase()).toMatch(/do not/);
    // The phrasing must connect "do not" with the tool-confirmation
    // vocabulary, not just appear in passing.
    expect(actionRules[0]).toMatch(/(tool confirms|command\s*s[en]t)/i);
  });

  test('T-032: prompt names both command_sent and sent: true as confirmation signals', () => {
    const prompt = readPrompt();
    // open_terminal returns { command_sent: "ls" } and execute_in_terminal
    // returns { sent: true }. Both must appear in the prompt so the model
    // recognizes either signature as a confirmation.
    expect(prompt).toMatch(/command_sent/);
    expect(prompt).toMatch(/sent:\s*true/);
  });

  test('T-032: open_terminal section says "do not call review_terminal_output"', () => {
    const prompt = readPrompt();
    const section = prompt.match(/### 1\. open_terminal[\s\S]*?(?=\n### )/);
    expect(section).not.toBeNull();
    // The "do not" phrasing must target review_terminal_output, not
    // be a generic warning about something else. Allow optional
    // backticks around the tool name (markdown formatting) so the
    // assertion is robust to `` `review_terminal_output` `` vs
    // bare `review_terminal_output`.
    expect(section[0].toLowerCase()).toMatch(/do not call\s+`?review_terminal_output`?/);
  });

  test('T-032: execute_in_terminal section says "do not call review_terminal_output"', () => {
    const prompt = readPrompt();
    const section = prompt.match(/### 4\. execute_in_terminal[\s\S]*?(?=\n### )/);
    expect(section).not.toBeNull();
    expect(section[0].toLowerCase()).toMatch(/do not call\s+`?review_terminal_output`?/);
  });

  test('T-032: prompt warns against re-calling review_terminal_output on the same session_id after ANSI capture', () => {
    const prompt = readPrompt();
    // The guard must mention (a) ANSI escape sequences (or ANSI), (b)
    // session_id (so it scopes to a specific session, not a generic
    // "don't retry" rule), and (c) the no-retry instruction.
    expect(prompt).toMatch(/ANSI/);
    expect(prompt).toMatch(/session_id/);
    // Phrasing like "do NOT re-call" / "do not re-call" / "do not call … again".
    // Accept any of those as long as the re-call is forbidden.
    const lower = prompt.toLowerCase();
    expect(lower).toMatch(/(do not re[- ]?call|do not .* on the same session_id)/);
  });

  // ----- T-WSR-zed-002 (ASST-CHAT-003) -----
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

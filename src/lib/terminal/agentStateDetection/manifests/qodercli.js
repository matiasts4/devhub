// Qoder CLI (https://qoder.com/cli) — binary `qodercli`, TUI mode by default.
//
// Qoder CLI follows the claude-code TUI conventions (documented at
// docs.qoder.com/en/cli/using-cli): `>` dialog-mode input prompt, slash
// commands (/login, /help, /quit…), `--yolo` to skip permission checks,
// `-p` print mode, AGENTS.md memory and shell hooks. Rules below target that
// shared chrome: esc-to-interrupt working footers, braille/dot spinners,
// "do you want to proceed?"-style permission prompts and the bare `>` idle
// prompt. Refine with real captures as qodercli versions evolve.
export default {
  id: 'qodercli',
  version: '2026.07.24.1',
  aliases: ['qodercli', 'qoder', 'qoder-cli'],
  rules: [
    {
      id: 'permission_prompt',
      state: 'blocked',
      priority: 300,
      region: 'bottom_lines(8)',
      visibleBlocker: true,
      any: [
        {
          contains: ['do you want to proceed?'],
        },
        {
          contains: ['waiting for permission'],
        },
        {
          contains: ['permission requested'],
        },
        {
          contains: ['allow once', 'allow always'],
        },
        {
          lineRegex: ['(?i)^\\s*❯?\\s*1\\.\\s*yes\\b'],
        },
        {
          lineRegex: ['(?i)^\\s*❯?\\s*yes\\b'],
        },
        {
          lineRegex: ['(?i)allow\\s*\\[y\\/n\\]'],
        },
        {
          lineRegex: ['(?i)^\\s*\\[y\\/n\\]\\s*$'],
        },
      ],
    },
    {
      // Explicit idle prompt in bottom 3 lines wins over scrollback. Qoder CLI
      // shows the `>` dialog-mode indicator (docs: input modes table) plus a
      // shortcuts hint, mirroring the claude-code idle chrome.
      id: 'idle_prompt_footer',
      state: 'idle',
      priority: 200,
      region: 'bottom_lines(3)',
      visibleIdle: true,
      any: [
        { contains: ['? for shortcuts'] },
        { contains: ['press ? for shortcuts'] },
        { lineRegex: ['(?i)^\\s*(qodercli|qoder)\\s*>'] },
      ],
    },
    {
      // claude-code-style footer shown while the agent is generating.
      id: 'working_footer_esc_cancel',
      state: 'running',
      priority: 210,
      region: 'bottom_lines(8)',
      visibleWorking: true,
      any: [
        { contains: ['esc to cancel'] },
        { contains: ['esc to interrupt'] },
        { contains: ['ctrl+c to cancel'] },
        { contains: ['ctrl+c to interrupt'] },
        { lineRegex: ['(?i)esc\\s+to\\s+(cancel|interrupt)'] },
      ],
    },
    {
      id: 'spinner_working',
      state: 'running',
      priority: 100,
      region: 'bottom_lines(8)',
      visibleWorking: true,
      any: [
        {
          // Locale-robust: braille spinner frame(s) + any Unicode word.
          lineRegex: ['(?iu)^\\s*[\\u2800-\\u28FF]+\\s+\\p{L}[\\p{L}\\p{M}\\p{N}_]*'],
        },
        {
          lineRegex: [
            '(?i)^\\s*[\\u2800-\\u28FF]+\\s*(thinking|analyzing|executing|reading|writing|searching|working|processing|running|building|testing)',
          ],
        },
        {
          // claude-style thinking markers (✻ Thinking…, ⏺ Running…) and the
          // plain middle-dot variant.
          lineRegex: [
            '(?i)^\\s*[✻✳✽⏺·]\\s*(thinking|analyzing|executing|reading|writing|searching|working|processing|running|building|testing)',
          ],
        },
        {
          lineRegex: ['(?i)^\\s*tool\\s+call\\b'],
        },
        {
          lineRegex: [
            '(?i)\\b(thinking|analyzing|executing|reading|writing|searching|working|processing)...',
          ],
        },
      ],
    },
  ],
};

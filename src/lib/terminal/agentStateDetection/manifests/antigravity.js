// Ported from herdr .research/herdr/src/detect/manifests/antigravity.toml (2026.06.24.1).
// Note: herdr's spinner_working regex uses \p{Alphabetic} (Rust regex); the JS engine
// compiles patterns without the `u` flag, so it is approximated with ASCII letters.
export default {
  id: 'agy',
  version: '2026.07.23.1',
  aliases: ['agy', 'antigravity', 'antigravity-cli'],
  rules: [
    {
      id: 'permission_prompt',
      state: 'blocked',
      priority: 300,
      region: 'bottom_lines(8)',
      visibleBlocker: true,
      any: [
        {
          contains: ['requesting permission for:'],
        },
        {
          contains: ['do you want to proceed?'],
        },
        {
          contains: ['tab amend', 'edit command'],
        },
        {
          contains: ['allow execution'],
        },
        {
          contains: ['do you grant permission'],
        },
        {
          contains: ['permission requested'],
        },
        {
          contains: ['press enter to confirm'],
        },
        {
          lineRegex: ['(?i)^\\s*\\[y\\/n\\]\\s*$'],
        },
        {
          lineRegex: ['(?i)allow\\s*\\[y\\/n\\]'],
        },
      ],
    },
    {
      // Explicit idle prompt in bottom 3 lines wins over scrollback, and clears instantly when user inputs text
      id: 'idle_prompt_footer',
      state: 'idle',
      priority: 200,
      region: 'bottom_lines(3)',
      visibleIdle: true,
      any: [
        { contains: ['? for shortcuts'] },
        { contains: ['press ? for shortcuts'] },
        { lineRegex: ['(?i)^\\s*(antigravity|>|antigravity\\s*\\(v[^)]+\\))\\s*$'] },
        { lineRegex: ['(?i)^\\s*antigravity>'] },
        { lineRegex: ['(?i)^\\s*>\\s*$'] },
      ],
    },
    {
      // herdr parity: agy 1.1.x / 1.2.x shows "esc to cancel" or "esc to interrupt" in footer while working
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
          lineRegex: ['(?i)^\\s*[\\u2800-\\u28FF]+\\s+[a-z]\\w*ing\\b'],
        },
        {
          lineRegex: [
            '(?i)^\\s*[\\u2800-\\u28FF]+\\s*(thinking|analyzing|executing|reading|writing|searching|working|processing|running|building|testing)',
          ],
        },
        {
          lineRegex: [
            '(?i)^\\s*·\\s*(thinking|analyzing|executing|reading|writing|searching|working|processing|running|building|testing)',
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
    {
      id: 'background_tasks_working',
      state: 'running',
      priority: 90,
      region: 'bottom_lines(8)',
      visibleWorking: true,
      lineRegex: ['(?i)·\\s*[1-9][0-9]*\\s+task'],
    },
  ],
};

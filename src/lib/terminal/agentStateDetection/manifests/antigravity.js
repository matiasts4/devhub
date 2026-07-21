// Ported from herdr .research/herdr/src/detect/manifests/antigravity.toml (2026.06.24.1).
// Note: herdr's spinner_working regex uses \p{Alphabetic} (Rust regex); the JS engine
// compiles patterns without the `u` flag, so it is approximated with ASCII letters.
export default {
  id: 'agy',
  version: '2026.07.21.2',
  aliases: ['agy', 'antigravity', 'antigravity-cli'],
  rules: [
    {
      id: 'permission_prompt',
      state: 'blocked',
      priority: 300,
      region: 'whole_recent',
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
        { lineRegex: ['(?i)^\\s*(antigravity|>)\\s*$'] },
      ],
    },
    {
      // herdr parity: agy 1.1.x shows "esc to cancel" in footer while working
      id: 'working_footer_esc_cancel',
      state: 'running',
      priority: 110,
      region: 'bottom_lines(8)',
      visibleWorking: true,
      contains: ['esc to cancel'],
    },
    {
      id: 'spinner_working',
      state: 'running',
      priority: 100,
      // herdr parity: whole_recent so streaming text doesn't push working signal out of view
      region: 'bottom_lines(8)',
      visibleWorking: true,
      any: [
        {
          lineRegex: ['(?i)^\\s*[\\u2800-\\u28FF]+\\s+[a-z]\\w*ing\\b'],
        },
        {
          lineRegex: ['(?i)^\\s*[\\u2800-\\u28FF]+\\s*(thinking|analyzing|executing|reading|writing|searching|working|processing)'],
        },
        {
          lineRegex: ['(?i)^\\s*·\\s*(thinking|analyzing|executing|reading|writing|searching|working|processing)'],
        },
        {
          lineRegex: ['(?i)^\\s*tool\\s+call\\b'],
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

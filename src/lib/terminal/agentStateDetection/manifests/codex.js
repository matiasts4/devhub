export default {
  id: 'codex',
  version: '2026.06.10.3',
  aliases: ['codex'],
  rules: [
    {
      id: 'osc_title_blocked',
      state: 'blocked',
      priority: 1100,
      region: 'osc_title',
      visibleBlocker: true,
      contains: ['Action Required'],
    },
    {
      id: 'osc_title_working',
      state: 'running',
      priority: 1050,
      region: 'osc_title',
      visibleWorking: true,
      regex: ['^[\\u2800-\\u28FF] '],
    },
    {
      id: 'transcript_viewer',
      state: 'unknown',
      priority: 1000,
      region: 'after_last_prompt_marker',
      skipStateUpdate: true,
      contains: ['↑/↓ to scroll', 'pgup/pgdn to', 'home/end to jump', 'q to quit'],
      any: [
        {
          contains: ['esc to edit prev'],
        },
        {
          contains: ['esc/← to edit prev'],
        },
      ],
    },
    {
      id: 'live_strong_blocker',
      state: 'blocked',
      priority: 900,
      region: 'after_last_prompt_marker',
      visibleBlocker: true,
      any: [
        {
          contains: ['press enter to confirm or esc to cancel'],
        },
        {
          contains: ['enter to submit answer'],
        },
        {
          contains: ['enter to submit all'],
        },
        {
          contains: ['allow command?'],
        },
      ],
    },
    {
      id: 'weak_blocker',
      state: 'blocked',
      priority: 600,
      region: 'whole_recent',
      any: [
        {
          contains: ['[y/n]'],
        },
        {
          contains: ['yes (y)'],
        },
        {
          contains: ['do you want to'],
          any: [
            {
              contains: ['yes'],
            },
            {
              contains: ['❯'],
            },
          ],
        },
        {
          contains: ['would you like to'],
          any: [
            {
              contains: ['yes'],
            },
            {
              contains: ['❯'],
            },
          ],
        },
      ],
    },
    {
      id: 'osc_title_idle',
      state: 'idle',
      priority: 100,
      region: 'osc_title',
      visibleIdle: true,
      regex: ['\\S'],
      not: [
        {
          regex: ['^[\\u2800-\\u28FF]'],
        },
        {
          contains: ['Action Required'],
        },
      ],
    },
  ],
};

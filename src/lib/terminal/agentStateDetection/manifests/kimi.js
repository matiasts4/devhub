export default {
  id: 'kimi',
  version: '2026.06.10.1',
  aliases: ['kimi', 'kimi-code', 'kimi code'],
  rules: [
    {
      id: 'current_approval_panel',
      state: 'blocked',
      priority: 400,
      region: 'whole_recent',
      visibleBlocker: true,
      contains: ['↵ confirm'],
      any: [
        {
          contains: ['run this command?'],
        },
        {
          contains: ['write this file?'],
        },
        {
          contains: ['apply these edits?'],
        },
        {
          contains: ['stop this task?'],
        },
        {
          contains: ['ready to build with this plan?'],
        },
        {
          lineRegex: ['(?i)^\\s*▶?\\s*approve .*\\?$'],
        },
      ],
      all: [
        {
          contains: [' choose'],
        },
        {
          any: [
            {
              contains: ['approve'],
            },
            {
              contains: ['reject'],
            },
            {
              contains: ['revise'],
            },
          ],
        },
      ],
    },
    {
      id: 'question_panel',
      state: 'blocked',
      priority: 390,
      region: 'whole_recent',
      visibleBlocker: true,
      contains: ['↑↓ select', 'esc cancel'],
      lineRegex: ['^\\s*question\\s*$', '^\\s*\\? '],
      any: [
        {
          contains: ['↵ choose'],
        },
        {
          contains: ['↵ toggle'],
        },
        {
          contains: ['↵ save'],
        },
      ],
    },
    {
      id: 'legacy_approval_panel',
      state: 'blocked',
      priority: 300,
      region: 'whole_recent',
      contains: ['requesting approval', 'reject'],
      any: [
        {
          contains: ['approve once'],
        },
        {
          contains: ['approve for this session'],
        },
      ],
      all: [
        {
          any: [
            {
              contains: ['1/2/3/4 choose'],
            },
            {
              contains: ['↵ confirm'],
            },
          ],
        },
      ],
    },
    {
      id: 'background_agent_status_working',
      state: 'running',
      priority: 120,
      region: 'bottom_non_empty_lines(3)',
      visibleWorking: true,
      lineRegex: ['(?i)\\bkimi[-\\w.]*\\s+thinking\\b.*\\[[1-9][0-9]*\\s+agents?\\s+running\\]'],
    },
    {
      id: 'moon_spinner_working',
      state: 'running',
      priority: 100,
      region: 'whole_recent',
      visibleWorking: true,
      lineRegex: ['^\\s*(🌕|🌖|🌗|🌘|🌑|🌒|🌓|🌔)\\s*$'],
    },
    {
      id: 'braille_spinner_working',
      state: 'running',
      priority: 90,
      region: 'whole_recent',
      visibleWorking: true,
      lineRegex: ['(?i)^\\s*[\\u2800-\\u28FF]+\\s*(thinking\\.\\.\\.|working\\.\\.\\.|using )'],
    },
  ],
};

// DevHub extensions on top of herdr 2026.06.10.1
export default {
  id: 'kimi',
  version: '2026.07.20.1',
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
          contains: ['execute command?'],
        },
        {
          contains: ['allow this action?'],
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
      // Explicit idle prompt in bottom 3 lines wins over scrollback, and clears instantly when user inputs text
      id: 'kimi_idle_prompt',
      state: 'idle',
      priority: 200,
      region: 'bottom_lines(3)',
      visibleIdle: true,
      any: [
        { contains: ['ctrl+p commands'] },
        { lineRegex: ['(?i)^\\s*kimi>'] },
      ],
    },
    {
      id: 'background_agent_status_working',
      state: 'running',
      priority: 120,
      region: 'bottom_lines(8)',
      visibleWorking: true,
      lineRegex: ['(?i)\\bkimi[-\\w.]*\\s+thinking\\b.*\\[[1-9][0-9]*\\s+agents?\\s+running\\]'],
    },
    {
      id: 'working_footer_esc_interrupt',
      state: 'running',
      priority: 110,
      region: 'bottom_lines(8)',
      visibleWorking: true,
      contains: ['esc interrupt'],
    },
    {
      id: 'thinking_progress_working',
      state: 'running',
      priority: 105,
      region: 'bottom_lines(8)',
      visibleWorking: true,
      lineRegex: ['(?i)\\b(thinking|working|processing)\\b.*\\/\\s*[\\d.]+%\\s*\\('],
    },
    {
      id: 'moon_spinner_working',
      state: 'running',
      priority: 100,
      region: 'bottom_lines(8)',
      visibleWorking: true,
      lineRegex: ['^\\s*(🌕|🌖|🌗|🌘|🌑|🌒|🌓|🌔)\\s*$'],
    },
    {
      id: 'braille_spinner_working',
      state: 'running',
      priority: 90,
      region: 'bottom_lines(8)',
      visibleWorking: true,
      lineRegex: ['(?i)^\\s*[\\u2800-\\u28FF]+\\s*(thinking|working|using|analyzing|executing|reading|writing|searching)'],
    },
  ],
};

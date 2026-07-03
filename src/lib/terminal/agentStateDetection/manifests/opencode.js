export default {
  id: 'opencode',
  version: '2026.06.10.1',
  aliases: ['opencode', 'open-code'],
  rules: [
    {
      id: 'permission_required',
      state: 'blocked',
      priority: 300,
      region: 'whole_recent',
      visibleBlocker: true,
      any: [
        {
          contains: ['△ Permission required'],
        },
        {
          contains: ['esc dismiss'],
          any: [
            {
              contains: ['enter confirm'],
            },
            {
              contains: ['enter submit'],
            },
            {
              contains: ['enter toggle'],
            },
          ],
          all: [
            {
              any: [
                {
                  contains: ['↑↓ select'],
                },
                {
                  contains: ['⇆ tab'],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'interrupt_hint_working',
      state: 'running',
      priority: 110,
      region: 'whole_recent',
      visibleWorking: true,
      any: [
        {
          contains: ['esc to interrupt'],
        },
        {
          contains: ['ctrl+c to interrupt'],
        },
        {
          contains: ['press esc to interrupt'],
        },
        {
          lineRegex: ['(?i).*opencode.*esc (again to )?interrupt'],
        },
      ],
    },
    {
      id: 'progress_bar_working',
      state: 'running',
      priority: 100,
      region: 'whole_recent',
      visibleWorking: true,
      regex: ['(■|⬝){4,}'],
    },
  ],
};

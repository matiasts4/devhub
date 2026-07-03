export default {
  id: 'grok',
  version: '2026.06.10.1',
  aliases: ['grok', 'groc', 'grok-build'],
  rules: [
    {
      id: 'permission_scope_selector',
      state: 'blocked',
      priority: 300,
      region: 'whole_recent',
      visibleBlocker: true,
      contains: ['yes, proceed', 'no, reject'],
      any: [
        {
          contains: ['use ← → to choose permission whitelist scope'],
        },
        {
          contains: ['←/→:scope'],
        },
      ],
    },
    {
      id: 'waiting_tool_working',
      state: 'running',
      priority: 120,
      region: 'whole_recent',
      visibleWorking: true,
      any: [
        {
          all: [
            {
              contains: ['ctrl+c:cancel', 'ctrl+enter:interject'],
            },
            {
              contains: ['waiting'],
            },
          ],
        },
        {
          lineRegex: ['^\\s*[\\u2800-\\u28FF]\\s+(Run|Read|Search|List)\\b'],
        },
      ],
    },
  ],
};

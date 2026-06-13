const {
  resolveSwarmDelegatedRoleKeys,
  shouldShowSwarmStandbyOverlay,
} = require('../swarmDelegatedRoles');

describe('swarmDelegatedRoles', () => {
  test('resolveSwarmDelegatedRoleKeys from consumed inbox delegate', () => {
    const keys = resolveSwarmDelegatedRoleKeys({
      inbox_recent_consumed: [
        {
          to_role: 'sdd_worker_1',
          body: JSON.stringify({ kind: 'delegate', change: 'terminal-fix' }),
        },
      ],
    });
    expect(keys.has('sdd_worker_1')).toBe(true);
  });

  test('shouldShowSwarmStandbyOverlay hides after delegation', () => {
    const panel = {
      swarmContext: {
        standbyAwaitingDelegation: true,
        roleKey: 'sdd_worker_1',
      },
    };
    const delegated = new Set(['sdd_worker_1']);
    expect(shouldShowSwarmStandbyOverlay(panel, delegated)).toBe(false);
    expect(shouldShowSwarmStandbyOverlay(panel, new Set())).toBe(true);
  });
});

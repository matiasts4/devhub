const { applyActiveWindowColumnSnapshot } = require('../swarmLaunchWorkspace.js');

describe('workspace window column snapshots', () => {
  const windows = [
    {
      id: 'v1',
      name: 'V1',
      columns: [{ id: 'c1', panels: [{ id: 'p1' }] }],
      activePanelId: 'p1',
    },
    {
      id: 'v2',
      name: 'V2',
      columns: [{ id: 'c2', panels: [{ id: 'p2' }] }],
      activePanelId: 'p2',
    },
  ];

  test('applyActiveWindowColumnSnapshot updates only the active window', () => {
    const liveColumns = [
      { id: 'c1', panels: [{ id: 'p1' }, { id: 'p3' }] },
      { id: 'c3', panels: [{ id: 'p4' }] },
    ];

    const next = applyActiveWindowColumnSnapshot(windows, 'v1', liveColumns, 'p3');

    expect(next[0].columns).toEqual(liveColumns);
    expect(next[0].activePanelId).toBe('p3');
    expect(next[1]).toEqual(windows[1]);
  });
});

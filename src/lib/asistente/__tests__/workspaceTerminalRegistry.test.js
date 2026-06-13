const {
  mergeWorkspaceTerminalProcesses,
  workspaceTerminalsFromContext,
} = require('../workspaceTerminalRegistry');

describe('workspaceTerminalRegistry', () => {
  test('client registry wins over API displayName for same id', () => {
    const merged = mergeWorkspaceTerminalProcesses(
      [{ terminalId: 'p1001', displayName: 'Alex' }],
      [{ terminalId: 'p1001', displayName: 'Reese', type: 'sidecar' }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].displayName).toBe('Alex');
  });

  test('mergeWorkspaceTerminalProcesses prefers client displayName for same terminalId', () => {
    const merged = mergeWorkspaceTerminalProcesses(
      [{ terminalId: 'p2', displayName: 'Chase', program: 'opencode' }],
      [{ terminalId: 'p2', type: 'sidecar', cwd: '/tmp' }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      terminalId: 'p2',
      displayName: 'Chase',
      program: 'opencode',
      type: 'sidecar',
      cwd: '/tmp',
    });
  });

  test('workspaceTerminalsFromContext reads workspace_terminals array', () => {
    expect(
      workspaceTerminalsFromContext({
        workspace_terminals: [{ terminalId: 'p1', displayName: 'Nate' }],
      })
    ).toEqual([{ terminalId: 'p1', displayName: 'Nate' }]);
  });
});

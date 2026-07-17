/**
 * @jest-environment node
 */

const { appendWorkspaceTerminalsHint } = require('../route');

describe('appendWorkspaceTerminalsHint', () => {
  test('lists empty snapshot', () => {
    const out = appendWorkspaceTerminalsHint('SYS', []);
    expect(out).toContain('### Open workspace terminals');
    expect(out).toContain('None reported');
    expect(out).toContain('list_terminals');
  });

  test('injects display names and ids', () => {
    const out = appendWorkspaceTerminalsHint('SYS', [
      { terminalId: 'p1', displayName: 'Chase', program: 'opencode' },
      { terminalId: 'p2', displayName: 'Cesar' },
    ]);
    expect(out).toContain('- Chase id=p1 program=opencode');
    expect(out).toContain('- Cesar id=p2');
    expect(out).toContain('summarize_terminal');
  });
});

'use strict';

const {
  nameCandidatesFromEnPhrase,
  resolveNamedTerminalFromMessage,
} = require('../zedTerminalNamePhrase');
const {
  mergeWorkspaceTerminalProcesses,
  buildZedTerminalCatalog,
} = require('../workspaceTerminalRegistry');
const { resolveZedFastPathIntent } = require('../zedFastPath');

describe('zedTerminalNamePhrase', () => {
  test('skips stop words in "en el ex"', () => {
    expect(nameCandidatesFromEnPhrase('el ex')).toEqual(expect.arrayContaining(['ex']));
  });

  test('resolves "abre opencode en el ex" to Alex', () => {
    const hit = resolveNamedTerminalFromMessage('abre opencode en el ex', [
      { terminalId: 'p1001', displayName: 'Alex' },
    ]);
    expect(hit).toEqual({ ok: true, displayName: 'Alex' });
  });

  test('resolves "OpenCode en Alex"', () => {
    const hit = resolveNamedTerminalFromMessage('OpenCode en Alex', [
      { terminalId: 'p1001', displayName: 'Alex' },
    ]);
    expect(hit).toEqual({ ok: true, displayName: 'Alex' });
  });
});

describe('workspaceTerminalRegistry catalog', () => {
  test('client registry wins over API displayName for same id', () => {
    const merged = mergeWorkspaceTerminalProcesses(
      [{ terminalId: 'p1001', displayName: 'Alex' }],
      [{ terminalId: 'p1001', displayName: 'Reese', type: 'sidecar' }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].displayName).toBe('Alex');
  });

  test('client-only native panel stays in catalog without API row', () => {
    const catalog = buildZedTerminalCatalog(
      { workspace_terminals: [{ terminalId: 'p1001', displayName: 'Alex' }] },
      []
    );
    expect(catalog).toEqual([
      expect.objectContaining({ terminalId: 'p1001', displayName: 'Alex' }),
    ]);
  });

  test('fast path uses client Alex for opencode en el ex', () => {
    const hit = resolveZedFastPathIntent('abrí opencode en el ex', {
      workspace_terminals: [{ terminalId: 'p1001', displayName: 'Alex' }],
    });
    expect(hit?.steps[0]).toMatchObject({
      tool: 'execute_in_terminal',
      input: { name: 'Alex', program: 'opencode' },
    });
  });
});

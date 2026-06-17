'use strict';

const {
  resolveZedFastPathIntent,
  extractTerminalNameFromMessage,
  extractMultipleCloseNames,
  normalizeAgentAliases,
  wantsCloseAllTerminals,
} = require('../zedFastPath');
const { formatZedFastPathReply, formatZedToolResultsReply } = require('../zedFastPathResponse');
const { shouldShortCircuitAfterTools } = require('../zedShortCircuit');

const TERMINALS = [
  { terminalId: 'p1', displayName: 'Chase' },
  { terminalId: 'p3', displayName: 'Cesar' },
];

describe('zedFastPath intent cache', () => {
  test('list_terminals on "¿Qué terminales hay?"', () => {
    const hit = resolveZedFastPathIntent('¿Qué terminales hay?', {
      workspace_terminals: TERMINALS,
    });
    expect(hit).toMatchObject({ intent: 'list_terminals', confidence: expect.any(Number) });
    expect(hit.steps[0].tool).toBe('list_terminals');
    expect(hit.confidence).toBeGreaterThanOrEqual(0.85);
  });

  test('does NOT list when user asks to open terminal with Open Code', () => {
    const hit = resolveZedFastPathIntent('Quiero que abras una terminal con Open Code', {
      workspace_terminals: TERMINALS,
    });
    expect(hit?.intent).toBe('open_terminal_agent');
    expect(hit?.steps[0]).toMatchObject({
      tool: 'open_terminal',
      input: { program: 'opencode' },
    });
  });

  test('single open terminal: "nueva terminal con opencode" opens panel, does NOT execute in existing', () => {
    const single = [{ terminalId: 'p1', displayName: 'Casey' }];
    const hit = resolveZedFastPathIntent('abrí una nueva terminal con OpenCode', {
      workspace_terminals: single,
    });
    expect(hit?.steps[0]?.tool).toBe('open_terminal');
    expect(hit?.steps[0]?.input?.program).toBe('opencode');
  });

  test('single open terminal: "terminal con opencode" still opens new panel', () => {
    const single = [{ terminalId: 'p1', displayName: 'Casey' }];
    const hit = resolveZedFastPathIntent('Quiero que abras una terminal con Open Code', {
      workspace_terminals: single,
    });
    expect(hit?.steps[0]?.tool).toBe('open_terminal');
    expect(hit?.steps[0]?.input?.program).toBe('opencode');
  });

  test('repeat request for new terminal with opencode never targets existing panel', () => {
    const single = [{ terminalId: 'p1', displayName: 'Casey' }];
    const hit = resolveZedFastPathIntent('Nueva terminal con OpenCode', {
      workspace_terminals: single,
    });
    expect(hit?.intent).toBe('open_terminal_agent');
    expect(hit?.steps[0]?.tool).toBe('open_terminal');
  });

  test('list on "las terminales hay abiertas ahora mismo"', () => {
    const hit = resolveZedFastPathIntent('las terminales hay abiertas ahora mismo', {
      workspace_terminals: TERMINALS,
    });
    expect(hit?.intent).toBe('list_terminals');
  });

  test('close_terminal on "Cierra César" with accent', () => {
    const hit = resolveZedFastPathIntent('Cierra César', {
      workspace_terminals: TERMINALS,
    });
    expect(hit).toMatchObject({
      intent: 'close_terminal',
      steps: [{ tool: 'close_terminal', input: { name: 'Cesar' } }],
    });
  });

  test('close_terminal on "Quiero que cierres Cesar"', () => {
    const hit = resolveZedFastPathIntent('Quiero que cierres Cesar', {
      workspace_terminals: TERMINALS,
    });
    expect(hit?.steps[0]).toMatchObject({
      tool: 'close_terminal',
      input: { name: 'Cesar' },
    });
  });

  test('close multiple on "cierra Chase y Cesar"', () => {
    const hit = resolveZedFastPathIntent('quiero que cierres Chase y Cesar', {
      workspace_terminals: TERMINALS,
    });
    expect(hit?.intent).toBe('close_multiple');
    expect(hit?.steps).toHaveLength(1);
    expect(hit?.steps[0]).toMatchObject({
      tool: 'close_all_terminals',
      input: { names: expect.arrayContaining(['Cesar', 'Chase']) },
    });
    expect(hit?.steps[0].input.names).toHaveLength(2);
  });

  test('close_all on plural "cierra las terminales abiertas"', () => {
    const hit = resolveZedFastPathIntent('cierra las terminales abiertas', {
      workspace_terminals: TERMINALS,
    });
    expect(hit?.intent).toBe('close_multiple');
    expect(hit?.matched).toBe('close_all_terminals');
    expect(hit?.steps).toHaveLength(1);
    expect(hit?.steps[0]).toMatchObject({
      tool: 'close_all_terminals',
      input: { names: expect.arrayContaining(['Cesar', 'Chase']) },
    });
    expect(hit?.steps[0].input.names).toHaveLength(2);
  });

  test('close_all on "cerrar las terminales que están abiertas"', () => {
    const hit = resolveZedFastPathIntent('cerrar las terminales que están abiertas', {
      workspace_terminals: TERMINALS,
    });
    expect(hit?.intent).toBe('close_multiple');
    expect(hit?.steps[0]).toMatchObject({
      tool: 'close_all_terminals',
      input: { names: expect.arrayContaining(['Cesar', 'Chase']) },
    });
    expect(hit?.steps[0].input.names).toHaveLength(2);
  });

  test('does NOT list when user asks to close plural terminales', () => {
    const hit = resolveZedFastPathIntent('quiero que cierres las terminales actuales', {
      workspace_terminals: TERMINALS,
    });
    expect(hit?.intent).toBe('close_multiple');
    expect(hit?.steps[0]?.tool).toBe('close_all_terminals');
  });

  test('wantsCloseAllTerminals false for singular "cierra la terminal"', () => {
    expect(wantsCloseAllTerminals('cierra la terminal', 'cierra la terminal', TERMINALS)).toBe(
      false
    );
  });

  test('close_terminal on "cerrá Chase"', () => {
    const hit = resolveZedFastPathIntent('cerrá Chase', {
      workspace_terminals: TERMINALS,
    });
    expect(hit?.steps[0]?.tool).toBe('close_terminal');
    expect(hit?.steps[0]?.input?.name).toBe('Chase');
  });

  test('execute opencode in existing terminal', () => {
    const hit = resolveZedFastPathIntent('abrí opencode en Chase', {
      workspace_terminals: TERMINALS,
    });
    expect(hit).toMatchObject({
      intent: 'execute_agent_in_terminal',
      steps: [{ tool: 'execute_in_terminal', input: { name: 'Chase', program: 'opencode' } }],
    });
  });

  test('execute opencode with "Open Code" STT alias in named terminal', () => {
    const hit = resolveZedFastPathIntent('OpenCode en César', {
      workspace_terminals: TERMINALS,
    });
    expect(hit?.steps[0]).toMatchObject({
      tool: 'execute_in_terminal',
      input: { name: 'Cesar', program: 'opencode' },
    });
  });

  test('open terminal with kimi', () => {
    const hit = resolveZedFastPathIntent('abre una terminal con Kimi', {
      workspace_terminals: TERMINALS,
    });
    expect(hit?.intent).toBe('open_terminal_agent');
    expect(hit?.steps[0]).toMatchObject({
      tool: 'open_terminal',
      input: { program: 'kimi' },
    });
  });

  test('open two terminals with kimi', () => {
    const hit = resolveZedFastPathIntent('abre dos terminales nuevas con Kimi', {
      workspace_terminals: TERMINALS,
    });
    expect(hit?.intent).toBe('open_terminal_agent');
    expect(hit?.steps).toHaveLength(2);
    expect(hit?.steps.every((s) => s.input.program === 'kimi')).toBe(true);
  });

  test('open three terminals with opencode via digits', () => {
    const hit = resolveZedFastPathIntent('abre 3 terminales con opencode', {
      workspace_terminals: TERMINALS,
    });
    expect(hit?.intent).toBe('open_terminal_agent');
    expect(hit?.steps).toHaveLength(3);
  });

  test('execute kimi in existing terminal', () => {
    const hit = resolveZedFastPathIntent('abrí Kimi en Chase', {
      workspace_terminals: TERMINALS,
    });
    expect(hit).toMatchObject({
      intent: 'execute_agent_in_terminal',
      steps: [{ tool: 'execute_in_terminal', input: { name: 'Chase', program: 'kimi' } }],
    });
  });

  test('normalizeAgentAliases maps open kimi and dictation variants', () => {
    expect(normalizeAgentAliases('Open Kimi en terminal')).toContain('kimi');
    expect(normalizeAgentAliases('abre quimy')).toContain('kimi');
    expect(normalizeAgentAliases('lanza kimy')).toContain('kimi');
  });

  test('open_url on "abrí github.com en pizarra"', () => {
    const hit = resolveZedFastPathIntent('abrí github.com en pizarra', {
      workspace_terminals: TERMINALS,
    });
    expect(hit?.steps[0]?.tool).toBe('open_url');
    expect(hit?.steps[0]?.input?.url).toMatch(/github\.com/);
  });

  test('ambiguous close returns null fast path', () => {
    const hit = resolveZedFastPathIntent('cierra terminal Cha', {
      workspace_terminals: [
        { terminalId: 'p1', displayName: 'Chase' },
        { terminalId: 'p2', displayName: 'Chaser' },
      ],
    });
    expect(hit).toBeNull();
  });

  test('long message falls back to LLM', () => {
    const hit = resolveZedFastPathIntent('x'.repeat(300), {
      workspace_terminals: TERMINALS,
    });
    expect(hit).toBeNull();
  });

  test('formatZedFastPathReply for successful close', () => {
    const text = formatZedFastPathReply('close_terminal', {
      success: true,
      displayName: 'Cesar',
      message: 'Terminal Cesar cerrada.',
    });
    expect(text).toMatch(/cerr/i);
  });

  test('formatZedFastPathReply for command_requires_approval', () => {
    const text = formatZedFastPathReply('execute_in_terminal', {
      error: 'command_requires_approval',
      command: 'opencode --agent gentle-orchestrator',
    });
    expect(text).toMatch(/confirmación/i);
    expect(text).toMatch(/opencode/i);
  });

  test('formatZedFastPathReply for terminal_panel_limit_reached', () => {
    const text = formatZedFastPathReply('open_terminal', {
      error: 'terminal_panel_limit_reached',
      current: 6,
      max: 6,
    });
    expect(text).toMatch(/límite de paneles/i);
  });

  test('formatZedFastPathReply includes error code for unknown errors', () => {
    const text = formatZedFastPathReply('open_terminal', { error: 'something_failed' });
    expect(text).toMatch(/something_failed/);
  });

  test('formatZedToolResultsReply combines multi-close success', () => {
    const text = formatZedToolResultsReply([
      {
        tool: 'close_terminal',
        result: { success: true, displayName: 'Chase' },
      },
      {
        tool: 'close_terminal',
        result: { success: true, displayName: 'Cesar' },
      },
    ]);
    expect(text).toMatch(/Chase/);
    expect(text).toMatch(/Cesar/);
  });

  test('extractTerminalNameFromMessage resolves dictation typo', () => {
    const name = extractTerminalNameFromMessage('cierra Ces', TERMINALS);
    expect(name).toBe('Cesar');
  });

  test('extractMultipleCloseNames splits y/e/and', () => {
    expect(extractMultipleCloseNames('cierra Chase y Cesar', TERMINALS).sort()).toEqual([
      'Cesar',
      'Chase',
    ]);
  });

  test('normalizeAgentAliases maps open code', () => {
    expect(normalizeAgentAliases('Open Code en terminal')).toContain('opencode');
  });

  test('shouldShortCircuitAfterTools on list + close preview', () => {
    expect(
      shouldShortCircuitAfterTools([
        { tool: 'list_terminals', result: { processes: [{ displayName: 'Chase' }] } },
      ])
    ).toBe(true);
    expect(
      shouldShortCircuitAfterTools([
        {
          tool: 'execute_in_terminal',
          result: { error: 'command_requires_approval', command: 'npm install x' },
        },
      ])
    ).toBe(true);
    expect(
      shouldShortCircuitAfterTools([
        { tool: 'close_terminal', result: { error: 'not_found', message: 'no match' } },
      ])
    ).toBe(false);
  });
});

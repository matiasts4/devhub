const { resolveZedIntent, confidenceToTier } = require('../zedIntentRouter');

describe('zedIntentRouter', () => {
  const ctx = {
    workspace_terminals: [{ terminalId: 'p1', displayName: 'Chase' }],
    terminal_panel_count: 1,
  };

  test('maps list terminals to local-high', () => {
    const hit = resolveZedIntent('¿Qué terminales hay?', ctx);
    expect(hit.tier).toBe('local-high');
    expect(hit.steps[0].tool).toBe('list_terminals');
  });

  test('maps browser search via command bar rules', () => {
    const hit = resolveZedIntent('search for typescript docs', ctx);
    expect(hit.tier).toBe('local-high');
    expect(hit.steps[0].tool).toBe('open_url');
    expect(hit.steps[0].input.url).toContain('google.com/search');
  });

  test('implicit close with multiple panels → local-medium', () => {
    const multi = {
      workspace_terminals: [
        { terminalId: 'p1', displayName: 'Chase' },
        { terminalId: 'p2', displayName: 'Cesar' },
      ],
      terminal_panel_count: 2,
    };
    const hit = resolveZedIntent('cierra la terminal', multi);
    expect(hit.tier).toBe('local-medium');
    expect(hit.needsConfirmation).toBe(true);
    expect(hit.steps[0].tool).toBe('close_terminal');
  });

  test('close all plural terminales → close_multiple local-high', () => {
    const multi = {
      workspace_terminals: [
        { terminalId: 'p1', displayName: 'Avery' },
        { terminalId: 'p2', displayName: 'Alex' },
      ],
      terminal_panel_count: 2,
    };
    const hit = resolveZedIntent('cierra las terminales abiertas', multi);
    expect(hit.tier).toBe('local-high');
    expect(hit.intent).toBe('close_multiple');
    expect(hit.steps).toHaveLength(1);
    expect(hit.steps[0].tool).toBe('close_all_terminals');
    expect(hit.steps[0].input.names).toEqual(['Avery', 'Alex']);
  });

  test('two-step open terminal and run command', () => {
    const hit = resolveZedIntent('abre una terminal y ejecuta ls', ctx);
    expect(hit.tier).not.toBe('llm');
    expect(hit.steps.length).toBeGreaterThanOrEqual(1);
  });

  test('compound open + close named terminal is local-high with both steps', () => {
    const multi = {
      workspace_terminals: [
        { terminalId: 'p1', displayName: 'Eibar' },
        { terminalId: 'p2', displayName: 'Alex' },
      ],
      terminal_panel_count: 2,
    };
    const hit = resolveZedIntent('Abre una nueva terminal y cierra la de Eibar.', multi);
    expect(hit.tier).toBe('local-high');
    // May resolve via compound matcher or two-step clause split — both must open + close.
    expect(hit.steps).toEqual([
      { tool: 'open_terminal', input: {} },
      { tool: 'close_terminal', input: { name: 'Eibar' } },
    ]);
    expect(hit.intent).toMatch(/open|close/i);
  });

  test('compound open + unknown close target → llm (no half plan)', () => {
    const hit = resolveZedIntent('Abre una nueva terminal y cierra la de Fantasma.', ctx);
    expect(hit.tier).toBe('llm');
    expect(hit.steps).toHaveLength(0);
  });

  test('maps spanish ejecuta to terminal-run local-high', () => {
    const hit = resolveZedIntent('ejecuta npm test', ctx);
    expect(hit.tier).toBe('local-high');
    expect(hit.steps[0].tool).toBe('open_terminal');
    expect(hit.steps[0].input.command).toBe('npm test');
  });

  test('confidenceToTier boundaries', () => {
    expect(confidenceToTier(0.9)).toBe('local-high');
    expect(confidenceToTier(0.75)).toBe('local-medium');
    expect(confidenceToTier(0.5)).toBe('llm');
  });
});

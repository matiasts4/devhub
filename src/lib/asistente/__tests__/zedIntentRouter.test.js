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

  test('two-step open new terminal and open grok merges into one open_terminal', () => {
    const hit = resolveZedIntent(
      'abre una nueva terminal y en ella abre grok, coloca en grok hola probando',
      ctx
    );
    expect(hit.tier).toBe('local-high');
    const hasGrokOpen = hit.steps.some(
      (s) =>
        (s.tool === 'launch_agent_session' && s.input?.program === 'grok') ||
        (s.tool === 'open_terminal' && s.input?.program === 'grok')
    );
    expect(hasGrokOpen).toBe(true);
    // Empty open_terminal + agent launch should collapse to a single program open.
    const emptyOpens = hit.steps.filter(
      (s) => s.tool === 'open_terminal' && !s.input?.program && !s.input?.command
    );
    expect(emptyOpens).toHaveLength(0);
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

const { getTuiAdapter, tuiAdapterRegistry, resolveTuiAdapterForCommand } = require('./tuiAdapter');

describe('tuiAdapter registry', () => {
  test('exports adapters for opencode, grok, agent, and plain', () => {
    expect(Object.keys(tuiAdapterRegistry).sort()).toEqual(['agent', 'grok', 'opencode', 'plain']);
  });

  test('getTuiAdapter returns distinct objects for opencode and grok', () => {
    const a = getTuiAdapter('opencode');
    const b = getTuiAdapter('grok');
    expect(a).not.toBe(b);
    expect(a.id).toBe('opencode');
    expect(b.id).toBe('grok');
  });

  test('resolveTuiAdapterForCommand maps kimi/codex to agent adapter', () => {
    expect(resolveTuiAdapterForCommand('kimi').id).toBe('agent');
    expect(resolveTuiAdapterForCommand('codex').id).toBe('agent');
    expect(resolveTuiAdapterForCommand('grok').id).toBe('grok');
    expect(resolveTuiAdapterForCommand('opencode --session ses_1').id).toBe('opencode');
    expect(resolveTuiAdapterForCommand('npm run dev').id).toBe('plain');
  });

  test('getTuiAdapter returns plain adapter for unknown signatures', () => {
    expect(getTuiAdapter('unknown').id).toBe('plain');
    expect(getTuiAdapter(null).id).toBe('plain');
    expect(getTuiAdapter(undefined).id).toBe('plain');
  });
});

describe('opencode adapter strategies', () => {
  const a = getTuiAdapter('opencode');

  test('detectReady reads tuiSessionFooterConfirmedRef.current', () => {
    const refs = { tuiSessionFooterConfirmedRef: { current: false } };
    expect(a.detectReady({ refs })).toBe(false);
    refs.tuiSessionFooterConfirmedRef.current = true;
    expect(a.detectReady({ refs })).toBe(true);
  });

  test('wheelStrategy preserves SGR 64 and 65', () => {
    expect(a.wheelStrategy.passThrough).toBe(true);
    expect(a.wheelStrategy.buttons.sort()).toEqual([64, 65]);
  });

  test('clickStrategy requires footer confirmed', () => {
    expect(a.clickStrategy.passThrough).toBe(true);
    expect(a.clickStrategy.button).toBe(0);
    expect(a.clickStrategy.requireFooterConfirmed).toBe(true);
  });
});

describe('grok adapter strategies', () => {
  const a = getTuiAdapter('grok');

  test('detectReady reads grokTuiReadyRef.current', () => {
    const refs = { grokTuiReadyRef: { current: false } };
    expect(a.detectReady({ refs })).toBe(false);
    refs.grokTuiReadyRef.current = true;
    expect(a.detectReady({ refs })).toBe(true);
  });

  test('wheelStrategy preserves SGR 64 and 65', () => {
    expect(a.wheelStrategy.passThrough).toBe(true);
    expect(a.wheelStrategy.buttons.sort()).toEqual([64, 65]);
  });
});

describe('agent adapter strategies', () => {
  const a = getTuiAdapter('agent');

  test('detectReady reads agentTuiReadyRef.current', () => {
    const refs = { agentTuiReadyRef: { current: false } };
    expect(a.detectReady({ refs })).toBe(false);
    refs.agentTuiReadyRef.current = true;
    expect(a.detectReady({ refs })).toBe(true);
  });

  test('wheelStrategy injects SGR+arrows instead of xterm passthrough', () => {
    expect(a.wheelStrategy.passThrough).toBe(false);
    expect(a.wheelStrategy.buttons.sort()).toEqual([64, 65]);
  });
});

describe('plain shell adapter strategies', () => {
  const a = getTuiAdapter('plain');

  test('detectReady is always false', () => {
    expect(a.detectReady({ refs: {} })).toBe(false);
  });

  test('wheelStrategy does not passthrough', () => {
    expect(a.wheelStrategy.passThrough).toBe(false);
  });

  test('clickStrategy does not passthrough', () => {
    expect(a.clickStrategy.passThrough).toBe(false);
  });
});

const { getTuiAdapter, tuiAdapterRegistry } = require('./tuiAdapter');

describe('tuiAdapter registry', () => {
  test('exports three adapters: opencode, grok, plain', () => {
    expect(Object.keys(tuiAdapterRegistry).sort()).toEqual(['grok', 'opencode', 'plain']);
  });

  test('getTuiAdapter returns distinct objects for opencode and grok', () => {
    const a = getTuiAdapter('opencode');
    const b = getTuiAdapter('grok');
    expect(a).not.toBe(b);
    expect(a.id).toBe('opencode');
    expect(b.id).toBe('grok');
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

  test('wheelStrategy is inject-only (no native passthrough) with SGR 64/65', () => {
    // First Grok panel + native passthrough = swallow; inject is the reliable path.
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

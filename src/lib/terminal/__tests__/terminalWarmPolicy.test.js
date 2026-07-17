/**
 * @jest-environment jsdom
 */

const {
  isLikelyWebKitGtk,
  resolveWarmTiers,
  scheduleTerminalWarm,
  warmTtySidecarViaApi,
  WARM_KILL_SWITCH_KEY,
} = require('../terminalWarmPolicy');

describe('terminalWarmPolicy', () => {
  test('detects WebKitGTK-like Linux UA without Chrome', () => {
    expect(isLikelyWebKitGtk('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15')).toBe(true);
    expect(
      isLikelyWebKitGtk(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
      )
    ).toBe(false);
    expect(
      isLikelyWebKitGtk(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      )
    ).toBe(false);
  });

  test('Linux WebKitGTK disables Tier3 by default; Windows enables it', () => {
    const linux = resolveWarmTiers({
      platformUa: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15',
      storage: { getItem: () => null },
    });
    expect(linux.tier1).toBe(true);
    expect(linux.tier2).toBe(true);
    expect(linux.tier3).toBe(false);
    expect(linux.tier4).toBe(false);

    const win = resolveWarmTiers({
      platformUa:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Edg/120.0.0.0',
      storage: { getItem: () => null },
    });
    expect(win.tier3).toBe(true);
  });

  test('kill-switch disables all tiers', () => {
    const tiers = resolveWarmTiers({
      storage: {
        getItem: (k) => (k === WARM_KILL_SWITCH_KEY ? 'off' : null),
      },
    });
    expect(tiers.warmOff).toBe(true);
    expect(tiers.tier1).toBe(false);
    expect(tiers.tier2).toBe(false);
    expect(tiers.tier3).toBe(false);
  });

  test('scheduleTerminalWarm soft-mounts before network work', async () => {
    const calls = [];
    const { cancel } = scheduleTerminalWarm({
      projectId: 'p1',
      cwd: '/tmp',
      tiers: { tier1: true, tier2: true, tier3: true, tier4: false, warmOff: false },
      warmSidecar: async () => {
        calls.push('sidecar');
      },
      prefetchXtermModules: async () => {
        calls.push('xterm');
      },
      prefetchState: async () => {
        calls.push('state');
      },
      softMountTerminalManager: () => {
        calls.push('soft');
      },
    });

    await new Promise((r) => setTimeout(r, 40));
    expect(calls[0]).toBe('soft');
    expect(calls[1]).toBe('state');
    expect(calls).toEqual(expect.arrayContaining(['sidecar', 'xterm']));
    cancel();
  });

  test('slow sidecar does not block warm-done beyond timeout', async () => {
    const { withTimeout, SIDECAR_WARM_TIMEOUT_MS } = require('../terminalWarmPolicy');
    const started = Date.now();
    await expect(withTimeout(new Promise(() => {}), 50, 'sidecar-warm')).rejects.toThrow(
      /timed out/
    );
    expect(Date.now() - started).toBeLessThan(200);
    expect(SIDECAR_WARM_TIMEOUT_MS).toBe(2000);
  });

  test('slow xterm prefetch does not block warm-done', async () => {
    const {
      getPerfSnapshot,
      resetStartupPerfForTests,
      STARTUP_PERF_MARKS,
    } = require('../startupPerfMarks');
    resetStartupPerfForTests();
    window.localStorage.setItem('devhub_perf', '1');

    const { cancel } = scheduleTerminalWarm({
      projectId: 'p-xterm-slow',
      cwd: '/tmp',
      tiers: { tier1: true, tier2: true, tier3: true, tier4: false, warmOff: false },
      warmSidecar: async () => {},
      prefetchState: async () => {},
      softMountTerminalManager: () => {},
      prefetchXtermModules: () => new Promise(() => {}),
      sidecarTimeoutMs: 30,
    });
    await new Promise((r) => setTimeout(r, 80));
    expect(getPerfSnapshot().marks.some((m) => m.name === STARTUP_PERF_MARKS.WARM_TIER_DONE)).toBe(
      true
    );
    cancel();
    window.localStorage.removeItem('devhub_perf');
    resetStartupPerfForTests();
  });

  test('cancel before idle prevents soft-mount', async () => {
    const calls2 = [];
    const scheduled = scheduleTerminalWarm({
      projectId: 'p2',
      tiers: { tier1: true, tier2: true, tier3: true, tier4: false, warmOff: false },
      warmSidecar: async () => {
        calls2.push('sidecar');
      },
      prefetchState: async () => {
        calls2.push('state');
      },
      softMountTerminalManager: () => {
        calls2.push('soft');
      },
    });
    scheduled.cancel();
    await new Promise((r) => setTimeout(r, 40));
    expect(calls2).toEqual([]);
  });

  test('warmTtySidecarViaApi hits GET session and caches', async () => {
    const { clearTerminalEndpointCache } = require('../terminalEndpointCache');
    clearTerminalEndpointCache();
    const fetchImpl = jest.fn(async (url, init) => {
      expect(url).toContain('/api/terminal/session');
      expect(url).toContain('cwd=');
      expect(init.method).toBe('GET');
      return { ok: true, json: async () => ({ port: 1, wsPath: '/terminal' }) };
    });
    const data = await warmTtySidecarViaApi({ cwd: '/proj', fetchImpl, timeoutMs: 0 });
    expect(data.port).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const again = await warmTtySidecarViaApi({ cwd: '/proj', fetchImpl, timeoutMs: 0 });
    expect(again.port).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

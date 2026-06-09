import {
  computeAdaptiveSnapZones,
  computeAdaptiveViewLayout,
  isCarriedWorkspaceBrowser,
  partitionSurfacesForAutoLayout,
} from '../pizarraViewLayout';

describe('pizarra adaptive layout', () => {
  test('two terminals without browser use full width side by side', () => {
    const surfaces = [
      { id: 't1', type: 'terminal' },
      { id: 't2', type: 'terminal' },
      { id: 'b1', type: 'browser', panelId: 'browser-ws1', pizarra: { x: null } },
    ];

    const { layouts, hiddenBrowserIds } = computeAdaptiveViewLayout({ x: 0, y: 0 }, surfaces);
    expect(hiddenBrowserIds).toContain('b1');
    expect(layouts).toHaveLength(2);
    expect(layouts.map((l) => l.id).sort()).toEqual(['t1', 't2']);
    const totalWidth = layouts[0].width + layouts[1].width;
    expect(totalWidth).toBeGreaterThan(1200);
  });

  test('one browser and one terminal gives browser ~58% of combined width', () => {
    const surfaces = [
      { id: 'b1', type: 'browser', panelId: 'pizarra-browser-1' },
      { id: 't1', type: 'terminal' },
    ];

    const { layouts } = computeAdaptiveViewLayout({ x: 0, y: 0 }, surfaces);
    const browser = layouts.find((l) => l.id === 'b1');
    const terminal = layouts.find((l) => l.id === 't1');
    const ratio = browser.width / (browser.width + terminal.width);
    expect(ratio).toBeGreaterThan(0.53);
    expect(ratio).toBeLessThan(0.63);
    expect(browser.x).toBeLessThan(terminal.x);
  });

  test('one browser and two terminals uses browser left and stacked terminals right', () => {
    const surfaces = [
      { id: 'b1', type: 'browser', panelId: 'pizarra-browser-1', pizarra: { x: 100 } },
      { id: 't1', type: 'terminal' },
      { id: 't2', type: 'terminal' },
    ];

    const { layouts } = computeAdaptiveViewLayout({ x: 0, y: 0 }, surfaces);
    expect(layouts).toHaveLength(3);
    const browser = layouts.find((l) => l.id === 'b1');
    const t1 = layouts.find((l) => l.id === 't1');
    const t2 = layouts.find((l) => l.id === 't2');
    expect(browser.x).toBeLessThan(t1.x);
    expect(t1.y).toBeLessThan(t2.y);
  });

  test('partitionSurfacesForAutoLayout excludes carried browser with 2+ terminals', () => {
    const surfaces = [
      { id: 'b1', type: 'browser', panelId: 'browser-ws1', pizarra: {} },
      { id: 't1', type: 'terminal' },
      { id: 't2', type: 'terminal' },
    ];
    const { browsers, hiddenBrowsers } = partitionSurfacesForAutoLayout(surfaces);
    expect(browsers).toHaveLength(0);
    expect(hiddenBrowsers).toHaveLength(1);
    expect(isCarriedWorkspaceBrowser(surfaces[0])).toBe(true);
  });

  test('computeAdaptiveSnapZones creates two equal slots for two terminals', () => {
    const surfaces = [
      { id: 't1', type: 'terminal' },
      { id: 't2', type: 'terminal' },
    ];
    const zones = computeAdaptiveSnapZones({ x: 0, y: 0 }, surfaces);
    expect(zones.slots).toHaveLength(2);
    expect(zones.slots[0].label).toBe('Terminal');
    expect(zones.slots[1].label).toBe('Terminal');
    const w0 = zones.slots[0].rect.width;
    const w1 = zones.slots[1].rect.width;
    expect(Math.abs(w0 - w1)).toBeLessThan(40);
  });

  test('user-placed carried browser stays in layout', () => {
    const surfaces = [
      { id: 'b1', type: 'browser', panelId: 'browser-ws1', pizarra: { x: 200, userPlaced: true } },
      { id: 't1', type: 'terminal' },
      { id: 't2', type: 'terminal' },
    ];
    const { browsers } = partitionSurfacesForAutoLayout(surfaces);
    expect(browsers).toHaveLength(1);
  });

  test('auto-positioned carried browser is excluded with two terminals', () => {
    const surfaces = [
      { id: 'b1', type: 'browser', panelId: 'browser-ws1', pizarra: { x: 40, y: 20 } },
      { id: 't1', type: 'terminal' },
      { id: 't2', type: 'terminal' },
    ];
    const { browsers, hiddenBrowsers } = partitionSurfacesForAutoLayout(surfaces);
    expect(browsers).toHaveLength(0);
    expect(hiddenBrowsers).toHaveLength(1);
  });
});

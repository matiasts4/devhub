// SharedTerminalSurface pulls TerminalTTY → static xterm; mock for Node.
jest.mock('xterm', () => ({ Terminal: class Terminal {} }), { virtual: true });
jest.mock('xterm-addon-fit', () => ({ FitAddon: class FitAddon {} }), { virtual: true });
jest.mock('xterm-addon-search', () => ({ SearchAddon: class SearchAddon {} }), {
  virtual: true,
});
jest.mock('@/components/TerminalTTY', () => () => null);

const {
  resolveSharedTerminalVisibility,
  PIZARRA_SHARED_SURFACE_HOST,
  WORKSPACE_SHARED_SURFACE_HOST,
  sharedTerminalSurfacePropsDataEqual,
} = require('../SharedTerminalSurface');

describe('resolveSharedTerminalVisibility (A.2 portal-hidden GPU release)', () => {
  test('returns false when base layout visibility is false', () => {
    expect(
      resolveSharedTerminalVisibility({
        pizarraOwnsLiveSurfaces: false,
        hostSurface: WORKSPACE_SHARED_SURFACE_HOST,
        isVisibleInLayout: false,
        hasActiveProjection: true,
      })
    ).toBe(false);
  });

  test('returns false when there is no active portal projection target', () => {
    expect(
      resolveSharedTerminalVisibility({
        pizarraOwnsLiveSurfaces: false,
        hostSurface: WORKSPACE_SHARED_SURFACE_HOST,
        isVisibleInLayout: true,
        hasActiveProjection: false,
      })
    ).toBe(false);
  });

  test('workspace host is visible when workspace owns live surfaces', () => {
    expect(
      resolveSharedTerminalVisibility({
        pizarraOwnsLiveSurfaces: false,
        hostSurface: WORKSPACE_SHARED_SURFACE_HOST,
        isVisibleInLayout: true,
        hasActiveProjection: true,
      })
    ).toBe(true);
  });

  test('workspace host is portal-hidden when pizarra owns live surfaces', () => {
    expect(
      resolveSharedTerminalVisibility({
        pizarraOwnsLiveSurfaces: true,
        hostSurface: WORKSPACE_SHARED_SURFACE_HOST,
        isVisibleInLayout: true,
        hasActiveProjection: true,
      })
    ).toBe(false);
  });

  test('pizarra host is visible when pizarra owns live surfaces', () => {
    expect(
      resolveSharedTerminalVisibility({
        pizarraOwnsLiveSurfaces: true,
        hostSurface: PIZARRA_SHARED_SURFACE_HOST,
        isVisibleInLayout: true,
        hasActiveProjection: true,
      })
    ).toBe(true);
  });

  test('pizarra host is portal-hidden when workspace owns live surfaces', () => {
    expect(
      resolveSharedTerminalVisibility({
        pizarraOwnsLiveSurfaces: false,
        hostSurface: PIZARRA_SHARED_SURFACE_HOST,
        isVisibleInLayout: true,
        hasActiveProjection: true,
      })
    ).toBe(false);
  });

  test('defaults to visible when hostSurface is omitted and layout is visible', () => {
    expect(
      resolveSharedTerminalVisibility({
        isVisibleInLayout: true,
        hasActiveProjection: true,
      })
    ).toBe(true);
  });

  test('preferredHostId workspace-dock wins over stale pizarra hostSurface props', () => {
    expect(
      resolveSharedTerminalVisibility({
        pizarraOwnsLiveSurfaces: true,
        hostSurface: PIZARRA_SHARED_SURFACE_HOST,
        isVisibleInLayout: true,
        hasActiveProjection: true,
        preferredHostId: 'workspace-dock',
      })
    ).toBe(true);
  });
});

describe('resolveSharedTerminalVisibility — host switch GPU release path (A2.1)', () => {
  const base = {
    isVisibleInLayout: true,
    hasActiveProjection: true,
  };

  test('workspace host isVisibleInLayout goes true → false → true on round-trip toggle', () => {
    let visible = resolveSharedTerminalVisibility({
      ...base,
      pizarraOwnsLiveSurfaces: false,
      hostSurface: WORKSPACE_SHARED_SURFACE_HOST,
    });
    expect(visible).toBe(true);

    visible = resolveSharedTerminalVisibility({
      ...base,
      pizarraOwnsLiveSurfaces: true,
      hostSurface: WORKSPACE_SHARED_SURFACE_HOST,
    });
    expect(visible).toBe(false);

    visible = resolveSharedTerminalVisibility({
      ...base,
      pizarraOwnsLiveSurfaces: false,
      hostSurface: WORKSPACE_SHARED_SURFACE_HOST,
    });
    expect(visible).toBe(true);
  });

  test('pizarra host isVisibleInLayout goes false → true → false on round-trip toggle', () => {
    let visible = resolveSharedTerminalVisibility({
      ...base,
      pizarraOwnsLiveSurfaces: false,
      hostSurface: PIZARRA_SHARED_SURFACE_HOST,
    });
    expect(visible).toBe(false);

    visible = resolveSharedTerminalVisibility({
      ...base,
      pizarraOwnsLiveSurfaces: true,
      hostSurface: PIZARRA_SHARED_SURFACE_HOST,
    });
    expect(visible).toBe(true);

    visible = resolveSharedTerminalVisibility({
      ...base,
      pizarraOwnsLiveSurfaces: false,
      hostSurface: PIZARRA_SHARED_SURFACE_HOST,
    });
    expect(visible).toBe(false);
  });

  test('5x workspace↔pizarra toggles: exactly one host visible at a time', () => {
    let pizarraOwns = false;

    for (let i = 0; i < 5; i += 1) {
      pizarraOwns = !pizarraOwns;

      const workspaceVisible = resolveSharedTerminalVisibility({
        ...base,
        pizarraOwnsLiveSurfaces: pizarraOwns,
        hostSurface: WORKSPACE_SHARED_SURFACE_HOST,
      });
      const pizarraVisible = resolveSharedTerminalVisibility({
        ...base,
        pizarraOwnsLiveSurfaces: pizarraOwns,
        hostSurface: PIZARRA_SHARED_SURFACE_HOST,
      });

      expect(workspaceVisible).toBe(!pizarraOwns);
      expect(pizarraVisible).toBe(pizarraOwns);
      expect(workspaceVisible !== pizarraVisible).toBe(true);
    }
  });
});

describe('sharedTerminalSurfacePropsDataEqual', () => {
  const base = {
    id: 'p1',
    cwd: '/tmp',
    autoFocus: true,
    isActivePanel: true,
    isVisibleInLayout: true,
    surfaceHost: 'workspace',
    pizarraOwnsLiveSurfaces: false,
    onActivatePanel: () => {},
  };

  test('returns true when only callback refs differ', () => {
    expect(
      sharedTerminalSurfacePropsDataEqual(base, {
        ...base,
        onActivatePanel: () => {},
        onResetRendererToXterm: () => {},
      })
    ).toBe(true);
  });

  test('returns false when a data field changes', () => {
    expect(sharedTerminalSurfacePropsDataEqual(base, { ...base, autoFocus: false })).toBe(false);
  });

  test('returns true when swarmContext values match by structure', () => {
    expect(
      sharedTerminalSurfacePropsDataEqual(
        { ...base, swarmContext: { role: 'a', n: 1 } },
        { ...base, swarmContext: { role: 'a', n: 1 } }
      )
    ).toBe(true);
  });
});

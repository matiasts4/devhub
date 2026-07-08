/**
 * Eager-load xterm + common addons so the first panel open does not pay the
 * dynamic-import cost on the critical path ("Iniciando terminal...").
 *
 * Safe to call multiple times — modules are cached by the bundler after the
 * first import; this module also memoizes the Promise.
 *
 * Never statically import `xterm` from SSR-reachable modules: xterm touches
 * `self` at load time and throws "self is not defined" under Next SSR.
 */

let preloadPromise = null;

export function preloadXtermRuntime() {
  if (preloadPromise) return preloadPromise;

  if (typeof window === 'undefined') {
    preloadPromise = Promise.resolve(null);
    return preloadPromise;
  }

  preloadPromise = Promise.all([
    import('xterm'),
    import('xterm-addon-fit'),
    import('xterm-addon-search'),
    import('xterm-addon-webgl').catch(() => null),
    import('xterm-addon-canvas').catch(() => null),
    import('xterm-addon-serialize').catch(() => null),
  ]).then(
    ([xtermMod, fitMod, searchMod, webglMod, canvasMod, serializeMod]) => ({
      Terminal: xtermMod.Terminal,
      FitAddon: fitMod.FitAddon,
      SearchAddon: searchMod.SearchAddon,
      WebglAddon: webglMod?.WebglAddon || null,
      CanvasAddon: canvasMod?.CanvasAddon || null,
      SerializeAddon: serializeMod?.SerializeAddon || null,
    }),
    (err) => {
      // Keep the rejected/null outcome cached so concurrent callers share it;
      // a later boot can still dynamic-import directly.
      console.warn('[xterm-preload] failed', err?.message || err);
      return null;
    }
  );

  return preloadPromise;
}

/** Resolve core constructors for boot; falls back to direct dynamic import. */
export async function loadXtermCore() {
  const preloaded = await preloadXtermRuntime();
  if (preloaded?.Terminal && preloaded?.FitAddon && preloaded?.SearchAddon) {
    return {
      Terminal: preloaded.Terminal,
      FitAddon: preloaded.FitAddon,
      SearchAddon: preloaded.SearchAddon,
    };
  }

  if (typeof window === 'undefined') {
    throw new Error('xterm-unavailable-ssr');
  }

  const [xtermMod, fitMod, searchMod] = await Promise.all([
    import('xterm'),
    import('xterm-addon-fit'),
    import('xterm-addon-search'),
  ]);
  return {
    Terminal: xtermMod.Terminal,
    FitAddon: fitMod.FitAddon,
    SearchAddon: searchMod.SearchAddon,
  };
}

/** Test-only: clear memoized promise between unit tests. */
export function __resetXtermRuntimePreloadForTests() {
  preloadPromise = null;
}

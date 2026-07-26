/**
 * prewarmGpuAddons — fire-and-forget module pre-warm for terminal GPU addons.
 *
 * Called once during the app's loading shell (before <App /> renders) so the
 * dynamic import() chunks for @xterm/addon-webgl and @xterm/addon-canvas are
 * already in the module cache by the time the first terminal requests them.
 * This eliminates the cold-start network/parse cost (~200-800 ms) from the
 * terminal's critical path without blocking first paint.
 *
 * Usage (page.js or App.js):
 *   import { prewarmGpuAddons } from '@/lib/terminal/prewarmGpuAddons';
 *   useEffect(() => { prewarmGpuAddons(); }, []);
 */

let warmed = false;

export function prewarmGpuAddons() {
  if (warmed || typeof window === 'undefined') return;
  warmed = true;

  const doImport = () => {
    // Fire-and-forget: populate the webpack/turbopack chunk cache.
    // Errors are irrelevant — the real import in useTerminalRendererController
    // will retry and handle failures properly.
    import('@xterm/addon-webgl').catch(() => {});
    import('@xterm/addon-canvas').catch(() => {});
  };

  // Prefer idle callback so we don't compete with React hydration / LCP.
  const ric = globalThis.requestIdleCallback;
  if (typeof ric === 'function') {
    ric(doImport, { timeout: 3000 });
  } else {
    // Safari fallback: short delay past initial render burst.
    setTimeout(doImport, 800);
  }
}

'use client';

/**
 * Resolve the running app version.
 *
 * Truth order:
 *  1. Electron host (`desktop_ping` → app.getVersion()) — always matches the
 *     installed/updated binary, even when the build used a one-off
 *     `-c.extraMetadata.version` bump that the bundled SPA doesn't know about.
 *  2. NEXT_PUBLIC_APP_VERSION (inlined from package.json at Next build time).
 *  3. 'dev' as last resort.
 *
 * Cached after first resolution — the version cannot change within a session.
 */

let cachedVersionPromise = null;

export function getAppVersion() {
  if (cachedVersionPromise) return cachedVersionPromise;

  cachedVersionPromise = (async () => {
    try {
      if (typeof window !== 'undefined' && window.devhubDesktop?.isElectron) {
        const res = await window.devhubDesktop.invoke('desktop_ping');
        if (res && typeof res.version === 'string' && res.version) {
          return res.version;
        }
      }
    } catch {
      /* fall through to build-time version */
    }
    return process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
  })();

  return cachedVersionPromise;
}

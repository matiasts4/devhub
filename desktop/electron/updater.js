'use strict';

/**
 * Auto-update controller for the DevHub Electron host (electron-updater, NSIS).
 *
 * - Packaged builds only by default; DEVHUB_UPDATE_FORCE=1 opts in elsewhere.
 * - Feed URL defaults to the one baked into resources/app-update.yml at build
 *   time (see electron-builder.yml `publish`); DEVHUB_UPDATE_URL overrides it
 *   at runtime so a single installer can point at any generic feed.
 * - Updates download in the background and install in place on restart —
 *   userData (%APPDATA%/DevHub) is never touched by the NSIS updater.
 * - fail-open: if electron-updater is missing or the feed is unreachable, the
 *   app keeps running normally and only logs.
 */

const LOG_PREFIX = '[DevHub Updater]';

/** Delay after boot before the first automatic check (ms). */
const AUTO_CHECK_DELAY_MS = 5000;

/** Interval between background re-checks while the app stays open (ms). */
const AUTO_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/** Signal file (inside userData) that build scripts touch to force a check. */
const SIGNAL_FILE_NAME = 'update-check.signal';

/** Poll interval for the signal file watcher (ms). */
const SIGNAL_POLL_INTERVAL_MS = 2000;

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

function warn(...args) {
  console.warn(LOG_PREFIX, ...args);
}

/**
 * Create an update controller around an electron-updater-compatible instance.
 * Injectable so tests can drive the event surface without Electron.
 *
 * @param {{
 *   autoUpdater: import('electron-updater').AppUpdater,
 *   sendEvent?: (payload: object) => void,
 *   env?: NodeJS.ProcessEnv,
 *   setTimeoutFn?: typeof setTimeout,
 *   setIntervalFn?: typeof setInterval,
 *   clearIntervalFn?: typeof clearInterval,
 *   logger?: { log: (...a: any[]) => void, warn: (...a: any[]) => void },
 * }} deps
 */
function createUpdaterController(deps) {
  const {
    autoUpdater,
    sendEvent = () => {},
    env = process.env,
    setTimeoutFn = setTimeout,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    logger = { log, warn },
  } = deps;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const feedUrl = env.DEVHUB_UPDATE_URL;
  if (feedUrl) {
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
    logger.log('feed override (DEVHUB_UPDATE_URL):', feedUrl);
  }

  let lastLoggedPercent = -1;
  let downloaded = false;
  let downloadedVersion = null;

  autoUpdater.on('checking-for-update', () => {
    logger.log('checking for update…');
  });

  autoUpdater.on('update-available', (info) => {
    logger.log('update available:', info?.version || '(unknown version)');
  });

  autoUpdater.on('update-not-available', (info) => {
    logger.log('up to date:', info?.version || '');
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.floor(progress?.percent || 0);
    // Throttle: log every ~10%.
    if (percent >= lastLoggedPercent + 10 || percent === 100) {
      lastLoggedPercent = percent - (percent % 10);
      logger.log(`download progress: ${percent}%`);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    downloaded = true;
    downloadedVersion = info?.version || null;
    logger.log('update downloaded:', downloadedVersion || '');
    // Announce to the SPA (UpdatePill). If nobody restarts from the UI, the
    // update still applies on next quit via autoInstallOnAppQuit.
    try {
      sendEvent({ type: 'update-downloaded', version: downloadedVersion });
    } catch (err) {
      warn('failed to notify renderer; update installs on next quit:', err?.message || err);
    }
  });

  autoUpdater.on('error', (err) => {
    // Fail-open: unreachable feed, unsigned build warnings, etc. must never
    // break the app. The next scheduled/manual check retries.
    logger.warn('update error (ignored):', err?.message || err);
  });

  function checkNow() {
    return autoUpdater.checkForUpdates().catch((err) => {
      logger.warn('manual check failed:', err?.message || err);
      return null;
    });
  }

  function scheduleAutoCheck(delayMs = AUTO_CHECK_DELAY_MS, intervalMs = AUTO_CHECK_INTERVAL_MS) {
    setTimeoutFn(() => {
      if (!downloaded) checkNow();
    }, delayMs);
    // Long-running sessions keep polling so the UpdatePill shows up without
    // any manual "Check for updates". Stops once a download completed.
    const interval = setIntervalFn(() => {
      if (downloaded) {
        clearIntervalFn(interval);
        return;
      }
      checkNow();
    }, intervalMs);
    if (typeof interval?.unref === 'function') interval.unref();
  }

  return {
    checkNow,
    scheduleAutoCheck,
    /** @returns {boolean} whether an update finished downloading */
    isUpdateDownloaded: () => downloaded,
    /** @returns {{ downloaded: boolean, version: string | null }} */
    getStatus: () => ({ downloaded, version: downloadedVersion }),
    /** Quit, apply the update silently (no NSIS wizard) and relaunch. */
    installNow: () => {
      logger.log('installing now (quitAndInstall silent+relaunch)');
      autoUpdater.quitAndInstall(true, true);
    },
  };
}

/**
 * Watch a signal file and trigger `onSignal` whenever its mtime changes.
 * Build scripts touch this file (`pnpm electron:update-ping`) so a running app
 * detects a fresh update immediately instead of waiting for the periodic check.
 * Fail-open: any watcher error is logged and the app keeps running.
 *
 * @param {{
 *   signalPath: string,
 *   onSignal: () => void,
 *   fsModule?: typeof import('fs'),
 *   intervalMs?: number,
 *   logger?: { log: (...a: any[]) => void, warn: (...a: any[]) => void },
 * }} opts
 * @returns {() => void} stop function
 */
function watchUpdateSignal(opts) {
  const {
    signalPath,
    onSignal,
    fsModule = require('fs'),
    intervalMs = SIGNAL_POLL_INTERVAL_MS,
    logger = { log, warn },
  } = opts;

  const listener = (curr, prev) => {
    // fs.watchFile fires with zeroed stats while the file does not exist;
    // only a real mtime change (creation or touch) should trigger a check.
    if (!curr || curr.mtimeMs === prev?.mtimeMs || curr.mtimeMs === 0) return;
    logger.log('update signal received:', signalPath);
    try {
      onSignal();
    } catch (err) {
      logger.warn('signal-triggered check failed (ignored):', err?.message || err);
    }
  };

  try {
    fsModule.watchFile(signalPath, { interval: intervalMs }, listener);
    logger.log('watching update signal:', signalPath);
  } catch (err) {
    logger.warn('signal watcher unavailable (ignored):', err?.message || err);
    return () => {};
  }

  return () => {
    try {
      fsModule.unwatchFile(signalPath, listener);
    } catch {
      /* ignore */
    }
  };
}

/**
 * Wire auto-update into the live Electron app. Safe no-op outside packaged
 * builds (unless DEVHUB_UPDATE_FORCE=1) or when electron-updater is absent.
 *
 * @param {{ sendEvent?: (payload: object) => void }} opts
 * @returns {ReturnType<typeof createUpdaterController> | null}
 */
function initAutoUpdater(opts = {}) {
  const { app } = require('electron');

  const forced = process.env.DEVHUB_UPDATE_FORCE === '1';
  if (!app.isPackaged && !forced) {
    log('skipped (not packaged; set DEVHUB_UPDATE_FORCE=1 to override)');
    return null;
  }

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    warn('electron-updater not available; auto-update disabled:', err?.message || err);
    return null;
  }

  const controller = createUpdaterController({
    autoUpdater,
    sendEvent: opts.sendEvent,
  });
  controller.scheduleAutoCheck();

  try {
    const path = require('path');
    const signalPath = path.join(app.getPath('userData'), SIGNAL_FILE_NAME);
    watchUpdateSignal({ signalPath, onSignal: () => controller.checkNow() });
  } catch (err) {
    warn('signal watcher setup failed (ignored):', err?.message || err);
  }

  return controller;
}

module.exports = {
  createUpdaterController,
  initAutoUpdater,
  watchUpdateSignal,
  AUTO_CHECK_DELAY_MS,
  AUTO_CHECK_INTERVAL_MS,
  SIGNAL_FILE_NAME,
  SIGNAL_POLL_INTERVAL_MS,
};

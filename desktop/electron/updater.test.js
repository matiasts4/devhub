'use strict';

/**
 * Unit tests for desktop/electron/updater.js — createUpdaterController with an
 * injected electron-updater-compatible mock (no Electron runtime required).
 */

const { createUpdaterController, watchUpdateSignal, AUTO_CHECK_DELAY_MS } = require('./updater');

function createMockAutoUpdater() {
  const handlers = {};
  return {
    autoDownload: undefined,
    autoInstallOnAppQuit: undefined,
    feedURL: null,
    quitAndInstallCalls: 0,
    checkForUpdatesCalls: 0,
    on(event, fn) {
      handlers[event] = fn;
      return this;
    },
    emit(event, payload) {
      if (handlers[event]) return handlers[event](payload);
      return undefined;
    },
    setFeedURL(url) {
      this.feedURL = url;
    },
    quitAndInstall(...args) {
      this.quitAndInstallCalls += 1;
      this.quitAndInstallArgs = args;
    },
    checkForUpdates() {
      this.checkForUpdatesCalls += 1;
      return Promise.resolve({ updateInfo: { version: '9.9.9' } });
    },
  };
}

function createLogger() {
  const logs = [];
  const warns = [];
  return {
    logs,
    warns,
    log: (...a) => logs.push(a.join(' ')),
    warn: (...a) => warns.push(a.join(' ')),
  };
}

describe('createUpdaterController', () => {
  test('configures autoDownload/autoInstallOnAppQuit and wires events', () => {
    const autoUpdater = createMockAutoUpdater();
    createUpdaterController({ autoUpdater, env: {} });
    expect(autoUpdater.autoDownload).toBe(true);
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  test('applies DEVHUB_UPDATE_URL via setFeedURL', () => {
    const autoUpdater = createMockAutoUpdater();
    const logger = createLogger();
    createUpdaterController({
      autoUpdater,
      env: { DEVHUB_UPDATE_URL: 'http://127.0.0.1:9100/devhub' },
      logger,
    });
    expect(autoUpdater.feedURL).toEqual({
      provider: 'generic',
      url: 'http://127.0.0.1:9100/devhub',
    });
  });

  test('does not set a feed URL without the env override', () => {
    const autoUpdater = createMockAutoUpdater();
    createUpdaterController({ autoUpdater, env: {} });
    expect(autoUpdater.feedURL).toBeNull();
  });

  test('update-downloaded emits a renderer event instead of a native dialog', () => {
    const autoUpdater = createMockAutoUpdater();
    const events = [];
    const controller = createUpdaterController({
      autoUpdater,
      sendEvent: (p) => events.push(p),
      env: {},
    });
    autoUpdater.emit('update-downloaded', { version: '0.1.4' });
    expect(events).toEqual([{ type: 'update-downloaded', version: '0.1.4' }]);
    expect(autoUpdater.quitAndInstallCalls).toBe(0);
    expect(controller.isUpdateDownloaded()).toBe(true);
    expect(controller.getStatus()).toEqual({ downloaded: true, version: '0.1.4' });
  });

  test('installNow calls quitAndInstall; sendEvent failures never throw', () => {
    const autoUpdater = createMockAutoUpdater();
    const controller = createUpdaterController({
      autoUpdater,
      sendEvent: () => {
        throw new Error('window gone');
      },
      env: {},
    });
    expect(() => autoUpdater.emit('update-downloaded', { version: '0.1.4' })).not.toThrow();
    controller.installNow();
    expect(autoUpdater.quitAndInstallCalls).toBe(1);
    expect(autoUpdater.quitAndInstallArgs).toEqual([true, true]);
  });

  test('getStatus reports not-downloaded before any update event', () => {
    const autoUpdater = createMockAutoUpdater();
    const controller = createUpdaterController({ autoUpdater, env: {} });
    expect(controller.getStatus()).toEqual({ downloaded: false, version: null });
  });

  test('error events are logged, never thrown', () => {
    const autoUpdater = createMockAutoUpdater();
    const logger = createLogger();
    createUpdaterController({ autoUpdater, env: {}, logger });
    expect(() => autoUpdater.emit('error', new Error('feed unreachable'))).not.toThrow();
    expect(logger.warns.some((line) => line.includes('feed unreachable'))).toBe(true);
  });

  test('checkNow swallows check failures and reports them', async () => {
    const autoUpdater = createMockAutoUpdater();
    autoUpdater.checkForUpdates = () => Promise.reject(new Error('offline'));
    const logger = createLogger();
    const controller = createUpdaterController({ autoUpdater, env: {}, logger });
    await expect(controller.checkNow()).resolves.toBeNull();
    expect(logger.warns.some((line) => line.includes('offline'))).toBe(true);
  });

  test('scheduleAutoCheck triggers a check after the delay', () => {
    const autoUpdater = createMockAutoUpdater();
    const timers = [];
    const controller = createUpdaterController({
      autoUpdater,
      env: {},
      setTimeoutFn: (fn, ms) => timers.push({ fn, ms }),
      setIntervalFn: () => ({}),
      clearIntervalFn: () => {},
    });
    controller.scheduleAutoCheck();
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(AUTO_CHECK_DELAY_MS);
    timers[0].fn();
    expect(autoUpdater.checkForUpdatesCalls).toBe(1);
  });

  test('scheduleAutoCheck re-checks periodically and stops after download', () => {
    const autoUpdater = createMockAutoUpdater();
    const intervals = [];
    let cleared = null;
    const controller = createUpdaterController({
      autoUpdater,
      env: {},
      setTimeoutFn: () => {},
      setIntervalFn: (fn, ms) => {
        const handle = { fn, ms };
        intervals.push(handle);
        return handle;
      },
      clearIntervalFn: (handle) => {
        cleared = handle;
      },
    });
    controller.scheduleAutoCheck();
    expect(intervals).toHaveLength(1);
    expect(intervals[0].ms).toBe(30 * 60 * 1000);

    intervals[0].fn();
    intervals[0].fn();
    expect(autoUpdater.checkForUpdatesCalls).toBe(2);

    autoUpdater.emit('update-downloaded', { version: '0.1.5' });
    intervals[0].fn();
    expect(autoUpdater.checkForUpdatesCalls).toBe(2);
    expect(cleared).toBe(intervals[0]);
  });
});

describe('watchUpdateSignal', () => {
  function createMockFs() {
    const watchers = {};
    return {
      watchers,
      watchFile(file, opts, listener) {
        watchers[file] = { opts, listener };
      },
      unwatchFile(file) {
        delete watchers[file];
      },
    };
  }

  test('triggers onSignal when the signal file mtime changes', () => {
    const fsModule = createMockFs();
    let signals = 0;
    watchUpdateSignal({
      signalPath: 'C:/userData/update-check.signal',
      onSignal: () => signals++,
      fsModule,
      logger: createLogger(),
    });
    const { listener } = fsModule.watchers['C:/userData/update-check.signal'];
    listener({ mtimeMs: 100 }, { mtimeMs: 0 });
    expect(signals).toBe(1);
    listener({ mtimeMs: 200 }, { mtimeMs: 100 });
    expect(signals).toBe(2);
  });

  test('ignores no-op stat events (missing file / unchanged mtime)', () => {
    const fsModule = createMockFs();
    let signals = 0;
    watchUpdateSignal({
      signalPath: 'sig',
      onSignal: () => signals++,
      fsModule,
      logger: createLogger(),
    });
    const { listener } = fsModule.watchers.sig;
    listener({ mtimeMs: 0 }, { mtimeMs: 0 });
    listener({ mtimeMs: 100 }, { mtimeMs: 100 });
    listener(null, { mtimeMs: 100 });
    expect(signals).toBe(0);
  });

  test('onSignal errors are swallowed and logged', () => {
    const fsModule = createMockFs();
    const logger = createLogger();
    watchUpdateSignal({
      signalPath: 'sig',
      onSignal: () => {
        throw new Error('check exploded');
      },
      fsModule,
      logger,
    });
    const { listener } = fsModule.watchers.sig;
    expect(() => listener({ mtimeMs: 100 }, { mtimeMs: 0 })).not.toThrow();
    expect(logger.warns.some((line) => line.includes('check exploded'))).toBe(true);
  });

  test('fail-open when watchFile itself throws; returns a stop fn', () => {
    const logger = createLogger();
    const stop = watchUpdateSignal({
      signalPath: 'sig',
      onSignal: () => {},
      fsModule: {
        watchFile: () => {
          throw new Error('EPERM');
        },
      },
      logger,
    });
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
    expect(logger.warns.some((line) => line.includes('EPERM'))).toBe(true);
  });

  test('stop function unwatches the file', () => {
    const fsModule = createMockFs();
    const stop = watchUpdateSignal({
      signalPath: 'sig',
      onSignal: () => {},
      fsModule,
      logger: createLogger(),
    });
    expect(fsModule.watchers.sig).toBeDefined();
    stop();
    expect(fsModule.watchers.sig).toBeUndefined();
  });
});

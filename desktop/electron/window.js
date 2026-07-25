'use strict';

/**
 * Main host: BaseWindow + SPA WebContentsView with webviewTag enabled.
 *
 * Dock browser host model:
 *   - Browser is a Chromium <webview> *inside* the SPA DOM (not a sibling view).
 *   - Workspace/tab switch = React mount/unmount (CSS layout), no second OS layer.
 *   - webviewTag: true is required on the SPA WebContentsView.
 */

const path = require('path');
const { BaseWindow, WebContentsView, Menu } = require('electron');
const { loadWindowState, attachWindowLifecycle } = require('./windowState');

function resolvePreloadPath() {
  return path.join(__dirname, 'preload.js');
}

function resolveSplashPath() {
  return path.join(__dirname, 'splash.html');
}

// SPA load retry policy: the UI server (Next dev :3100 / standalone :3400)
// may still be booting when the window is created — retry connection failures
// instead of dying on an error page. Budget covers cold dev compiles.
const SPA_LOAD_RETRY_DELAY_MS = 400;
const SPA_LOAD_RETRY_BUDGET_MS = 120000;

function resolveUiUrl() {
  if (process.env.DEVHUB_ELECTRON_URL || process.env.DEVHUB_UI_URL) {
    return process.env.DEVHUB_ELECTRON_URL || process.env.DEVHUB_UI_URL;
  }
  try {
    const { app } = require('electron');
    if (app && app.isPackaged) {
      return 'http://127.0.0.1:3400';
    }
  } catch {
    /* ignore */
  }
  return 'http://127.0.0.1:3100';
}

function layoutSpaView(win, spaView) {
  if (!win || win.isDestroyed() || !spaView) return;
  try {
    const [width, height] = win.getContentSize();
    spaView.setBounds({
      x: 0,
      y: 0,
      width: Math.max(0, width),
      height: Math.max(0, height),
    });
  } catch (err) {
    console.warn('[DevHub Electron] layoutSpaView', err?.message || err);
  }
}

/**
 * Ensure SPA view is the bottom-most child so browser views paint above it.
 */
function ensureSpaIsBottom(win) {
  const spa = win?.__devhubSpaView;
  if (!win || win.isDestroyed() || !spa) return;
  try {
    const parent = win.contentView;
    const children = [...(parent.children || [])];
    // If SPA is already first, nothing to do (avoids thrash).
    if (children[0] === spa) {
      layoutSpaView(win, spa);
      return;
    }
    const others = children.filter((c) => c !== spa);
    try {
      parent.removeChildView(spa);
    } catch {
      /* ignore */
    }
    try {
      parent.addChildView(spa, { index: 0 });
    } catch {
      parent.addChildView(spa);
      for (const child of others) {
        try {
          parent.removeChildView(child);
          parent.addChildView(child);
        } catch {
          /* ignore */
        }
      }
    }
    layoutSpaView(win, spa);
  } catch (err) {
    console.warn('[DevHub Electron] ensureSpaIsBottom', err?.message || err);
  }
}

function createMainWindow() {
  try {
    Menu.setApplicationMenu(null);
  } catch {
    /* ignore */
  }

  const state = loadWindowState();
  const preloadPath = resolvePreloadPath();

  // Frameless host (parity with Tauri decorations:false) — SPA TitleBar / terminal
  // top-bar traffic lights own minimize / maximize / close via desktop IPC.
  const winOpts = {
    width: state.width,
    height: state.height,
    show: false,
    title: 'DevHub',
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    frame: false,
    // Keep Windows resize grips on frameless windows.
    thickFrame: true,
    // Ensure the window appears on the taskbar / Alt-Tab.
    skipTaskbar: false,
  };
  if (Number.isFinite(state.x) && Number.isFinite(state.y)) {
    winOpts.x = state.x;
    winOpts.y = state.y;
  }

  const win = new BaseWindow(winOpts);

  const spaView = new WebContentsView({
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // Enables <webview> inside the SPA for browser blocks.
      webviewTag: true,
      // webviewTag + sandbox can conflict on some Electron builds; keep sandbox off
      // for the host SPA so guest <webview> attaches reliably.
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  try {
    spaView.setBackgroundColor('#0b0f14');
  } catch {
    /* ignore */
  }

  win.contentView.addChildView(spaView);
  layoutSpaView(win, spaView);

  Object.defineProperty(win, 'webContents', {
    configurable: true,
    enumerable: true,
    get() {
      return spaView.webContents;
    },
  });

  win.__devhubSpaView = spaView;
  win.__devhubIsBaseWindowHost = true;
  win.__devhubUsesDomWebview = true;

  const onResize = () => {
    layoutSpaView(win, spaView);
  };
  win.on('resize', onResize);
  win.on('maximize', onResize);
  win.on('unmaximize', onResize);

  attachWindowLifecycle(win);

  const url = resolveUiUrl();
  console.log('[DevHub Electron] host=BaseWindow+SPA webviewTag frameless');
  console.log('[DevHub Electron] preload:', preloadPath);
  console.log('[DevHub Electron] loadURL:', url);
  console.log('[DevHub Electron] initial bounds:', {
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    isMaximized: state.isMaximized,
  });

  // Secure guest webviews .
  spaView.webContents.on('did-attach-webview', (_event, guestWc) => {
    try {
      guestWc.setWindowOpenHandler(({ url: openUrl }) => {
        try {
          const { shell } = require('electron');
          if (openUrl) shell.openExternal(openUrl);
        } catch {
          /* ignore */
        }
        return { action: 'deny' };
      });
    } catch (err) {
      console.warn('[DevHub Electron] did-attach-webview harden failed', err?.message || err);
    }
  });

  function pingUiServer(uiUrl, timeoutMs = 500) {
    return new Promise((resolve) => {
      try {
        const http = require('http');
        const u = new URL(uiUrl);
        const req = http.get(
          {
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: '/',
            timeout: timeoutMs,
          },
          (res) => {
            res.resume();
            resolve(res.statusCode >= 200 && res.statusCode < 500);
          }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
      } catch {
        resolve(false);
      }
    });
  }

  // 1) Instant splash (local file, zero server dependency) so the window
  // paints immediately even while the UI server is still booting.
  spaView.webContents.loadFile(resolveSplashPath()).catch(() => {});

  // 2) SPA load with retry & hung-load watchdog: keep splash.html rendered until
  // the UI server (Next dev :3100 / standalone :3400) is ready to accept connections.
  const spaLoadStartedAt = Date.now();
  let spaLoaded = false;
  let watchdogTimer = null;
  let pollTimer = null;
  let loadAttempt = 0;

  const checkSpaMounted = async () => {
    if (win.isDestroyed() || spaView.webContents.isDestroyed()) return false;
    try {
      const current = spaView.webContents.getURL();
      if (!current || !current.startsWith(url)) return false;
      const isMounted = await spaView.webContents.executeJavaScript(
        `Boolean((document.querySelector('#root') || document.querySelector('#__next') || document.body)?.children?.length > 0)`
      );
      return Boolean(isMounted);
    } catch {
      return false;
    }
  };

  const loadSpa = () => {
    if (spaLoaded || win.isDestroyed() || spaView.webContents.isDestroyed()) return;
    loadAttempt++;
    console.log(`[DevHub Electron] loadSpa attempt #${loadAttempt} -> ${url}`);
    spaView.webContents.loadURL(url).catch(() => {
      /* failure handled by did-fail-load or watchdog */
    });
  };

  const scheduleWatchdog = (delayMs = 8000) => {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(async () => {
      if (spaLoaded || win.isDestroyed() || spaView.webContents.isDestroyed()) return;

      const mounted = await checkSpaMounted();
      if (mounted) {
        console.log('[DevHub Electron] Watchdog: SPA verified mounted and active.');
        spaLoaded = true;
        return;
      }

      if (Date.now() - spaLoadStartedAt < SPA_LOAD_RETRY_BUDGET_MS) {
        console.warn(
          `[DevHub Electron] Watchdog: SPA load unhydrated/hung after attempt #${loadAttempt}. Retrying loadURL...`
        );
        loadSpa();
        scheduleWatchdog(8000);
      }
    }, delayMs);
  };

  const loadSpaWhenReady = async () => {
    if (spaLoaded || win.isDestroyed() || spaView.webContents.isDestroyed()) return;

    const ready = await pingUiServer(url, 400);
    if (ready) {
      loadSpa();
      scheduleWatchdog(8000);
      return;
    }

    const startPoll = Date.now();
    pollTimer = setInterval(async () => {
      if (spaLoaded || win.isDestroyed() || spaView.webContents.isDestroyed()) {
        clearInterval(pollTimer);
        return;
      }
      const isReady = await pingUiServer(url, 400);
      if (isReady) {
        clearInterval(pollTimer);
        loadSpa();
        scheduleWatchdog(8000);
      } else if (Date.now() - startPoll > 15000) {
        clearInterval(pollTimer);
        loadSpa();
        scheduleWatchdog(8000);
      }
    }, 300);
  };

  spaView.webContents.on('did-fail-load', (_e, code, desc, validatedURL, isMainFrame) => {
    console.error('[DevHub Electron] UI did-fail-load', { code, desc, validatedURL });
    if (!isMainFrame || spaLoaded) return;
    if (win.isDestroyed() || spaView.webContents.isDestroyed()) return;
    if (Date.now() - spaLoadStartedAt > SPA_LOAD_RETRY_BUDGET_MS) return;
    setTimeout(() => {
      loadSpa();
      scheduleWatchdog(6000);
    }, SPA_LOAD_RETRY_DELAY_MS);
  });

  spaView.webContents.on('did-finish-load', () => {
    const current = spaView.webContents.getURL();
    if (current && current.startsWith(url)) {
      setTimeout(async () => {
        const mounted = await checkSpaMounted();
        if (mounted) {
          console.log('[DevHub Electron] SPA did-finish-load & DOM verified mounted.');
          spaLoaded = true;
          if (watchdogTimer) clearTimeout(watchdogTimer);
          if (pollTimer) clearInterval(pollTimer);
        } else {
          console.warn(
            '[DevHub Electron] did-finish-load fired but DOM unhydrated. Watchdog queued.'
          );
          scheduleWatchdog(5000);
        }
      }, 300);
    }
  });

  loadSpaWhenReady();

  win.on('closed', () => {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    if (pollTimer) clearInterval(pollTimer);
  });

  spaView.webContents.on('did-finish-load', () => {
    spaView.webContents
      .executeJavaScript(
        `Boolean(window.devhubDesktop && window.devhubDesktop.isElectron === true)`
      )
      .then((ok) => console.log('[DevHub Electron] renderer has devhubDesktop:', ok))
      .catch(() => {});
  });

  // Dev hot-reload ergonomics (app menu is null → native accelerators would not exist).
  // SPA/Next Fast Refresh still applies for React edits while Next dev is running.
  const isDevUi =
    /localhost|127\.0\.0\.1/.test(String(url)) || process.env.NODE_ENV === 'development';
  if (isDevUi) {
    const beforeInput = (event, input) => {
      if (!spaView?.webContents || spaView.webContents.isDestroyed()) return;
      const key = String(input.key || '').toLowerCase();
      const ctrl = Boolean(input.control || input.meta);
      // Ctrl/Cmd+R or F5 → soft reload SPA (no Electron process restart)
      if ((ctrl && key === 'r' && !input.shift) || key === 'f5') {
        event.preventDefault();
        spaView.webContents.reload();
        return;
      }
      // Ctrl/Cmd+Shift+R → hard reload
      if (ctrl && input.shift && key === 'r') {
        event.preventDefault();
        spaView.webContents.reloadIgnoringCache();
        return;
      }
      // F12 → DevTools (inspect HMR / console)
      if (key === 'f12') {
        event.preventDefault();
        if (spaView.webContents.isDevToolsOpened()) {
          spaView.webContents.closeDevTools();
        } else {
          spaView.webContents.openDevTools({ mode: 'detach' });
        }
      }
    };
    spaView.webContents.on('before-input-event', beforeInput);
    win.on('closed', () => {
      try {
        spaView.webContents.removeListener('before-input-event', beforeInput);
      } catch {
        /* ignore */
      }
    });
  }

  let shown = false;
  const showOnce = (reason = 'unknown') => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    try {
      layoutSpaView(win, spaView);
      // Maximize only after first show — maximize-before-show can leave
      // frameless BaseWindow off-screen / invisible on some Windows setups.
      if (state.isMaximized) {
        try {
          win.maximize();
        } catch {
          /* ignore */
        }
      }
      win.show();
      if (typeof win.moveTop === 'function') win.moveTop();
      win.focus();
      const b = win.getBounds?.() || {};
      console.log('[DevHub Electron] window shown', {
        reason,
        bounds: b,
        maximized: win.isMaximized?.(),
      });
    } catch (err) {
      console.error('[DevHub Electron] showOnce failed', err?.message || err);
    }
  };
  spaView.webContents.once('dom-ready', () => setTimeout(() => showOnce('dom-ready'), 30));
  spaView.webContents.once('did-finish-load', () => showOnce('did-finish-load'));
  // Failsafe: never leave the process running with a hidden window.
  setTimeout(() => showOnce('timeout-800'), 800);
  setTimeout(() => showOnce('timeout-3000'), 3000);

  return win;
}

module.exports = {
  createMainWindow,
  resolveUiUrl,
  resolvePreloadPath,
  layoutSpaView,
  ensureSpaIsBottom,
};

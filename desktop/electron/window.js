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

function resolveUiUrl() {
  return process.env.DEVHUB_ELECTRON_URL || process.env.DEVHUB_UI_URL || 'http://127.0.0.1:3100';
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

  const win = new BaseWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    show: false,
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    frame: true,
  });

  const spaView = new WebContentsView({
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // Enables <webview> inside the SPA for browser blocks.
      webviewTag: true,
      // webviewTag + sandbox can conflict on some Electron builds; keep sandbox off
      // for the host SPA so guest <webview> attaches reliably .
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

  if (state.isMaximized) {
    try {
      win.maximize();
    } catch {
      /* ignore */
    }
  }

  const onResize = () => {
    layoutSpaView(win, spaView);
  };
  win.on('resize', onResize);
  win.on('maximize', onResize);
  win.on('unmaximize', onResize);

  attachWindowLifecycle(win);

  const url = resolveUiUrl();
  console.log('[DevHub Electron] host=BaseWindow+SPA webviewTag ');
  console.log('[DevHub Electron] preload:', preloadPath);
  console.log('[DevHub Electron] loadURL:', url);

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

  spaView.webContents.loadURL(url).catch((err) => {
    console.error('[DevHub Electron] Failed to load UI URL:', url, err?.message || err);
  });

  spaView.webContents.on('did-fail-load', (_e, code, desc, validatedURL) => {
    console.error('[DevHub Electron] UI did-fail-load', { code, desc, validatedURL });
  });

  spaView.webContents.on('did-finish-load', () => {
    spaView.webContents
      .executeJavaScript(
        `Boolean(window.devhubDesktop && window.devhubDesktop.isElectron === true)`
      )
      .then((ok) => console.log('[DevHub Electron] renderer has devhubDesktop:', ok))
      .catch(() => {});
  });

  let shown = false;
  const showOnce = () => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    layoutSpaView(win, spaView);
    win.show();
    win.focus();
  };
  spaView.webContents.once('dom-ready', () => setTimeout(showOnce, 30));
  spaView.webContents.once('did-finish-load', showOnce);
  setTimeout(showOnce, 4000);

  return win;
}

module.exports = {
  createMainWindow,
  resolveUiUrl,
  resolvePreloadPath,
  layoutSpaView,
  ensureSpaIsBottom,
};

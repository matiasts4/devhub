'use strict';

/**
 * Sandbox-safe preload: do NOT require local files (./channels fails under sandbox
 * and prevents contextBridge — SPA then sees no window.devhubDesktop → iframe fallback).
 */

const { contextBridge, ipcRenderer } = require('electron');

// Keep in sync with channels.js (inlined for sandbox).
const CHANNELS = {
  INVOKE: 'desktop:invoke',
  NATIVE_BROWSER_EVENT: 'desktop:native-browser:event',
  VOICE_EVENT: 'desktop:voice:event',
  WINDOW_EVENT: 'desktop:window:event',
};

contextBridge.exposeInMainWorld('devhubDesktop', {
  isElectron: true,
  platform: process.platform,

  /**
   * @param {string} command
   * @param {object} [payload]
   */
  invoke(command, payload = {}) {
    return ipcRenderer.invoke(CHANNELS.INVOKE, { command, payload });
  },

  /**
   * @param {string} eventName
   * @param {(payload: object) => void} handler
   */
  on(eventName, handler) {
    if (typeof handler !== 'function') return () => {};

    let channel = null;
    if (eventName === 'native-browser-event') {
      channel = CHANNELS.NATIVE_BROWSER_EVENT;
    } else if (eventName === 'window-event') {
      channel = CHANNELS.WINDOW_EVENT;
    } else if (eventName === 'voice-event') {
      channel = CHANNELS.VOICE_EVENT;
    }

    if (!channel) return () => {};

    const listener = (_event, payload) => {
      handler(payload);
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
});

'use strict';

/**
 * Desktop IPC command router (browser + shell + optional voice/multi-window).
 *
 * Shell commands are handled by ./shell (E1 packaging-aware).
 * Voice / multi-window soft-load from ../voice and ../multiWindow when present.
 */

const { handleShellCommand, isShellCommand } = require('./shell');
const { isNativeBrowserCommand, handleNativeBrowserCommand } = require('../browser/ipc');
const { VOICE_COMMANDS, MULTI_WINDOW_COMMANDS } = require('../channels');

/** Soft-load optional modules (other agents own voice/multiWindow). */
function tryRequire(relPath) {
  try {
    // Dynamic optional modules (voice / multiWindow may land later).
    return require(relPath);
  } catch (err) {
    if (
      err &&
      (err.code === 'MODULE_NOT_FOUND' || /Cannot find module/.test(String(err.message)))
    ) {
      return null;
    }
    console.warn(`[DevHub Electron] optional module failed: ${relPath}`, err?.message || err);
    return null;
  }
}

const voiceMod = tryRequire('../voice');
const multiWindowMod = tryRequire('../multiWindow');

/** @type {ReturnType<NonNullable<typeof voiceMod>['createVoiceHandler']> | null} */
let voiceHandler = null;
/** @type {ReturnType<NonNullable<typeof multiWindowMod>['createMultiWindowManager']> | null} */
let multiWindowManager = null;

/**
 * Initialize optional handlers once main has getMainWindow / event senders.
 * @param {{
 *   getMainWindow: () => import('electron').BrowserWindow | null,
 *   sendVoiceEvent?: (payload: object) => void,
 * }} ctx
 */
function initOptionalHandlers(ctx) {
  if (voiceMod && typeof voiceMod.createVoiceHandler === 'function') {
    voiceHandler = voiceMod.createVoiceHandler({
      getMainWindow: ctx.getMainWindow,
      sendEvent: ctx.sendVoiceEvent,
    });
  } else if (voiceMod && typeof voiceMod.handleVoiceCommand === 'function') {
    voiceHandler = {
      isVoiceCommand: (c) => Object.values(VOICE_COMMANDS).includes(c),
      handle: (c, p) => voiceMod.handleVoiceCommand(c, p, ctx),
    };
  }

  if (multiWindowMod && typeof multiWindowMod.createMultiWindowManager === 'function') {
    multiWindowManager = multiWindowMod.createMultiWindowManager({
      getMainWindow: ctx.getMainWindow,
    });
  } else if (multiWindowMod && typeof multiWindowMod.handleMultiWindowCommand === 'function') {
    multiWindowManager = {
      isMultiWindowCommand: (c) => Object.values(MULTI_WINDOW_COMMANDS).includes(c),
      handle: (c, p) => multiWindowMod.handleMultiWindowCommand(c, p, ctx),
      disposeAll: () => {},
    };
  }
}

function isVoiceCommand(command) {
  if (voiceHandler?.isVoiceCommand) return voiceHandler.isVoiceCommand(command);
  if (voiceMod?.isVoiceCommand) return voiceMod.isVoiceCommand(command);
  return Object.values(VOICE_COMMANDS).includes(command);
}

function isMultiWindowCommand(command) {
  if (multiWindowManager?.isMultiWindowCommand) {
    return multiWindowManager.isMultiWindowCommand(command);
  }
  if (multiWindowMod?.isMultiWindowCommand) return multiWindowMod.isMultiWindowCommand(command);
  return Object.values(MULTI_WINDOW_COMMANDS).includes(command);
}

/**
 * @param {object} opts
 * @param {string} opts.command
 * @param {object} [opts.payload]
 * @param {import('electron').IpcMainInvokeEvent} [opts.event]
 * @param {() => import('electron').BrowserWindow | null} opts.getMainWindow
 * @param {object | null} [opts.browserRegistry]
 */
async function routeInvoke({
  command,
  payload = {},
  event = null,
  getMainWindow,
  browserRegistry = null,
}) {
  if (!command || typeof command !== 'string') {
    return { reason: 'invalid-command' };
  }

  if (isNativeBrowserCommand(command)) {
    if (!browserRegistry) {
      return { reason: 'browser-registry-unavailable' };
    }
    return handleNativeBrowserCommand(browserRegistry, command, payload);
  }

  // E1 shell (window / clipboard / dialog / notify / runtime) — preferred path.
  if (isShellCommand(command)) {
    return handleShellCommand(command, payload, { getMainWindow, event });
  }

  if (isVoiceCommand(command)) {
    if (voiceHandler && typeof voiceHandler.handle === 'function') {
      return voiceHandler.handle(command, payload);
    }
    return { reason: 'not-implemented', command, area: 'voice' };
  }

  if (isMultiWindowCommand(command)) {
    if (multiWindowManager && typeof multiWindowManager.handle === 'function') {
      return multiWindowManager.handle(command, payload);
    }
    return { reason: 'not-implemented', command, area: 'multi-window' };
  }

  return { reason: 'not-implemented', command };
}

function disposeOptionalHandlers() {
  try {
    multiWindowManager?.disposeAll?.();
  } catch {
    // ignore
  }
  multiWindowManager = null;
  voiceHandler = null;
}

module.exports = {
  routeInvoke,
  initOptionalHandlers,
  disposeOptionalHandlers,
  isShellCommand,
  isVoiceCommand,
  isMultiWindowCommand,
  handleShellCommand,
};

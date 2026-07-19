'use strict';

/**
 * Electron voice command handlers (E3).
 *
 * Piper / Python STT sidecar is deferred on Electron — SPA falls back to
 * Web Speech for TTS. Commands return stable shapes so renderer invoke paths
 * do not throw.
 */

const { VOICE_COMMANDS } = require('./channels');

const VOICE_SET = new Set(Object.values(VOICE_COMMANDS));

const DEFERRED = { ok: false, reason: 'voice-deferred-electron' };

function isVoiceCommand(command) {
  return VOICE_SET.has(command);
}

/**
 * @param {{ getMainWindow?: () => import('electron').BrowserWindow | null, sendEvent?: (payload: object) => void }} [ctx]
 */
function createVoiceHandler(ctx = {}) {
  let enabled = false;
  let settings = null;
  let recording = false;

  // Reserved for future event fan-out (preload VOICE_EVENT channel).
  const sendEvent = typeof ctx.sendEvent === 'function' ? ctx.sendEvent : () => {};

  function handle(command, payload = {}) {
    switch (command) {
      case VOICE_COMMANDS.SET_ENABLED: {
        enabled = Boolean(payload?.enabled);
        return { ok: true, enabled };
      }
      case VOICE_COMMANDS.SET_SETTINGS: {
        settings = payload?.settings ?? payload ?? null;
        return { ok: true };
      }
      case VOICE_COMMANDS.START_ENGINE:
        // STT engine not wired on Electron yet.
        return { ...DEFERRED, command };
      case VOICE_COMMANDS.STOP_ENGINE: {
        recording = false;
        return { ok: true };
      }
      case VOICE_COMMANDS.TOGGLE_RECORDING: {
        if (!enabled) {
          return { ok: false, reason: 'voice-disabled', error: 'voice disabled' };
        }
        // No native STT sidecar — keep deferred so SPA surfaces a clear error.
        return { ...DEFERRED, command, recording };
      }
      case VOICE_COMMANDS.STOP_SPEAK: {
        // Best-effort: nothing native to stop; Web Speech cancel is renderer-side.
        return { ok: true };
      }
      case VOICE_COMMANDS.SPEAK: {
        // Prefer SPA Web Speech path (Windows OS voices). Do not spawn Piper.
        return { ...DEFERRED, command };
      }
      default:
        return { reason: 'not-implemented', command };
    }
  }

  /** @internal test/debug snapshot */
  function getState() {
    return { enabled, settings, recording };
  }

  return {
    handle,
    isVoiceCommand,
    getState,
    sendEvent,
  };
}

module.exports = {
  createVoiceHandler,
  isVoiceCommand,
  VOICE_COMMANDS,
  DEFERRED,
};

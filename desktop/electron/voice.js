'use strict';

/**
 * Electron voice command handlers (E3).
 *
 * TTS speaks through the Piper sidecar (`packages/veloce-audio/python/tts_engine.py`)
 * with `play: false` — Windows has no paplay/aplay, so the renderer plays the
 * `tts-chunk` wav itself. STT stays deferred; SPA falls back to Web Speech when
 * the runtime is missing. Commands return stable shapes so renderer invoke
 * paths do not throw.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const { VOICE_COMMANDS } = require('./channels');

const VOICE_SET = new Set(Object.values(VOICE_COMMANDS));

const DEFERRED = { ok: false, reason: 'voice-deferred-electron' };

const REPO_ROOT = path.join(__dirname, '..', '..');
const TTS_SCRIPT = path.join(REPO_ROOT, 'packages', 'veloce-audio', 'python', 'tts_engine.py');
const VENV_PYTHON = path.join(
  REPO_ROOT,
  'packages',
  'veloce-audio',
  'python',
  '.venv',
  process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'python.exe' : 'python'
);

function resolvePython() {
  return fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python';
}

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
  let ttsChild = null;

  // Reserved for future event fan-out (preload VOICE_EVENT channel).
  const sendEvent = typeof ctx.sendEvent === 'function' ? ctx.sendEvent : () => {};

  function killTtsChild() {
    if (!ttsChild) return;
    try {
      ttsChild.kill();
    } catch {
      /* already exited */
    }
    ttsChild = null;
  }

  function handleSpeak(payload = {}) {
    if (!fs.existsSync(TTS_SCRIPT)) {
      // Renderer keeps the Web Speech fallback when the runtime is absent.
      return Promise.resolve({ ok: false, reason: 'voice-tts-script-missing' });
    }

    killTtsChild();

    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(resolvePython(), [TTS_SCRIPT], { windowsHide: true });
      } catch (error) {
        resolve({
          ok: false,
          reason: 'voice-tts-spawn-failed',
          error: String(error?.message || error),
        });
        return;
      }

      ttsChild = child;
      let settled = false;
      let sawErrorEvent = false;
      let stdoutBuffer = '';
      let stderrBuffer = '';

      const failSpawn = (error) => {
        if (settled) return;
        settled = true;
        resolve({
          ok: false,
          reason: 'voice-tts-spawn-failed',
          error: String(error?.message || error),
        });
      };

      child.on('error', (error) => {
        failSpawn(error);
      });

      child.on('spawn', () => {
        const speakLine = {
          text: String(payload?.text || ''),
          options: { ...(payload?.options || {}), play: false },
        };
        try {
          child.stdin.write(`SPEAK ${JSON.stringify(speakLine)}\n`);
          child.stdin.end();
        } catch (error) {
          failSpawn(error);
          return;
        }
        settled = true;
        resolve({ ok: true });
      });

      child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString('utf8');
        let newline = stdoutBuffer.indexOf('\n');
        while (newline !== -1) {
          const line = stdoutBuffer.slice(0, newline).trim();
          stdoutBuffer = stdoutBuffer.slice(newline + 1);
          if (line) {
            try {
              const event = JSON.parse(line);
              if (event?.type === 'tts-error') sawErrorEvent = true;
              sendEvent(event);
            } catch {
              // Non-JSON stdout noise (piper logs) — only relevant on failure.
            }
          }
          newline = stdoutBuffer.indexOf('\n');
        }
      });

      child.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString('utf8');
      });

      child.on('exit', (code) => {
        if (ttsChild === child) ttsChild = null;
        if (code && !sawErrorEvent) {
          sawErrorEvent = true;
          const detail = stderrBuffer.trim() || stdoutBuffer.trim();
          sendEvent({ type: 'tts-error', error: detail || 'tts failed' });
        }
      });
    });
  }

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
        killTtsChild();
        return { ok: true };
      }
      case VOICE_COMMANDS.SPEAK: {
        return handleSpeak(payload);
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

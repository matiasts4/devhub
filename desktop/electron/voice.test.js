'use strict';

/**
 * Unit tests for desktop/electron/voice.js — SPEAK spawns the Piper sidecar
 * and fans its line-delimited JSON events out via sendEvent. child_process is
 * mocked so no real Python/Piper runtime is required.
 */

const { EventEmitter } = require('events');
const fs = require('fs');

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

const { spawn } = require('child_process');
const { createVoiceHandler, isVoiceCommand, VOICE_COMMANDS, DEFERRED } = require('./voice');

function createFakeChild() {
  const child = new EventEmitter();
  child.stdin = { write: jest.fn(), end: jest.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  return child;
}

/** Flush the fake child through a successful spawn. */
function emitSpawn(child) {
  child.emit('spawn');
}

describe('electron voice handler', () => {
  let existsSyncSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    // fs is required live by voice.js; default to "script + venv python exist".
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  });

  afterEach(() => {
    existsSyncSpy.mockRestore();
  });

  test('exports keep their stable shapes', () => {
    expect(typeof createVoiceHandler).toBe('function');
    expect(typeof isVoiceCommand).toBe('function');
    expect(DEFERRED).toEqual({ ok: false, reason: 'voice-deferred-electron' });
  });

  test('non-SPEAK commands keep current behavior', () => {
    const handler = createVoiceHandler();
    expect(handler.handle(VOICE_COMMANDS.SET_ENABLED, { enabled: true })).toEqual({
      ok: true,
      enabled: true,
    });
    expect(handler.handle(VOICE_COMMANDS.START_ENGINE)).toEqual({ ...DEFERRED, command: VOICE_COMMANDS.START_ENGINE });
    expect(handler.handle(VOICE_COMMANDS.TOGGLE_RECORDING)).toEqual({
      ...DEFERRED,
      command: VOICE_COMMANDS.TOGGLE_RECORDING,
      recording: false,
    });
    const disabled = createVoiceHandler();
    expect(disabled.handle(VOICE_COMMANDS.TOGGLE_RECORDING)).toEqual({
      ok: false,
      reason: 'voice-disabled',
      error: 'voice disabled',
    });
    expect(handler.handle('nope')).toEqual({ reason: 'not-implemented', command: 'nope' });
  });

  test('SPEAK returns voice-tts-script-missing when the sidecar is absent', async () => {
    existsSyncSpy.mockReturnValue(false);
    const handler = createVoiceHandler();
    const result = await handler.handle(VOICE_COMMANDS.SPEAK, { text: 'hola' });
    expect(result).toEqual({ ok: false, reason: 'voice-tts-script-missing' });
    expect(spawn).not.toHaveBeenCalled();
  });

  test('SPEAK spawns the sidecar with play:false and resolves ok once spawned', async () => {
    const child = createFakeChild();
    spawn.mockReturnValue(child);
    const handler = createVoiceHandler();

    const pending = handler.handle(VOICE_COMMANDS.SPEAK, {
      text: 'hola',
      options: { voice: 'es_MX-claude-high', length_scale: 1.15 },
    });
    emitSpawn(child);
    const result = await pending;

    expect(result).toEqual({ ok: true });
    expect(spawn).toHaveBeenCalledTimes(1);
    const [pythonExe, args, opts] = spawn.mock.calls[0];
    expect(String(pythonExe)).toMatch(/python(\.exe)?$/);
    expect(args[0]).toMatch(/tts_engine\.py$/);
    expect(opts).toMatchObject({ windowsHide: true });
    expect(child.stdin.write).toHaveBeenCalledWith(
      `SPEAK ${JSON.stringify({
        text: 'hola',
        options: { voice: 'es_MX-claude-high', length_scale: 1.15, play: false },
      })}\n`
    );
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
  });

  test('forwards sidecar stdout JSON events via sendEvent', async () => {
    const child = createFakeChild();
    spawn.mockReturnValue(child);
    const events = [];
    const handler = createVoiceHandler({ sendEvent: (payload) => events.push(payload) });

    const pending = handler.handle(VOICE_COMMANDS.SPEAK, { text: 'hola' });
    emitSpawn(child);
    await pending;

    child.stdout.emit(
      'data',
      Buffer.from(
        '{"status":"tts-ready"}\n{"type":"tts-chunk","format":"wav","bytes_b64":"QUJD"}\n{"type":"tts-done","ok":true}\n'
      )
    );

    expect(events).toEqual([
      { status: 'tts-ready' },
      { type: 'tts-chunk', format: 'wav', bytes_b64: 'QUJD' },
      { type: 'tts-done', ok: true },
    ]);

    // Clean exit with no error event: nothing extra is emitted.
    child.emit('exit', 0);
    expect(events).toHaveLength(3);
  });

  test('emits tts-error from stderr on non-zero exit without an error event', async () => {
    const child = createFakeChild();
    spawn.mockReturnValue(child);
    const events = [];
    const handler = createVoiceHandler({ sendEvent: (payload) => events.push(payload) });

    const pending = handler.handle(VOICE_COMMANDS.SPEAK, { text: 'hola' });
    emitSpawn(child);
    await pending;

    child.stderr.emit('data', Buffer.from('boom: piper exploded\n'));
    child.emit('exit', 1);

    expect(events).toEqual([{ type: 'tts-error', error: 'boom: piper exploded' }]);
  });

  test('does not duplicate tts-error when the sidecar already emitted one', async () => {
    const child = createFakeChild();
    spawn.mockReturnValue(child);
    const events = [];
    const handler = createVoiceHandler({ sendEvent: (payload) => events.push(payload) });

    const pending = handler.handle(VOICE_COMMANDS.SPEAK, { text: 'hola' });
    emitSpawn(child);
    await pending;

    child.stdout.emit('data', Buffer.from('{"type":"tts-error","error":"no voice model"}\n'));
    child.emit('exit', 1);

    expect(events).toEqual([{ type: 'tts-error', error: 'no voice model' }]);
  });

  test('spawn failure resolves voice-tts-spawn-failed', async () => {
    const child = createFakeChild();
    spawn.mockReturnValue(child);
    const handler = createVoiceHandler();

    const pending = handler.handle(VOICE_COMMANDS.SPEAK, { text: 'hola' });
    child.emit('error', new Error('spawn python ENOENT'));
    const result = await pending;

    expect(result).toEqual({
      ok: false,
      reason: 'voice-tts-spawn-failed',
      error: 'spawn python ENOENT',
    });
  });

  test('STOP_SPEAK kills the running sidecar', async () => {
    const child = createFakeChild();
    spawn.mockReturnValue(child);
    const handler = createVoiceHandler();

    const pending = handler.handle(VOICE_COMMANDS.SPEAK, { text: 'hola' });
    emitSpawn(child);
    await pending;

    expect(handler.handle(VOICE_COMMANDS.STOP_SPEAK)).toEqual({ ok: true });
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  test('a new SPEAK kills the previous sidecar', async () => {
    const first = createFakeChild();
    const second = createFakeChild();
    spawn.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const handler = createVoiceHandler();

    const p1 = handler.handle(VOICE_COMMANDS.SPEAK, { text: 'uno' });
    emitSpawn(first);
    await p1;

    const p2 = handler.handle(VOICE_COMMANDS.SPEAK, { text: 'dos' });
    emitSpawn(second);
    await p2;

    expect(first.kill).toHaveBeenCalledTimes(1);
    expect(second.stdin.write).toHaveBeenCalledWith(expect.stringContaining('"text":"dos"'));
  });
});

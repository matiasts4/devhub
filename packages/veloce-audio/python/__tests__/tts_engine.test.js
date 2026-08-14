/* eslint-disable no-undef */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const IS_WIN = process.platform === 'win32';
const PYTHON = path.join(
  ROOT,
  'packages',
  'veloce-audio',
  'python',
  '.venv',
  IS_WIN ? 'Scripts' : 'bin',
  IS_WIN ? 'python.exe' : 'python'
);
const TTS = path.join(ROOT, 'packages', 'veloce-audio', 'python', 'tts_engine.py');

describe('tts_engine piper wiring', () => {
  test('SPEAK emits tts-chunk + tts-done when piper and voice model exist', () => {
    if (!require('fs').existsSync(PYTHON)) {
      return;
    }
    const result = spawnSync(PYTHON, [TTS], {
      // play:false keeps the test headless — no paplay/aplay in CI or Windows.
      input: 'SPEAK {"text":"hola","options":{"play":false}}\n',
      encoding: 'utf8',
      timeout: 120000,
    });
    const lines = String(result.stdout || '')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const err = lines.find((line) => line.type === 'tts-error');
    if (err) {
      throw new Error(err.error || 'tts-error');
    }
    const chunk = lines.find((line) => line.type === 'tts-chunk');
    expect(chunk?.bytes_b64?.length).toBeGreaterThan(0);
    expect(lines.some((line) => line.type === 'tts-done')).toBe(true);
  });

  test('falls back to an installed voice when the requested id is not downloaded', () => {
    if (!require('fs').existsSync(PYTHON)) {
      return;
    }
    const result = spawnSync(PYTHON, [TTS], {
      input: 'SPEAK {"text":"hola","options":{"voice":"xx_XX-nope-high","play":false}}\n',
      encoding: 'utf8',
      timeout: 120000,
    });
    const lines = String(result.stdout || '')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(lines.find((line) => line.type === 'tts-error')).toBeUndefined();
    expect(lines.find((line) => line.type === 'tts-chunk')?.bytes_b64?.length).toBeGreaterThan(0);
  });
});

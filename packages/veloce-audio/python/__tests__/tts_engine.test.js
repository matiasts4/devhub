/* eslint-disable no-undef */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const PYTHON = path.join(ROOT, 'packages', 'veloce-audio', 'python', '.venv', 'bin', 'python');
const TTS = path.join(ROOT, 'packages', 'veloce-audio', 'python', 'tts_engine.py');

describe('tts_engine piper wiring', () => {
  test('SPEAK emits tts-done when piper and voice model exist', () => {
    if (!require('fs').existsSync(PYTHON)) {
      return;
    }
    const result = spawnSync(PYTHON, [TTS], {
      input: 'SPEAK {"text":"hola"}\n',
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
    expect(lines.some((line) => line.type === 'tts-done')).toBe(true);
  });
});

/* eslint-disable no-undef */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// __dirname is .../packages/veloce-audio/python/__tests__ -- 4 levels below
// the repo root (packages/veloce-audio/python/__tests__), not 3. The
// previous 3-level join silently pointed PYTHON/TTS at a nonexistent
// packages/packages/... path, so this whole suite no-op'd on every platform.
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const PYTHON = path.join(ROOT, 'packages', 'veloce-audio', 'python', '.venv', 'bin', 'python');
const TTS = path.join(ROOT, 'packages', 'veloce-audio', 'python', 'tts_engine.py');

function findSystemPython() {
  for (const candidate of ['python3', 'python']) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return candidate;
  }
  return null;
}

describe('tts_engine piper wiring', () => {
  test('SPEAK emits tts-done when piper and voice model exist', () => {
    if (!fs.existsSync(PYTHON)) {
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

  // Pure-function checks (command building, text normalization, voice
  // resolution) that need only a stdlib Python 3 -- no Piper/venv/model
  // required, so this runs on every platform including Windows dev boxes.
  test('--selftest passes for the stdlib-only helpers', () => {
    const python = findSystemPython();
    if (!python) return;
    const result = spawnSync(python, [TTS, '--selftest'], { encoding: 'utf8', timeout: 15000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/tts_engine selftest OK/);
  });
});

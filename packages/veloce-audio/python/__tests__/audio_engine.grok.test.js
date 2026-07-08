/* eslint-disable no-undef */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// __dirname is .../packages/veloce-audio/python/__tests__ -- 4 levels below
// the repo root, same layout as tts_engine.test.js.
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const ENGINE = path.join(ROOT, 'packages', 'veloce-audio', 'python', 'audio_engine.py');
const VENV_PYTHON_UNIX = path.join(
  ROOT,
  'packages',
  'veloce-audio',
  'python',
  '.venv',
  'bin',
  'python'
);
const VENV_PYTHON_WIN = path.join(
  ROOT,
  'packages',
  'veloce-audio',
  'python',
  '.venv',
  'Scripts',
  'python.exe'
);

// Unlike tts_engine.py (stdlib-only), audio_engine.py unconditionally imports
// numpy + sounddevice at module load even in the lightweight Grok-only
// profile, so --selftest needs a Python that actually has them.
function findPythonWithNumpy() {
  const candidates = [VENV_PYTHON_WIN, VENV_PYTHON_UNIX, 'python3', 'python'];
  for (const candidate of candidates) {
    const isVenvPath = candidate === VENV_PYTHON_WIN || candidate === VENV_PYTHON_UNIX;
    if (isVenvPath && !fs.existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ['-c', 'import numpy, sounddevice'], { encoding: 'utf8' });
    if (probe.status === 0) return candidate;
  }
  return null;
}

describe('audio_engine Grok STT wiring', () => {
  // Pure-function checks (backend resolution incl. the LOCAL_ML_AVAILABLE
  // fallback, missing-API-key error message, multipart header building) --
  // no mic, model download, or real network call required.
  test('--selftest passes for the Grok STT helpers', () => {
    const python = findPythonWithNumpy();
    if (!python) return; // no numpy/sounddevice available in this environment -- skip like tts_engine's venv-gated test

    const result = spawnSync(python, [ENGINE, '--selftest'], { encoding: 'utf8', timeout: 30000 });
    if (result.status !== 0) {
      throw new Error(`selftest failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    }
    expect(result.stdout).toMatch(/audio_engine selftest OK/);
  });
});

#!/usr/bin/env node
/**
 * One-shot voice Python venv (Veloce-style) — runs at predev/prebuild, not on mic press.
 */
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IS_WIN = process.platform === 'win32';
const VENV_DIR = path.join(ROOT, 'packages', 'veloce-audio', 'python', '.venv');
const PYTHON = path.join(VENV_DIR, IS_WIN ? 'Scripts' : 'bin', IS_WIN ? 'python.exe' : 'python');
const MARKER = path.join(VENV_DIR, '.voice_deps_ok');
const REQ = path.join(ROOT, 'packages', 'veloce-audio', 'python', 'requirements.txt');
const VOICES_DIR = path.join(ROOT, 'packages', 'veloce-audio', 'python', 'voices');
// Windows (Electron) is TTS-only — ship the high-quality default there.
const VOICE_NAME = IS_WIN ? 'es_MX-claude-high' : 'es_ES-davefx-medium';
const VOICE_ONNX = path.join(VOICES_DIR, `${VOICE_NAME}.onnx`);
const TORCH_CPU = 'https://download.pytorch.org/whl/cpu';
const PIPER_CHECK = IS_WIN
  ? "from pathlib import Path; import sys; p=Path(sys.prefix)/'Scripts'/'piper.exe'; raise SystemExit(0 if p.exists() else 1)"
  : "from pathlib import Path; import sys; p=Path(sys.prefix)/'bin'/'piper'; raise SystemExit(0 if p.exists() else 1)";
const STT_CHECK =
  "import importlib.util as u; mods=['numpy','sounddevice','faster_whisper','torch','torchaudio']; missing=[m for m in mods if u.find_spec(m) is None]; raise SystemExit(1 if missing else 0)";

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${result.status})`);
  }
}

function pythonOk(code) {
  try {
    execFileSync(PYTHON, ['-c', code], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function depsHealthy() {
  if (!fs.existsSync(PYTHON)) return false;
  // win32 is TTS-only (STT stays deferred on Electron) — no torch/whisper check.
  const sttOk = IS_WIN || pythonOk(STT_CHECK);
  const piperOk = pythonOk(PIPER_CHECK);
  const voiceOk = fs.existsSync(VOICE_ONNX);
  return sttOk && piperOk && voiceOk && fs.existsSync(MARKER);
}

function ensureVoiceModel() {
  if (fs.existsSync(VOICE_ONNX)) return;
  fs.mkdirSync(VOICES_DIR, { recursive: true });
  console.log(`[voice:ensure] Downloading Piper voice ${VOICE_NAME} (~60MB)…`);
  run(PYTHON, ['-m', 'piper.download_voices', VOICE_NAME], { cwd: VOICES_DIR });
}

function main() {
  if (process.platform !== 'linux' && process.platform !== 'win32') {
    console.log('[voice:ensure] skip (voice runtime only on linux/win32)');
    return;
  }

  if (depsHealthy()) {
    console.log('[voice:ensure] Voice Python venv already healthy');
    return;
  }

  const venvExists = fs.existsSync(PYTHON);
  const sttOk = venvExists && (IS_WIN || pythonOk(STT_CHECK));
  const piperOk = venvExists && pythonOk(PIPER_CHECK);

  if (venvExists && sttOk && piperOk && !fs.existsSync(VOICE_ONNX)) {
    ensureVoiceModel();
    fs.writeFileSync(MARKER, `ok\n${new Date().toISOString()}\n`);
    console.log('[voice:ensure] Piper voice model ready');
    return;
  }

  console.log('[voice:ensure] Building voice Python venv (one-time, ~2-5 min)…');

  if (!fs.existsSync(VENV_DIR)) {
    run(IS_WIN ? 'python' : 'python3', ['-m', 'venv', VENV_DIR]);
  }

  run(PYTHON, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  if (IS_WIN) {
    // TTS-only runtime — STT (torch/faster-whisper/sounddevice) stays
    // deferred on Electron, so don't pull those heavy deps here.
    run(PYTHON, ['-m', 'pip', 'install', 'piper-tts>=1.2.0']);
  } else {
    run(PYTHON, ['-m', 'pip', 'install', '-r', REQ]);
    run(PYTHON, ['-m', 'pip', 'install', 'torch', 'torchaudio', '--index-url', TORCH_CPU]);
  }

  ensureVoiceModel();

  fs.writeFileSync(MARKER, `ok\n${new Date().toISOString()}\n`);
  console.log('[voice:ensure] Voice Python venv ready at packages/veloce-audio/python/.venv');
}

try {
  main();
} catch (error) {
  console.error('[voice:ensure]', error.message || error);
  process.exit(1);
}

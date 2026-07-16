#!/usr/bin/env node
/**
 * Download an additional Piper voice for the DevHub Zed TTS engine.
 *
 * Usage:
 *   npm run voice:add-voice -- <piper-voice-id>
 * Example:
 *   npm run voice:add-voice -- es_AR-daniela-high
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VENV_DIR = path.join(ROOT, 'packages', 'veloce-audio', 'python', '.venv');
const PYTHON = path.join(VENV_DIR, 'bin', 'python');
const VOICES_DIR = path.join(ROOT, 'packages', 'veloce-audio', 'python', 'voices');

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${result.status})`);
  }
}

function main() {
  if (process.platform !== 'linux') {
    console.log('[voice:add-voice] skip (linux-only voice runtime)');
    return;
  }

  const voiceId = process.argv[2];
  if (!voiceId) {
    console.error('Usage: npm run voice:add-voice -- <piper-voice-id>');
    console.error('Example: npm run voice:add-voice -- es_AR-daniela-high');
    process.exit(1);
  }

  if (!fs.existsSync(PYTHON)) {
    console.error(
      '[voice:add-voice] Python venv not found. Run `npm run voice:ensure` first.'
    );
    process.exit(1);
  }

  if (!fs.existsSync(VOICES_DIR)) {
    fs.mkdirSync(VOICES_DIR, { recursive: true });
  }

  console.log(`[voice:add-voice] Downloading Piper voice ${voiceId}…`);
  run(PYTHON, ['-m', 'piper.download_voices', voiceId], { cwd: VOICES_DIR });
  console.log(`[voice:add-voice] Voice ${voiceId} ready at ${VOICES_DIR}`);
}

try {
  main();
} catch (error) {
  console.error('[voice:add-voice]', error.message || error);
  process.exit(1);
}

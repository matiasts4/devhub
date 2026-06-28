#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ICON_MARKER = path.join(ROOT, 'src-tauri', 'icons', 'icon.ico');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

function main() {
  if (fs.existsSync(ICON_MARKER)) {
    console.log('[generate-icon] Existing icon.ico found, skipping regeneration');
    return;
  }

  try {
    require.resolve('sharp');
  } catch (_error) {
    throw new Error(
      'icon.ico is missing and sharp is not installed. Run `pnpm add -D sharp` or commit src-tauri/icons/icon.ico'
    );
  }

  if (!run(process.execPath, ['scripts/generate-preview.js'])) process.exit(1);
  if (!run(process.execPath, ['scripts/generate-icon.js'])) process.exit(1);
  if (
    !run('npx', ['@tauri-apps/cli', 'icon', 'public/logo-square.png', '-o', 'src-tauri/icons'])
  ) {
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}
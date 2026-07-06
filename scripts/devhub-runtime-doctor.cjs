#!/usr/bin/env node
/**
 * Quick runtime doctor for installed + dev coexistence on Windows/Linux.
 * Read-only except optional --fix-stale-port-marker.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ports = [
  { port: 3100, role: 'Next dev (tauri dev)' },
  { port: 3400, role: 'Next installed standalone' },
  { port: 4000, role: 'Sidecar installed' },
  { port: 4001, role: 'Sidecar dev' },
];

function readPortMarker(homeSuffix) {
  const file = path.join(os.homedir(), homeSuffix, 'sidecar-port.txt');
  if (!fs.existsSync(file)) return { file, value: null };
  return { file, value: fs.readFileSync(file, 'utf8').trim() };
}

function listListeners(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano -p tcp | findstr :${port} | findstr LISTENING`, {
        encoding: 'utf8',
      });
      return out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    }
    const out = execSync(`ss -tlnp "sport = :${port}"`, { encoding: 'utf8' });
    return out.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

const fix = process.argv.includes('--fix-stale-port-marker');
const prodMarker = readPortMarker('.devhub');
const devMarker = readPortMarker('.devhub-dev');

console.log('DevHub runtime doctor\n');
console.log('Port markers:');
console.log(`  ${prodMarker.file} => ${prodMarker.value ?? '(missing)'}`);
console.log(`  ${devMarker.file} => ${devMarker.value ?? '(missing)'}`);

if (prodMarker.value === '4001') {
  console.log('\nWARN: Production home has dev sidecar port (4001). Installed app may share dev PTY.');
  if (fix) {
    fs.unlinkSync(prodMarker.file);
    console.log('OK: Removed stale production sidecar-port.txt (4001). Restart installed DevHub.');
  } else {
    console.log('   Run: node scripts/devhub-runtime-doctor.cjs --fix-stale-port-marker');
  }
}

console.log('\nListeners:');
for (const { port, role } of ports) {
  const lines = listListeners(port);
  console.log(`  :${port} ${role}`);
  if (lines.length === 0) console.log('    (free)');
  else lines.forEach((line) => console.log(`    ${line}`));
}

console.log('\nRecommended dev launch: npm run tauri:dev  (not npm run dev alone)');
console.log('Coexistence: keep 3100/4001 (dev) separate from 3400/4000 (installed).');